import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import recentlyRouter from '../routes/recently.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';

let baseUrl;
let server;

const request = async (path, options = {}) => {
  const res = await fetch(new URL(path, baseUrl), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
};

const resetGames = async (count) => {
  await db.knex('recently').del();
  await db.knex('game').del();
  await db.knex('library').del();
  await db.insertLibrary({ name: 'L', path: 'D:/tmp/L' });
  const library = await db.knex('library').orderBy('id', 'desc').first();
  for (let i = 0; i < count; i++) {
    await db.insertGame({ name: `game-${i}`, library_id: library.id, sub_path: `g${i}/game.rar` });
  }
  return db.knex('game').orderBy('id').pluck('id');
};

// touchedAt / openedAt write explicit timestamps so ordering does not depend on how fast the
// test machine gets through a loop (two `CURRENT_TIMESTAMP` writes in the same second tie).
const touchAt = (gameId, openedAt) =>
  db.knex('recently')
    .insert({ game_id: gameId, opened_at: openedAt })
    .onConflict('game_id')
    .merge(['opened_at']);

before(async () => {
  await initDatabase();
});

after(async () => {
  await closePool();
});

describe('GET /api/recently', () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/recently', recentlyRouter);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('returns an empty list before anything was opened', async () => {
    await resetGames(1);
    const res = await request('/api/recently');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.games, []);
  });

  it('lists games newest first and carries the library path', async () => {
    const ids = await resetGames(3);
    await touchAt(ids[0], '2026-01-01 10:00:00');
    await touchAt(ids[1], '2026-01-02 10:00:00');
    await touchAt(ids[2], '2026-01-03 10:00:00');

    const res = await request('/api/recently');
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.games.map((g) => g.name),
      ['game-2', 'game-1', 'game-0'],
    );
    // The page needs library_path to rebuild the absolute path for the open action.
    assert.equal(res.body.games[0].library_path, 'D:/tmp/L');
    assert.ok(res.body.games[0].opened_at);
  });

  it('prefers the scraped source name for display', async () => {
    const ids = await resetGames(1);
    await db.knex('game_source').insert({
      game_id: ids[0],
      source_type: 'vndb',
      source_id: 'v1',
      name: 'Scraped Title',
    });
    await touchAt(ids[0], '2026-01-01 10:00:00');
    const res = await request('/api/recently');
    assert.equal(res.body.games[0].sourceName, 'Scraped Title');
  });
});

describe('POST /api/recently/:gameId', () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/recently', recentlyRouter);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('records a game and refreshes the timestamp on re-open', async () => {
    const ids = await resetGames(2);
    await touchAt(ids[0], '2026-01-01 10:00:00');
    await touchAt(ids[1], '2026-01-02 10:00:00');

    let res = await request('/api/recently');
    assert.equal(res.body.games.length, 2);
    assert.deepEqual(res.body.games.map((g) => g.name), ['game-1', 'game-0']);

    // Re-opening the older one must not create a second row; it must move to the top.
    await request(`/api/recently/${ids[0]}`, { method: 'POST' });
    res = await request('/api/recently');
    assert.equal(res.body.games.length, 2);
    assert.equal(await db.knex('recently').count('* as c').first().then((r) => r.c), 2);
    assert.deepEqual(res.body.games.map((g) => g.name), ['game-0', 'game-1']);
  });

  it('404s for a game that does not exist and records nothing', async () => {
    await resetGames(1);
    const res = await request('/api/recently/999999', { method: 'POST' });
    assert.equal(res.status, 404);
    assert.equal(await db.knex('recently').count('* as c').first().then((r) => r.c), 0);
  });

  it('rejects a non-numeric id', async () => {
    const res = await request('/api/recently/abc', { method: 'POST' });
    assert.equal(res.status, 400);
  });
});

describe('recently pruning', () => {
  it('keeps only the newest 100 rows', async () => {
    const ids = await resetGames(105);
    assert.equal(ids.length, 105);

    // Timestamps are handed out round-robin, so the 5 oldest are not simply the first 5 ids.
    // What must hold is: 105 rows go in, 100 newest come out, and the 5 lowest timestamps go.
    for (let i = 0; i < ids.length; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      const hour = String(Math.floor(i / 28)).padStart(2, '0');
      await touchAt(ids[i], `2026-03-${day} ${hour}:00:00`);
    }

    const before = await db.knex('recently').select('game_id', 'opened_at');
    assert.equal(before.length, 105);
    const oldestFive = [...before]
      .sort((a, b) => (a.opened_at < b.opened_at ? -1 : a.opened_at > b.opened_at ? 1 : 0))
      .slice(0, 5)
      .map((r) => r.game_id);

    await db.pruneRecently();

    const rows = await db.getRecently();
    assert.equal(rows.length, db.MAX_RECENT);
    const kept = new Set(rows.map((r) => r.id));
    for (const dropped of oldestFive) {
      assert.ok(!kept.has(dropped), `game ${dropped} should have been pruned`);
    }
    // The newest row must survive the prune.
    const newest = before.reduce((a, b) => (a.opened_at >= b.opened_at ? a : b));
    assert.ok(kept.has(newest.game_id));
  });

  it('is a no-op while the list is under the cap', async () => {
    await db.knex('recently').del();
    const ids = await resetGames(3);
    await Promise.all(ids.map((id) => db.touchRecently(id)));
    const deleted = await db.pruneRecently();
    assert.equal(deleted, 0);
    assert.equal(await db.knex('recently').count('* as c').first().then((r) => r.c), 3);
  });

  it('drops the history when the game itself is deleted', async () => {
    await db.knex('recently').del();
    const ids = await resetGames(2);
    await db.touchRecently(ids[0]);
    await db.touchRecently(ids[1]);
    assert.equal(await db.knex('recently').count('* as c').first().then((r) => r.c), 2);

    await db.deleteGame(ids[0]);
    assert.equal(await db.knex('recently').count('* as c').first().then((r) => r.c), 1);
    assert.equal(await db.knex('recently').first().then((r) => r.game_id), ids[1]);
  });
});

describe('DELETE /api/recently', () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/recently', recentlyRouter);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('clears the whole history', async () => {
    const ids = await resetGames(3);
    await Promise.all(ids.map((id) => db.touchRecently(id)));
    const res = await request('/api/recently', { method: 'DELETE' });
    assert.equal(res.status, 204);
    assert.equal(await db.knex('recently').count('* as c').first().then((r) => r.c), 0);
    // The games themselves must survive.
    assert.equal(await db.knex('game').count('* as c').first().then((r) => r.c), 3);
  });

  it('removes a single entry', async () => {
    await db.knex('recently').del();
    const ids = await resetGames(2);
    await db.touchRecently(ids[0]);
    await db.touchRecently(ids[1]);
    const res = await request(`/api/recently/${ids[0]}`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    const rows = await db.getRecently();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, ids[1]);
  });
});
