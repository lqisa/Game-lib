import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';
import { computeSimilarPairs, prepareFullScan } from '../similar.js';

/**
 * The suspected-similar scan. The interesting rules are the ones the plan settled on:
 * pairs only form ACROSS vendors (same-vendor lookalikes are a different problem), only
 * pairs that actually pass the threshold are stored (no transitive inference), and the
 * duplicate filter unions them with the exact re-adoption signal.
 */

let libraryId;

const seedVendorGame = async (name, sources, { subPath } = {}) => {
  await db.insertGame({
    name,
    library_id: libraryId,
    sub_path: subPath || `${name}-${Math.random().toString(36).slice(2, 8)}`,
  });
  const game = await db.knex('game').orderBy('id', 'desc').first();
  for (const [sourceType, sourceId, vendorName] of sources) {
    await db.knex('game_source').insert({
      game_id: game.id,
      source_type: sourceType,
      source_id: sourceId,
      source_url: null,
      name: vendorName,
      raw_data: '{}',
    });
  }
  return game.id;
};

const pairIds = async () =>
  (await db.knex('game_similar').select('game_id_a', 'game_id_b')).map(
    (row) => `${row.game_id_a}:${row.game_id_b}`,
  );

const isPaired = async (a, b) => (await pairIds()).includes(`${Math.min(a, b)}:${Math.max(a, b)}`);

const resetScanState = async () => {
  await db.knex('game_similar').del();
  await db.knex('setting').whereIn('key', ['similar_scan_done', 'similar_scan_max_id']).del();
};

before(async () => {
  await initDatabase();
});

after(async () => {
  await closePool();
});

describe('similar-name scan', () => {
  let g1;
  let g2;
  let g3;
  let g4;
  let g5;

  beforeEach(async () => {
    await db.knex('game_source').del();
    await db.knex('game_similar').del();
    await db.knex('game').del();
    await db.knex('library').del();
    await db.insertLibrary({ name: 'L', path: 'D:/tmp/L' });
    libraryId = (await db.knex('library').orderBy('id', 'desc').first()).id;

    // Three vendors, one name - the same game downloaded three times.
    g1 = await seedVendorGame('Hoshi no Kemono', [['bangumi', '100', 'Hoshi no Kemono']]);
    g2 = await seedVendorGame('Hoshi no Kemono', [['dlsite', 'RJ100', 'Hoshi no Kemono']]);
    g3 = await seedVendorGame('Hoshi no Kemono', [['vndb', 'v100', 'Hoshi no Kemono']]);
    // Unrelated.
    g4 = await seedVendorGame('Unrelated Title', [['steam', '100', 'Unrelated Title']]);
    // Same name, but the SAME vendor as g1 (a different bangumi entry): the cross-vendor
    // rule must keep it away from g1 while still pairing it with the other two.
    g5 = await seedVendorGame('Hoshi no Kemono', [['bangumi', '200', 'Hoshi no Kemono']]);

    await resetScanState();
  });

  it('pairs the same name across vendors and forms the full clique', async () => {
    const result = await computeSimilarPairs({ full: true });
    // The clique (g1,g2,g3) is three pairs, and g5 pairs with g2 and g3 across vendors -
    // only g1<->g5 is missing, because those two share the bangumi vendor.
    assert.equal(result.pairs, 5);
    assert.ok(await isPaired(g1, g2));
    assert.ok(await isPaired(g1, g3));
    assert.ok(await isPaired(g2, g3));
    assert.ok(await isPaired(g5, g2));
    assert.ok(await isPaired(g5, g3));
  });

  it('never pairs two entries from the same vendor', async () => {
    await computeSimilarPairs({ full: true });
    assert.ok(!(await isPaired(g1, g5)), 'same vendor (bangumi) must not pair');
  });

  it('leaves unrelated games out', async () => {
    await computeSimilarPairs({ full: true });
    for (const other of [g1, g2, g3, g5]) {
      assert.ok(!(await isPaired(g4, other)), 'unrelated game must not pair');
    }
  });

  it('records the score with the lower id first', async () => {
    await computeSimilarPairs({ full: true });
    const row = await db
      .knex('game_similar')
      .where({ game_id_a: Math.min(g1, g2), game_id_b: Math.max(g1, g2) })
      .first();
    assert.ok(row, 'pair row exists');
    assert.ok(row.score >= 0.9);
    assert.ok(row.score <= 1);
  });

  it('is incremental: a new game pairs against the old library without redoing old pairs', async () => {
    await computeSimilarPairs({ full: true });
    const before = await pairIds();

    const g7 = await seedVendorGame('Hoshi no Kemono', [['dlsite', 'RJ777', 'Hoshi no Kemono']]);
    const result = await computeSimilarPairs({ full: false });

    assert.equal(result.pairs, 3, 'only the new game x cross-vendor library');
    assert.ok(await isPaired(g7, g1));
    assert.ok(await isPaired(g7, g3));
    assert.ok(await isPaired(g7, g5));
    assert.ok(!(await isPaired(g7, g2)), 'same vendor as g2 (dlsite)');
    for (const old of before) {
      assert.ok((await pairIds()).includes(old), 'old pairs survive the incremental run');
    }
  });

  it('reports the partners with folder/archive and creation date', async () => {
    // g2 becomes the archive-backed copy.
    await db.knex('game').where({ id: g2 }).update({ sub_path: 'Hoshi/game.zip' });
    await computeSimilarPairs({ full: true });

    const similar = await db.getSimilarGames(g1);
    assert.equal(similar.length, 3);
    const g1Info = similar.find((s) => s.gameId === g1);
    assert.equal(g1Info.isSelf, true, 'current game is included with isSelf flag');
    const g2Info = similar.find((s) => s.gameId === g2);
    assert.equal(g2Info.isArchive, true, 'zip sub_path is reported as an archive');
    assert.ok('dirCreatedAt' in g2Info, 'creation date is exposed for the keep/delete decision');
    assert.ok(g2Info.score >= 0.9);
  });

  it('the duplicate filter unions exact duplicates with suspected-similar pairs', async () => {
    await computeSimilarPairs({ full: true });
    const { games } = await db.getGames({ page: 1, pageSize: 50, duplicate: true });
    const ids = games.map((g) => g.id);
    for (const expected of [g1, g2, g3, g5]) {
      assert.ok(ids.includes(expected), 'a suspected-similar game is in the duplicate filter');
    }
    assert.ok(!ids.includes(g4), 'an unrelated game is not');

    const none = await db.getGames({ page: 1, pageSize: 50, duplicate: false });
    assert.deepEqual(
      none.games.map((g) => g.id),
      [g4],
    );
  });

  it('exposes the similar count and archive flag on the list payload', async () => {
    await db.knex('game').where({ id: g2 }).update({ sub_path: 'Hoshi/game.zip' });
    await computeSimilarPairs({ full: true });
    const { games } = await db.getGames({ page: 1, pageSize: 50 });
    const byId = new Map(games.map((g) => [g.id, g]));
    assert.equal(byId.get(g1).similarCount, 2);
    assert.equal(byId.get(g4).similarCount, 0);
    assert.equal(byId.get(g2).isArchive, true);
    assert.equal(byId.get(g1).isArchive, false);
  });
});

describe('starting a full scan', () => {
  beforeEach(async () => {
    await db.knex('game_source').del();
    await db.knex('game').del();
    await db.knex('library').del();
    await db.insertLibrary({ name: 'L', path: 'D:/tmp/L' });
    libraryId = (await db.knex('library').orderBy('id', 'desc').first()).id;
    await resetScanState();
  });

  const settingValue = async (key) =>
    (await db.knex('setting').where({ key }).first())?.value ?? null;

  it('keeps the incremental cursor so an interrupted scan cannot pass as incremental', async () => {
    // The pairs have to go (a full scan recomputes them) and the done flag has to go (so an
    // interrupted scan is retried as a full one at the next start). The cursor must NOT: clearing
    // it made the next incremental trigger see "everything is above the cursor" and quietly walk
    // the whole library again, under an "incremental" label.
    const a = await seedVendorGame('Stale A', [['bangumi', '900', 'Stale A']]);
    const b = await seedVendorGame('Stale B', [['dlsite', 'RJ900', 'Stale B']]);
    await db.knex('setting').insert({ key: 'similar_scan_max_id', value: '42' });
    await db.knex('setting').insert({ key: 'similar_scan_done', value: '1' });
    await db
      .knex('game_similar')
      .insert({ game_id_a: Math.min(a, b), game_id_b: Math.max(a, b), score: 0.99 });

    await prepareFullScan();

    assert.equal(await settingValue('similar_scan_max_id'), '42', 'the cursor survives');
    assert.equal(await settingValue('similar_scan_done'), null, 'a full scan is pending again');
    assert.deepEqual(await pairIds(), [], 'the stale pairs are gone');
  });
});
