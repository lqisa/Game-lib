/**
 * Fill in the R18 flag from the vendor's own metadata.
 *
 * Bangumi publishes a per-entry `nsfw` flag (`GET https://api.bgm.tv/v0/subjects/<id>`) and VNDB
 * rates its cover art (`image.sexual`, 0..2). Both beat guessing from the cover with the bundled
 * classifier - which is what the ~1285 Bangumi games in a typical library were left to, because
 * the flag was never carried from the scrape to adoption.
 *
 * Rows the user decided by hand (`r18_source = 'manual'`) are never touched. The script is
 * resumable: it skips rows that already carry a vendor verdict unless --include-vendor is given.
 *
 *   # look, change nothing
 *   GAME_LIB_PROD=1 node server/scripts/backfill-vendor-r18.js --limit 20
 *   # write (a VACUUM INTO snapshot is taken first)
 *   GAME_LIB_PROD=1 node server/scripts/backfill-vendor-r18.js --apply
 *
 * Requests are strictly sequential - one in flight, `--delay-ms` apart (default 1100ms, about one
 * per second) - and a 429/5xx answer is retried with backoff (honouring `Retry-After`) instead of
 * racing on, so the sources are never hammered. --limit N makes a trial run cheap.
 *
 * Options: --source bangumi|vndb|both (default both), --limit N, --delay-ms N (default 1100),
 *          --retries N (default 3), --vndb-min-sexual N (default 1), --include-vendor,
 *          --data-dir <dir>, --allow-test-data.
 */
import { resolveTargetDatabase, backupDatabase, sleep } from './target-db.js';

const argv = process.argv.slice(2);
const flagValue = (name, fallback = null) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : (argv[at + 1] ?? fallback);
};
const apply = argv.includes('--apply');
const sourceArg = String(flagValue('--source', 'both'));
const limit = Number(flagValue('--limit', '0')) || 0;
const delayMs = Number(flagValue('--delay-ms', '1100'));
const retries = Number(flagValue('--retries', '3'));
const vndbMinSexual = Number(flagValue('--vndb-min-sexual', '1'));
const includeVendor = argv.includes('--include-vendor');

const sources =
  sourceArg === 'both' ? ['bangumi', 'vndb'] : sourceArg.split(',').map((s) => s.trim());
for (const source of sources) {
  if (!['bangumi', 'vndb'].includes(source)) {
    console.error(`unknown --source "${source}" (bangumi, vndb or both)`);
    process.exit(2);
  }
}

const target = resolveTargetDatabase(argv);
console.log(`database : ${target.dbPath}`);
console.log(`mode     : ${apply ? 'APPLY (writes)' : 'dry run (no writes)'}`);
console.log(`sources  : ${sources.join(', ')}${limit ? `, limit ${limit}` : ''}`);
console.log(
  `pacing   : one request at a time, ${delayMs}ms apart, ${retries} retries with backoff`,
);

const db = await import('../database/db.js');
const { knex, getSetting } = db;

/**
 * One request, no retries. Returns the body, or a description of what went wrong and whether it is
 * worth trying again: 429 and 5xx mean "slow down / come back later", 404 means the entry is gone.
 */
const fetchJsonOnce = async (url, init) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  if (res.ok) return { body: await res.json() };
  const retryAfter = Number(res.headers.get('retry-after'));
  return {
    error: `HTTP ${res.status}`,
    retryable: res.status === 429 || res.status >= 500,
    waitMs: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : 0,
  };
};

/**
 * A request with backoff. The script is sequential on purpose (one request in flight, `--delay-ms`
 * apart), so this is the only place that could ever hammer a source: when the API answers 429/5xx
 * it waits - honouring `Retry-After`, otherwise 5s, 10s, 20s - instead of racing on and burning
 * through the list. A permanent failure (404, or retries exhausted) is thrown and the game is left
 * as it was, which keeps it a candidate for a later run.
 */
const fetchJson = async (url, init) => {
  let attempt = 0;
  for (;;) {
    try {
      const result = await fetchJsonOnce(url, init);
      if (result.body !== undefined) return result.body;
      if (!result.retryable || attempt >= retries) {
        const error = new Error(result.error);
        error.permanent = true;
        throw error;
      }
      const waitMs = result.waitMs || Math.min(5_000 * 2 ** attempt, 60_000);
      console.warn(
        `    ${result.error}: waiting ${Math.round(waitMs / 1000)}s (retry ${attempt + 1}/${retries})`,
      );
      await sleep(waitMs);
    } catch (err) {
      if (err.permanent) throw err;
      // fetch itself threw: a network failure or the 20s timeout is worth another try too.
      if (attempt >= retries) throw err;
      const waitMs = Math.min(5_000 * 2 ** attempt, 60_000);
      console.warn(
        `    ${err.message}: waiting ${Math.round(waitMs / 1000)}s (retry ${attempt + 1}/${retries})`,
      );
      await sleep(waitMs);
    }
    attempt += 1;
  }
};

/** Bangumi's per-entry adult flag. Returns true/false, or null when the entry is gone. */
const bangumiNsfw = async (subjectId, token) => {
  const headers = { 'User-Agent': 'game-lib/1.0' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const detail = await fetchJson(`https://api.bgm.tv/v0/subjects/${subjectId}`, { headers });
  return detail?.nsfw === true;
};

/** VNDB's cover rating: 0 safe, 1 suggestive, 2 explicit. Returns true/false, or null. */
const vndbNsfw = async (vnId) => {
  const data = await fetchJson('https://api.vndb.org/kana/vn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters: ['id', '=', vnId], fields: 'image.sexual', results: 1 }),
  });
  const sexual = data?.results?.[0]?.image?.sexual;
  if (typeof sexual !== 'number') return null; // no cover: nothing to judge, stay unknown
  return sexual >= vndbMinSexual;
};

const vendorFilter = includeVendor
  ? "(g.r18_source IS NULL OR g.r18_source IN ('ml', 'vendor'))"
  : "(g.r18_source IS NULL OR g.r18_source = 'ml')";

const baseQuery = () =>
  knex('game as g')
    .join('game_source as gs', 'gs.game_id', 'g.id')
    .whereIn('gs.source_type', sources)
    .whereRaw(vendorFilter);

// The total is what says how long a full run takes, so it is printed even when --limit caps the
// actual scan.
const totalCandidates = (await baseQuery().countDistinct('g.id as n').first()).n;

const candidates = await baseQuery()
  .modify((q) => {
    if (limit > 0) q.limit(limit);
  })
  .orderBy('g.id')
  .select('g.id as gameId', 'g.name', 'gs.source_type as sourceType', 'gs.source_id as sourceId');

const manualSkipped = await knex('game as g')
  .join('game_source as gs', 'gs.game_id', 'g.id')
  .whereIn('gs.source_type', sources)
  .where('g.r18_source', 'manual')
  .count('g.id as n')
  .first();

// The per-item cost is the pacing gap *plus* the request itself (measured: 0.6-1.2s per Bangumi
// entry), which is why the run takes noticeably longer than "one second per game".
const etaMinutes = Math.round((totalCandidates * (delayMs + 900)) / 60_000);
console.log(
  `candidates: ${candidates.length}${limit ? ` of ${totalCandidates} (--limit ${limit})` : ''}` +
    ` | vendor+manual verdicts kept: ${manualSkipped.n} manual` +
    ` | full run would take about ${etaMinutes} min`,
);
if (candidates.length === 0) {
  await db.closePool();
  process.exit(0);
}

const bangumiToken = (await getSetting('bangumi_token')) || '';
const decided = [];
let failed = 0;
let noOpinion = 0;
const startedAt = Date.now();

// A trial run has to show its work: with 50 candidates or fewer every request prints a line, its
// duration included, so "did it really call the API?" is answerable at a glance instead of after
// twenty silent seconds. Longer runs print every 25th.
const printEvery = candidates.length <= 50 ? 1 : 25;

const reportProgress = (position, label, verdict, elapsedMs) => {
  if (position % printEvery !== 0 && position !== candidates.length) return;
  const elapsed = Date.now() - startedAt;
  const perItemMs = elapsed / position;
  const leftMin = Math.ceil((perItemMs * (candidates.length - position)) / 60_000);
  console.log(
    `  [${position}/${candidates.length}] ${label} -> ${verdict} (${elapsedMs}ms) | decided ${decided.length}, ` +
      `unknown ${noOpinion}, failed ${failed}, ~${leftMin} min left`,
  );
};

for (const [index, row] of candidates.entries()) {
  const label = `${row.sourceType}:${row.sourceId}`;
  const position = index + 1;
  const itemStartedAt = Date.now();
  try {
    const nsfw =
      row.sourceType === 'bangumi'
        ? await bangumiNsfw(row.sourceId, bangumiToken)
        : await vndbNsfw(row.sourceId);
    if (nsfw === null) {
      noOpinion += 1;
      reportProgress(
        position,
        label,
        'no flag published, left unknown',
        Date.now() - itemStartedAt,
      );
    } else {
      decided.push({ gameId: row.gameId, r18: nsfw ? 1 : 0 });
      reportProgress(position, label, `r18=${nsfw ? 1 : 0}`, Date.now() - itemStartedAt);
    }
  } catch (err) {
    failed += 1;
    // Failures print on their own line: they need attention, and a re-run picks them up.
    console.warn(`  [${position}/${candidates.length}] ${label} -> failed: ${err.message}`);
  }
  if (index < candidates.length - 1) await sleep(delayMs);
}

const r18Count = decided.filter((d) => d.r18 === 1).length;
console.log(
  `\nwould set: ${decided.length} games (${r18Count} R18, ${decided.length - r18Count} safe), ` +
    `no flag published: ${noOpinion}, failed: ${failed}`,
);

if (!apply) {
  console.log('dry run - nothing was written. Add --apply to store these verdicts.');
  await db.closePool();
  process.exit(0);
}

const backupPath = await backupDatabase(knex, target.dbPath);
console.log(`backup   : ${backupPath}`);

let updated = 0;
for (let i = 0; i < decided.length; i += 100) {
  const batch = decided.slice(i, i + 100);
  await knex.transaction(async (trx) => {
    for (const { gameId, r18 } of batch) {
      updated += await trx('game').where({ id: gameId }).update({ r18, r18_source: 'vendor' });
    }
  });
}
console.log(`updated  : ${updated} games with a vendor verdict`);

await db.closePool();
