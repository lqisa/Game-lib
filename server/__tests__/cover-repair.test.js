import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import coverRouter from '../routes/cover.js';
import gameRouter from '../routes/game.js';
import cacheRouter from '../routes/cache.js';
import * as db from '../database/db.js';
import { closePool } from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { COVERS_DIR } from '../scraper/cover.js';

/**
 * The list page asks /cover/repair about every game it renders that has no cover_path. A game
 * that was never scraped has no game_source row at all, so there is no URL the repair pass
 * could ever resolve a cover from. It used to disappear into the join and be reported as
 * "nothing to do", which left the client unable to tell "no cover to repair" from
 * "repairable", so it asked about the same game on every list load.
 *
 * The per-game signals these tests pin: the list says whether a game has a source, and the
 * repair response names the ids it could not even try.
 */

let baseUrl;
let server;
let libraryId;

const request = async (method, urlPath, body) => {
  const res = await fetch(new URL(urlPath, baseUrl), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
};

// Games are never deleted between tests: the test db is in-memory and ids restart when the
// table empties, which would make a later test reuse an id the server already remembers as a
// recent failure. Every test seeds its own games and looks them up by id instead.
const seedGame = async (name, { source = null } = {}) => {
  await db.insertGame({ name, library_id: libraryId, sub_path: `${name}/g.rar`, cover_path: null });
  const game = await db.knex('game').orderBy('id', 'desc').first();
  if (source) {
    await db.knex('game_source').insert({
      game_id: game.id,
      source_type: source.type,
      source_id: source.id,
      source_url: null,
      name,
      raw_data: null,
    });
  }
  return game.id;
};

// A source whose cover URL is not derivable from the id and whose detail fetch is unsupported,
// so the repair worker resolves nothing without touching the network - the same shape a real
// dead source has, and the cheapest way to test "this one was attempted".
const UNRESOLVABLE_SOURCE = { type: 'dlsite', id: 'not-a-code' };

// Cleaning up cover files needs real files in the covers directory. Where that directory cannot be
// written (a confined run) the tests skip instead of failing on the environment, so the ones that
// do run still mean something.
const writtenCoverFiles = [];
const writeCoverFile = (name) => {
  try {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    fs.writeFileSync(path.join(COVERS_DIR, name), 'x');
    writtenCoverFiles.push(name);
    return true;
  } catch {
    return false;
  }
};
const coverFileExists = (name) => fs.existsSync(path.join(COVERS_DIR, name));

before(async () => {
  await initDatabase();
  await db.knex('game_source').del();
  await db.knex('game').del();
  await db.knex('library').del();
  await db.insertLibrary({ name: 'L', path: 'D:/tmp/L' });
  libraryId = (await db.knex('library').orderBy('id', 'desc').first()).id;

  const app = express();
  app.use(express.json());
  app.use('/api/games', gameRouter);
  app.use('/api/cover', coverRouter);
  app.use('/api/cache', cacheRouter);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  for (const name of writtenCoverFiles) fs.rmSync(path.join(COVERS_DIR, name), { force: true });
  await closePool();
});

describe('the list says whether a cover can be repaired at all', () => {
  it('marks a game with no source row as having no source', async () => {
    const id = await seedGame('never-scraped');
    const res = await request('GET', '/api/games?pageSize=0');
    const game = res.body.games.find((g) => g.id === id);
    assert.equal(game.hasSource, false);
  });

  it('marks a game with a source row as having one', async () => {
    const id = await seedGame('scraped', { source: UNRESOLVABLE_SOURCE });
    const res = await request('GET', '/api/games?pageSize=0');
    const game = res.body.games.find((g) => g.id === id);
    assert.equal(game.hasSource, true);
  });

  it('does not let a source with a null name hide the source', async () => {
    // sourceName only exists for sources that carry one; it must not be what decides this.
    const id = await seedGame('scraped-no-name', { source: UNRESOLVABLE_SOURCE });
    await db.knex('game_source').where({ game_id: id }).update({ name: null });
    const res = await request('GET', '/api/games?pageSize=0');
    const game = res.body.games.find((g) => g.id === id);
    assert.equal(game.hasSource, true);
    assert.equal(game.sourceName, null);
  });

  it('flags a cover_path whose file is not on disk as missing', async () => {
    // A cover_path can outlive its file (a swapped data directory, a manual clean, a scrape that
    // died between the row and the write). The client only sees the string, so without this flag
    // that card keeps its placeholder forever and the repair pass never hears about it.
    const id = await seedGame('stale-cover-path');
    await db.knex('game').where({ id }).update({ cover_path: 'not-on-disk-anywhere.jpg' });
    const res = await request('GET', '/api/games?pageSize=0');
    const game = res.body.games.find((g) => g.id === id);
    assert.equal(game.coverMissing, true);
  });

  it('does not flag a cover whose file is on disk', async (t) => {
    // The file is created here rather than borrowed from the directory: other test files run in
    // parallel and write into the same covers directory, so any name we did not create ourselves
    // can vanish between the list request and the assertion.
    const name = `test-on-disk-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    if (!writeCoverFile(name)) return t.skip('cannot write into the covers directory here');
    const id = await seedGame('cover-on-disk');
    await db.knex('game').where({ id }).update({ cover_path: name });
    const res = await request('GET', '/api/games?pageSize=0');
    const game = res.body.games.find((g) => g.id === id);
    assert.equal(game.coverMissing, false);
  });

  it('does not call a game that never had a cover_path missing', async () => {
    const id = await seedGame('never-had-a-cover');
    const res = await request('GET', '/api/games?pageSize=0');
    const game = res.body.games.find((g) => g.id === id);
    assert.equal(game.coverMissing, false);
  });
});

describe('POST /api/cover/repair', () => {
  it('names a game that has no source instead of pretending it tried', async () => {
    const id = await seedGame('never-scraped-repair');
    const res = await request('POST', '/api/cover/repair', { gameIds: [id], limit: 8 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.noSource, [id]);
    assert.equal(res.body.attempted, 0);
    assert.deepEqual(res.body.repaired, []);
  });

  it('still attempts a game whose source exists but whose cover cannot be resolved', async () => {
    const id = await seedGame('has-source-repair', { source: UNRESOLVABLE_SOURCE });
    const res = await request('POST', '/api/cover/repair', { gameIds: [id], limit: 8 });
    assert.equal(res.body.attempted, 1);
    assert.deepEqual(res.body.noSource, []);
  });

  it('sorts source-less games from repairable ones inside one request', async () => {
    const withoutSource = await seedGame('mixed-never-scraped');
    const withSource = await seedGame('mixed-has-source', { source: UNRESOLVABLE_SOURCE });
    const res = await request('POST', '/api/cover/repair', {
      gameIds: [withoutSource, withSource],
      limit: 8,
    });
    assert.deepEqual(res.body.noSource, [withoutSource]);
    assert.equal(res.body.attempted, 1);
  });

  it('tries one source per game instead of downloading one cover per source row', async () => {
    // A game can carry several sources (adopted from two vendors). They are alternatives for the
    // same cover, so counting them as two attempts downloaded the same file twice, in parallel,
    // with the winner written last.
    const id = await seedGame('two-sources');
    await db.knex('game_source').insert([
      {
        game_id: id,
        source_type: 'dlsite',
        source_id: 'not-a-code',
        source_url: null,
        name: 'two-sources',
        raw_data: null,
      },
      {
        game_id: id,
        source_type: 'dlsite',
        source_id: 'also-not-a-code',
        source_url: null,
        name: 'two-sources',
        raw_data: null,
      },
    ]);
    const res = await request('POST', '/api/cover/repair', { gameIds: [id], limit: 8 });
    assert.equal(res.body.attempted, 1, 'one game is one attempt');
  });

  it('names the ids that can never be resolved instead of only counting them', async () => {
    // A count cannot be turned back into ids, so the client could never cross these games off and
    // kept asking about them on every list load.
    const id = await seedGame('nothing-to-go-on', { source: UNRESOLVABLE_SOURCE });
    const res = await request('POST', '/api/cover/repair', { gameIds: [id], limit: 8 });
    assert.deepEqual(res.body.hopelessIds, [id]);
  });

  it('does not write off a game whose source can simply be re-read', async () => {
    // vndb/bangumi/dmm/steam have no derivable cover URL, so the only way is re-reading the entry.
    // Nothing came back here (no id to read), but that is not proof it can never resolve - the
    // next pass may well succeed, and writing it off would be wrong.
    const id = await seedGame('rereadable-source', { source: { type: 'vndb', id: '' } });
    const res = await request('POST', '/api/cover/repair', { gameIds: [id], limit: 8 });
    assert.equal(res.body.attempted, 1);
    assert.deepEqual(res.body.hopelessIds, []);
  });

  it('reports no source-less ids when there is nothing to ask about', async () => {
    const res = await request('POST', '/api/cover/repair', { gameIds: [], limit: 8 });
    assert.deepEqual(res.body, {
      repaired: [],
      missing: 0,
      attempted: 0,
      hopelessIds: [],
      noSource: [],
    });
  });
});

describe('GET /api/cover/:filename', () => {
  // The filename the old route joined onto COVERS_DIR came straight from the URL, and Express
  // percent-decodes it, so `..%2F..%2Fpackage.json` escaped the covers directory and served any
  // file the server can read (proven against the running app: it returned the whole db.sqlite3).
  // Nothing uses this route - the client loads covers from the /covers static mount - so the
  // whole route is gone. These pin that it stays gone, in both separator styles.
  it('does not serve a file outside the covers directory', async () => {
    const res = await request('GET', '/api/cover/..%2F..%2Fpackage.json');
    assert.equal(res.status, 404);
    assert.ok(!String(res.body).includes('"name": "game-lib"'), 'leaked package.json');
  });

  it('does not serve one through a backslash either', async () => {
    const res = await request('GET', '/api/cover/..%5C..%5Cpackage.json');
    assert.equal(res.status, 404);
    assert.ok(!String(res.body).includes('"name": "game-lib"'), 'leaked package.json');
  });
});

describe('deleting a game takes its cover file with it', () => {
  // The covers directory is not a table, so nothing cascades: without this, every deleted game
  // leaves its cover behind and the directory only grows.
  it('removes the file when no other game points at it', async (t) => {
    const name = `test-delete-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    if (!writeCoverFile(name)) return t.skip('cannot write into the covers directory here');
    const id = await seedGame('deletable-game');
    await db.knex('game').where({ id }).update({ cover_path: name });

    const res = await request('DELETE', `/api/games/${id}`);

    assert.equal(res.status, 204);
    assert.equal(coverFileExists(name), false, 'the cover file should be gone');
  });

  it('keeps the file while another game still points at it', async (t) => {
    const name = `test-shared-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    if (!writeCoverFile(name)) return t.skip('cannot write into the covers directory here');
    const keep = await seedGame('keeps-the-cover');
    const drop = await seedGame('drops-the-shared-cover');
    await db.knex('game').whereIn('id', [keep, drop]).update({ cover_path: name });

    await request('DELETE', `/api/games/${drop}`);

    assert.equal(coverFileExists(name), true, 'a shared cover must survive');
    fs.rmSync(path.join(COVERS_DIR, name), { force: true });
  });
});

describe('deleting a cached search takes its thumbnails with it', () => {
  // Search results cache a local copy of every thumbnail in the covers directory. Dropping the
  // cache rows without the files is what left thousands of `search_*` files behind.
  it('removes a thumbnail no cached row references any more', async (t) => {
    const name = `search_dlsite_RJ${Date.now()}.jpg`;
    if (!writeCoverFile(name)) return t.skip('cannot write into the covers directory here');
    const key = `k1-${Date.now()}`;
    await db.setSearchCache({
      key,
      source: 'dlsite',
      keyword: 'one',
      results: [{ id: 'RJ1', coverUrl: `/covers/${name}` }],
    });

    const res = await request('DELETE', `/api/cache/search?keys=${key}`);

    assert.equal(res.status, 200);
    assert.equal(coverFileExists(name), false, 'the thumbnail should be gone');
  });

  it('keeps a thumbnail another cached row still references', async (t) => {
    const name = `search_dlsite_RJ${Date.now()}b.jpg`;
    if (!writeCoverFile(name)) return t.skip('cannot write into the covers directory here');
    const stamp = Date.now();
    for (const [key, keyword] of [
      [`k2-${stamp}`, 'two'],
      [`k3-${stamp}`, 'three'],
    ]) {
      await db.setSearchCache({
        key,
        source: 'dlsite',
        keyword,
        results: [{ id: 'RJ2', coverUrl: `/covers/${name}` }],
      });
    }

    await request('DELETE', `/api/cache/search?keys=k2-${stamp}`);
    assert.equal(coverFileExists(name), true, 'the other cached row still shows it');

    await request('DELETE', `/api/cache/search?keys=k3-${stamp}`);
    assert.equal(coverFileExists(name), false, 'the last reference clears it');
    fs.rmSync(path.join(COVERS_DIR, name), { force: true });
  });
});
