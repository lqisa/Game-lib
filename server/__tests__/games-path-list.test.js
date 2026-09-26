import { describe, it, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import gameRouter from '../routes/game.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';

let baseUrl;
let server;

const request = async (path) => {
  const res = await fetch(new URL(path, baseUrl));
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
};

const PATH_LIST_KEYS = ['blacklist', 'archived_archives', 'archived_folders'];

const setSetting = (key, value) =>
  db.knex('setting').insert({ key, value }).onConflict('key').merge();

const clearSettings = async () => {
  await db.knex('setting').whereIn('key', PATH_LIST_KEYS).del();
};

const listGames = async (query = '?page=1&pageSize=50') => {
  const res = await request(`/api/games${query}`);
  assert.equal(res.status, 200);
  return { total: res.body.total, names: res.body.games.map((g) => g.name).sort() };
};

before(async () => {
  await initDatabase();
});

after(async () => {
  await closePool();
});

describe('GET /api/games path-list filtering', () => {
  beforeEach(async () => {
    await clearSettings();
    await db.knex('game').del();
    await db.knex('library').del();
    await db.insertLibrary({ name: 'L', path: 'D:/tmp/L' });
    // ids keep incrementing across the deletes above, so read the id back
    const library = await db.knex('library').orderBy('id', 'desc').first();
    const libraryId = library.id;
    await db.insertGame({ name: 'keep', library_id: libraryId, sub_path: 'keep/game.rar' });
    await db.insertGame({ name: 'blocked', library_id: libraryId, sub_path: 'blocked/game.rar' });
    await db.insertGame({ name: 'folder', library_id: libraryId, sub_path: 'archived/game.rar' });

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await clearSettings();
    if (server) await new Promise((r) => server.close(r));
  });

  it('lists every game when no settings exist', async () => {
    const { total, names } = await listGames();
    assert.equal(total, 3);
    assert.deepEqual(names, ['blocked', 'folder', 'keep']);
  });

  it('excludes blacklisted sub_paths and reports the filtered total', async () => {
    await setSetting('blacklist', JSON.stringify(['blocked/game.rar']));
    const { total, names } = await listGames();
    assert.deepEqual(names, ['folder', 'keep']);
    // total must reflect the filter, not the page size (regression guard)
    assert.equal(total, 2);
  });

  it('excludes archived archives and archived folders too', async () => {
    await setSetting('archived_archives', JSON.stringify(['blocked/game.rar']));
    await setSetting('archived_folders', JSON.stringify(['archived/game.rar']));
    const { total, names } = await listGames();
    assert.deepEqual(names, ['keep']);
    assert.equal(total, 1);
  });

  it('reports the filtered total on later pages, not the page length', async () => {
    await setSetting('blacklist', JSON.stringify(['blocked/game.rar']));
    const { total } = await listGames('?page=2&pageSize=1');
    assert.equal(total, 2);
  });

  it('treats an empty array as no exclusions', async () => {
    await setSetting('blacklist', JSON.stringify([]));
    const { total } = await listGames();
    assert.equal(total, 3);
  });

  // PUT /api/settings/:key lets a client write any value, so these are all reachable.
  // Spreading a JSON string would yield single characters instead of paths.
  for (const [label, raw] of [
    ['a JSON string', JSON.stringify('blocked/game.rar')],
    ['a JSON object', JSON.stringify({ a: 1 })],
    ['a JSON number', '42'],
    ['invalid JSON', '{{{not json'],
    ['an empty string', ''],
  ]) {
    it(`ignores a malformed value (${label}) instead of mis-filtering`, async () => {
      await setSetting('blacklist', raw);
      const { total, names } = await listGames();
      assert.equal(total, 3, 'malformed value must not exclude anything');
      assert.deepEqual(names, ['blocked', 'folder', 'keep']);
    });
  }
});
