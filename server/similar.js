import * as db from './database/db.js';
import { cleanName, similarityOfClean } from './scraper/match.js';

/**
 * Suspected-similar detection: two DIFFERENT game rows whose vendor names are >= 90%
 * alike are almost certainly the same game downloaded twice (folder + archive, two
 * archives, ...). The score comes from the same similarity() the keyword matcher uses,
 * computed over `game_source.name` only - local folder names are unreliable (renames,
 * scene releases), so they are not evidence.
 *
 * Results land in `game_similar`, one row per pair that actually passed the threshold.
 * Nothing is inferred transitively: A~B and B~C never creates A~C.
 */

const SIMILAR_THRESHOLD = 0.9;
// Yield to the event loop after this many comparisons so the API stays responsive while a
// background scan is running.
const YIELD_EVERY = 4000;
const INSERT_BATCH = 500;
const SCAN_DONE_KEY = 'similar_scan_done';
const SCAN_CURSOR_KEY = 'similar_scan_max_id';

const getCursorId = async () =>
  Number((await db.knex('setting').where({ key: SCAN_CURSOR_KEY }).first())?.value || 0);

const setCursorId = (value) =>
  db
    .knex('setting')
    .insert({ key: SCAN_CURSOR_KEY, value: String(value) })
    .onConflict('key')
    .merge();

const setScanDone = () =>
  db.knex('setting').insert({ key: SCAN_DONE_KEY, value: '1' }).onConflict('key').merge();

/**
 * Reset the stored state before a full recompute. Extracted so the worker and the tests agree on
 * what "starting a full scan" means.
 *
 * The pairs go so the scan cannot keep stale ones, and `similar_scan_done` goes so a scan that is
 * interrupted - the app closes, the worker dies - is retried as a full scan instead of being
 * mistaken for a finished one. The cursor is deliberately kept: it is the incremental watermark,
 * and clearing it made the next incremental trigger treat the whole library as new and walk it
 * again under an "incremental" label, with the pairs table still empty.
 */
export const prepareFullScan = async () => {
  await db.knex('game_similar').del();
  await db.knex('setting').where({ key: SCAN_DONE_KEY }).del();
};

/**
 * One entry per game that has at least one vendor name. Names are cleaned ONCE here; the
 * pairwise pass only ever sees cleaned names, which is what keeps ~2M comparisons cheap
 * (~40s instead of minutes of repeated regex work).
 *
 * `names` is [[source_type, cleanedName], ...] - one per vendor. A game scraped from two
 * sites carries two names, and pairs are only formed ACROSS vendors.
 */
const loadGamesWithVendorNames = async () => {
  const rows = await db
    .knex('game_source')
    .whereNotNull('name')
    .where('name', '<>', '')
    .select('game_id', 'source_type', 'name');
  const byGame = new Map();
  for (const { game_id, source_type, name } of rows) {
    if (!byGame.has(game_id)) byGame.set(game_id, new Map());
    const perVendor = byGame.get(game_id);
    if (perVendor.has(source_type)) continue;
    const cleaned = cleanName(name).toLowerCase();
    if (cleaned) perVendor.set(source_type, cleaned);
  }
  return [...byGame.entries()]
    .map(([id, names]) => ({ id, names: [...names.entries()] }))
    .filter((game) => game.names.length > 0)
    .sort((a, b) => a.id - b.id);
};

/**
 * Best cross-vendor score between two games. Same-vendor names are skipped: two entries
 * from one site either share an id (that is the existing exact-duplicate signal, handled
 * separately) or are just different works on that site - neither is evidence of the same
 * game.
 */
const bestCrossVendorScore = (a, b) => {
  let best = 0;
  for (const [typeA, nameA] of a.names) {
    for (const [typeB, nameB] of b.names) {
      if (typeA === typeB) continue;
      const score = similarityOfClean(nameA, nameB);
      if (score > best) best = score;
      if (best >= SIMILAR_THRESHOLD) return best;
    }
  }
  return best;
};

/**
 * The whole computation, awaited - `runSimilarScan` is the thin task wrapper around this,
 * and tests call it directly.
 *
 * `full` recomputes every pair; otherwise only games above the cursor. Game ids only
 * grow, so the cursor is a complete description of what has been compared, and each game
 * is only compared against the rows below it - that is what keeps an incremental run at
 * "new games x library" instead of another full pass.
 *
 * A cancelled run advances the cursor only past the games it fully finished, so the next
 * run picks the tail up.
 */
export const computeSimilarPairs = async ({
  full = false,
  isCancelled = null,
  onProgress = null,
} = {}) => {
  const games = await loadGamesWithVendorNames();
  const cursorId = await getCursorId();
  const todoIds = new Set(
    games.filter((game) => full || game.id > cursorId).map((game) => game.id),
  );

  // Fewer than two games with vendor names leaves nothing to compare, but the cursor still
  // has to move so the next run does not redo this work.
  if (games.length < 2 || todoIds.size === 0) {
    const maxId = games.length > 0 ? games[games.length - 1].id : cursorId;
    if (maxId > cursorId) await setCursorId(maxId);
    return {
      comparisons: 0,
      pairs: 0,
      total: 0,
      lastFullyScannedId: maxId,
      cancelled: false,
      skipped: true,
    };
  }

  // Game at index i performs exactly i inner comparisons, so the total is known upfront
  // and progress can be reported without a second pass.
  const total = games.reduce((sum, game, i) => (todoIds.has(game.id) ? sum + i : sum), 0);

  const pending = [];
  const gameIds = new Set(games.map((g) => g.id));
  let comparisons = 0;
  let pairs = 0;
  let sinceYield = 0;
  let lastFullyScannedId = cursorId;
  let cancelled = false;

  outer: for (let i = 0; i < games.length; i++) {
    const x = games[i];
    if (!todoIds.has(x.id)) continue;
    for (let j = 0; j < i; j++) {
      const score = bestCrossVendorScore(x, games[j]);
      comparisons++;
      if (score >= SIMILAR_THRESHOLD) {
        pending.push({
          game_id_a: Math.min(x.id, games[j].id),
          game_id_b: Math.max(x.id, games[j].id),
          score,
        });
        pairs++;
      }
      if (++sinceYield >= YIELD_EVERY) {
        sinceYield = 0;
        onProgress?.(comparisons, total);
        await new Promise((resolve) => setImmediate(resolve));
        if (isCancelled?.()) {
          cancelled = true;
          break outer;
        }
      }
    }
    lastFullyScannedId = x.id;
  }

  // Drop rows whose game vanished mid-scan (the user can delete while a scan runs), then
  // write what is left in batches.
  for (let i = 0; i < pending.length; i += INSERT_BATCH) {
    const batch = pending.slice(i, i + INSERT_BATCH);
    const ids = new Set();
    for (const row of batch) {
      ids.add(row.game_id_a);
      ids.add(row.game_id_b);
    }
    const alive = new Set(
      (
        await db
          .knex('game')
          .whereIn('id', [...ids])
          .select('id')
      ).map((r) => r.id),
    );
    const writable = batch.filter(
      (row) =>
        alive.has(row.game_id_a) &&
        alive.has(row.game_id_b) &&
        gameIds.has(row.game_id_a) &&
        gameIds.has(row.game_id_b),
    );
    if (writable.length > 0) {
      await db
        .knex('game_similar')
        .insert(writable)
        .onConflict(['game_id_a', 'game_id_b'])
        .ignore();
    }
  }

  const maxId = cancelled
    ? Math.max(cursorId, lastFullyScannedId)
    : games.length > 0
      ? games[games.length - 1].id
      : cursorId;
  if (maxId > cursorId) await setCursorId(maxId);
  if (!cancelled) await setScanDone();

  return { comparisons, pairs, total, lastFullyScannedId, cancelled, skipped: false };
};
