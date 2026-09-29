/**
 * Clear the classifier's old R18 verdicts so the worker can decide them again.
 *
 * Every `ml` verdict in the library was written by a pipeline that fed the model a 0..1 image while
 * nsfwjs normalizes by 255 itself: the output stopped depending on the input, so all of them say
 * "safe" (measured: 1430 verdicts, not one R18). Fixing the pipeline changes nothing on its own -
 * the polling query only ever looks at rows whose `r18` is still NULL.
 *
 * Only `ml` rows are touched. `vendor` (DLSite/DMM/Bangumi metadata) and `manual` (your own marks)
 * are decisions, not guesses, and stay. Rows without a cover are left alone as well: the classifier
 * cannot redo them, so clearing them would only turn a wrong answer into an unknown one.
 *
 *   # look, change nothing
 *   GAME_LIB_PROD=1 node server/scripts/reset-ml-r18.js
 *   # write (a VACUUM INTO snapshot is taken first)
 *   GAME_LIB_PROD=1 node server/scripts/reset-ml-r18.js --apply
 *
 * Options: --only bangumi|dlsite|vndb|steam|dmm, --include-coverless, --data-dir <dir>,
 *          --allow-test-data.
 */
import { resolveTargetDatabase, backupDatabase } from './target-db.js';

const argv = process.argv.slice(2);
const flagValue = (name, fallback = null) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : (argv[at + 1] ?? fallback);
};
const apply = argv.includes('--apply');
const only = flagValue('--only');
const includeCoverless = argv.includes('--include-coverless');

const target = resolveTargetDatabase(argv);
console.log(`database : ${target.dbPath}`);
console.log(`mode     : ${apply ? 'APPLY (writes)' : 'dry run (no writes)'}`);

const db = await import('../database/db.js');
const { knex } = db;

const scope = () => {
  let q = knex('game').where('r18_source', 'ml');
  if (only) {
    q = q.whereIn('id', function () {
      this.select('game_id').from('game_source').where('source_type', only);
    });
  }
  if (!includeCoverless) {
    q = q.whereNotNull('cover_path').where('cover_path', '<>', '');
  }
  return q;
};

const rows = await scope().select('id', 'r18', 'r18_source');
const byVerdict = rows.reduce((acc, row) => {
  const key = `r18=${row.r18}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

let coverlessKept = 0;
if (!includeCoverless) {
  const coverless = await knex('game')
    .where('r18_source', 'ml')
    .where((q) => q.whereNull('cover_path').orWhere('cover_path', ''))
    .count('id as n')
    .first();
  coverlessKept = coverless.n;
}

console.log(`ml verdicts in scope : ${rows.length} ${JSON.stringify(byVerdict)}`);
if (only) console.log(`restricted to source : ${only}`);
if (coverlessKept > 0) {
  console.log(
    `kept (no cover to re-classify): ${coverlessKept} - add --include-coverless to clear them too`,
  );
}
console.log(`vendor + manual verdicts are never touched.`);

if (rows.length === 0) {
  console.log('nothing to clear.');
  await db.closePool();
  process.exit(0);
}

if (!apply) {
  console.log('dry run - nothing was written. Add --apply to clear them.');
  await db.closePool();
  process.exit(0);
}

const backupPath = await backupDatabase(knex, target.dbPath);
console.log(`backup   : ${backupPath}`);

const ids = rows.map((row) => row.id);
let cleared = 0;
for (let i = 0; i < ids.length; i += 200) {
  cleared += await knex('game')
    .whereIn('id', ids.slice(i, i + 200))
    .update({ r18: null, r18_source: null });
}
console.log(`cleared  : ${cleared} games are unknown again`);
console.log(
  'next     : the NSFW worker re-classifies them (60s poll), or restart the app to start it now.',
);

await db.closePool();
