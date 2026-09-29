/**
 * Remove cover files that nothing points at any more.
 *
 * The covers directory holds two kinds of file: a game's cover, named by `game.cover_path`, and a
 * search-result thumbnail, named by the `coverUrl` inside a `search_cache` row (see routes/cache.js).
 * Everything else is debris - a deleted game, a replaced manual cover, a keyword whose cache rows are
 * long gone. Both kinds of reference are counted here, which is what keeps the sweep honest: on the
 * dev library that was 511 files / ~70 MB, not the ~6700 files an earlier count claimed by looking
 * at `game.cover_path` alone (most `search_*` thumbnails were still referenced by a live cache row).
 *
 * Dry run by default; `--apply` deletes, and takes a database snapshot first. Files touched within
 * the grace period are left alone, so a download that is still in flight cannot be removed from
 * under itself. Note what the snapshot does and does not cover: it protects the database, while the
 * deleted files are only ever ones that no row and no cached search result mentions any more.
 *
 * Which library is touched has to be named explicitly - see target-db.js - so a bare run inside the
 * repo cannot sweep the dev copy by accident.
 *
 *   GAME_LIB_PROD=1 node server/scripts/clean-orphan-covers.js
 *   GAME_LIB_PROD=1 node server/scripts/clean-orphan-covers.js --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveTargetDatabase, backupDatabase } from './target-db.js';

const GRACE_MINUTES = 10;
const argv = process.argv.slice(2);
const apply = argv.includes('--apply');

const target = resolveTargetDatabase(argv);
console.log(`database : ${target.dbPath}`);
console.log(`mode     : ${apply ? 'APPLY (deletes files)' : 'dry run (no writes)'}`);

// Both modules fix their paths on import, so they are loaded after the target is known.
const { COVERS_DIR, coverNamesFromResults } = await import('../scraper/cover.js');
const db = await import('../database/db.js');
const { knex, closePool } = db;

const referencedNames = async () => {
  const names = new Set();
  const games = await knex('game').whereNotNull('cover_path').select('cover_path');
  for (const row of games) {
    if (row.cover_path) names.add(path.basename(row.cover_path).toLowerCase());
  }
  const cached = await knex('search_cache').select('results');
  for (const row of cached) {
    let results = [];
    try {
      results = JSON.parse(row.results) ?? [];
    } catch {
      // A row that cannot be parsed cannot be pointing at a file either.
    }
    for (const name of coverNamesFromResults(results)) names.add(name.toLowerCase());
  }
  return names;
};

const main = async () => {
  if (!fs.existsSync(COVERS_DIR)) {
    console.log(`no covers directory at ${COVERS_DIR}`);
    return;
  }
  const referenced = await referencedNames();
  const cutoff = Date.now() - GRACE_MINUTES * 60 * 1000;
  const files = fs.readdirSync(COVERS_DIR).filter((name) => {
    const stat = fs.statSync(path.join(COVERS_DIR, name));
    return stat.isFile();
  });
  const orphans = files.filter((name) => {
    if (referenced.has(name.toLowerCase())) return false;
    return fs.statSync(path.join(COVERS_DIR, name)).mtimeMs < cutoff;
  });
  const orphanBytes = orphans.reduce(
    (sum, name) => sum + fs.statSync(path.join(COVERS_DIR, name)).size,
    0,
  );

  console.log(`covers directory : ${COVERS_DIR}`);
  console.log(`files            : ${files.length}`);
  console.log(`still referenced : ${referenced.size}`);
  console.log(
    `orphaned         : ${orphans.length} (${(orphanBytes / 1024 / 1024).toFixed(1)} MB)`,
  );
  for (const name of orphans.slice(0, 10)) console.log(`  ${name}`);
  if (orphans.length > 10) console.log(`  ... and ${orphans.length - 10} more`);

  if (!apply) {
    console.log('\nDry run - nothing was deleted. Re-run with --apply to delete these files.');
    return;
  }

  const backupPath = await backupDatabase(knex, target.dbPath);
  console.log(`backup   : ${backupPath}`);

  let removed = 0;
  for (const name of orphans) {
    try {
      fs.rmSync(path.join(COVERS_DIR, name), { force: true });
      removed += 1;
    } catch (err) {
      console.warn(`  could not remove ${name}: ${err.message}`);
    }
  }
  console.log(`\nRemoved ${removed} file(s), ${(orphanBytes / 1024 / 1024).toFixed(1)} MB.`);
};

try {
  await main();
} finally {
  await closePool();
}
