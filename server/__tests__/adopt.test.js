import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import scraperRouter from '../routes/scraper.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';

let baseUrl;
let server;

const request = async (path, body) => {
  const res = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
};

const resetGame = async () => {
  await db.knex('game_tag').del();
  await db.knex('game_genre').del();
  await db.knex('game_maker').del();
  await db.knex('game_source').del();
  await db.knex('game').del();
  await db.knex('library').del();
  await db.insertLibrary({ name: 'L', path: 'D:/tmp/L' });
  const lib = await db.knex('library').orderBy('id', 'desc').first();
  await db.insertGame({ name: 'g', library_id: lib.id, sub_path: 'g/game.rar' });
  return (await db.knex('game').orderBy('id', 'desc').first()).id;
};

before(async () => {
  await initDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/scraper', scraperRouter);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await closePool();
});

// The cover URL is what makes the cover self-healing work: when a download fails
// (network, or the app closed mid-run) nothing retries it unless the URL was kept.
// DMM needs this more than DLsite, because its cover path cannot be rebuilt from the
// id alone (`/digital/game/` vs `/digital/comic/`).
describe('POST /api/scraper/adopt/batch persists the cover URL', () => {
  beforeEach(async () => {
    await resetGame();
  });

  it('stores raw_data.coverUrl for a batch adopt', async () => {
    const gameId = await resetGame();
    const res = await request('/api/scraper/adopt/batch', {
      games: [
        {
          gameId,
          sourceType: 'dmm',
          sourceId: 'd_216826',
          sourceUrl: 'https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_216826/',
          name: 'A DMM Work',
          // .invalid never resolves (RFC 2606), so the download fails fast and
          // deterministically - the point of the test is what gets persisted.
          coverUrl: 'https://example.invalid/cover.jpg',
          makers: ['Circle'],
          genres: ['RPG'],
          tags: ['tag-a'],
          description: 'desc',
        },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.results[0].success, true);

    const src = await db.knex('game_source').where({ game_id: gameId }).first();
    assert.equal(src.source_type, 'dmm');
    assert.equal(src.source_id, 'd_216826');
    assert.ok(src.raw_data, 'raw_data must not be null');
    assert.deepEqual(JSON.parse(src.raw_data), { coverUrl: 'https://example.invalid/cover.jpg' });
  });

  it('records a null coverUrl rather than dropping the field', async () => {
    const gameId = await resetGame();
    await request('/api/scraper/adopt/batch', {
      games: [
        {
          gameId,
          sourceType: 'dlsite',
          sourceId: 'RJ123456',
          name: 'No Cover',
          coverUrl: '',
          makers: [],
          genres: [],
          tags: [],
          description: '',
        },
      ],
    });

    const src = await db.knex('game_source').where({ game_id: gameId }).first();
    // Still a JSON object, so resolveCoverUrl() can fall through to the deterministic
    // URL instead of treating the row as "never had a cover URL".
    assert.ok(src.raw_data, 'raw_data must not be null');
    assert.deepEqual(JSON.parse(src.raw_data), { coverUrl: null });
  });

  it('matches what the single-adopt path stores', async () => {
    const gameId = await resetGame();
    await request('/api/scraper/adopt', {
      gameId,
      sourceType: 'dmm',
      sourceId: 'd_999001',
      name: 'Single',
      coverUrl: 'https://example.invalid/single.jpg',
      makers: [],
      genres: [],
      tags: [],
      description: '',
    });
    const single = await db.knex('game_source').where({ game_id: gameId }).first();

    const gameId2 = await resetGame();
    await request('/api/scraper/adopt/batch', {
      games: [
        {
          gameId: gameId2,
          sourceType: 'dmm',
          sourceId: 'd_999001',
          name: 'Single',
          coverUrl: 'https://example.invalid/single.jpg',
          makers: [],
          genres: [],
          tags: [],
          description: '',
        },
      ],
    });
    const batch = await db.knex('game_source').where({ game_id: gameId2 }).first();

    // The two paths must agree, otherwise a game adopted one way and re-adopted the
    // other silently loses its cover URL.
    assert.deepEqual(JSON.parse(batch.raw_data), JSON.parse(single.raw_data));
  });
});
