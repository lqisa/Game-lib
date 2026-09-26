import { describe, it, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import gameRouter from '../routes/game.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';
import { COVERS_DIR } from '../scraper/cover.js';

/**
 * "Has this game been scraped" is asked in three places - the list filter, the unscraped
 * list and the batch-skip ids. They each used to spell out their own SQL and disagreed:
 * the list filter counted a hand-dropped cover as scraped while the other two did not, so
 * a game disappeared from the "unscraped" filter but stayed in the scan dialog's list.
 * These tests pin the shared definition.
 */

let baseUrl;
let server;
let libraryId;
let tmpDir;

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

const seedGame = async (name, coverPath, { withSource = false } = {}) => {
  await db.insertGame({
    name,
    library_id: libraryId,
    sub_path: `${name}/g.rar`,
    cover_path: coverPath,
  });
  const game = await db.knex('game').orderBy('id', 'desc').first();
  if (withSource) {
    await db.knex('game_source').insert({
      game_id: game.id,
      source_type: 'bangumi',
      source_id: String(game.id),
      source_url: null,
      name,
      raw_data: JSON.stringify({}),
    });
  }
  return game.id;
};

const unscrapedNames = async () =>
  (await request('GET', `/api/games/unscraped?libraryId=${libraryId}`)).body
    .map((g) => g.name)
    .sort();

const listNames = async (scraped) =>
  (await request('GET', `/api/games?page=1&pageSize=50&scraped=${scraped}`)).body.games
    .map((g) => g.name)
    .sort();

before(async () => {
  await initDatabase();
});

after(async () => {
  await closePool();
});

describe('the scraped predicate is shared by every caller', () => {
  let withSource;
  let withCover;
  let emptyCover;
  let neither;

  beforeEach(async () => {
    await db.knex('game_tag').del();
    await db.knex('game_genre').del();
    await db.knex('game_maker').del();
    await db.knex('game_source').del();
    await db.knex('game').del();
    await db.knex('library').del();
    await db.insertLibrary({ name: 'L', path: 'D:/tmp/L' });
    libraryId = (await db.knex('library').orderBy('id', 'desc').first()).id;

    withSource = await seedGame('A has-source', null, { withSource: true });
    withCover = await seedGame('B has-cover', 'have.jpg');
    // '' must count as "no cover", the same way the cover repair pass reads it.
    emptyCover = await seedGame('C empty-cover', '');
    neither = await seedGame('D neither', null);

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
    if (server) await new Promise((r) => server.close(r));
  });

  it('counts a game with a source as scraped', async () => {
    assert.ok((await listNames('true')).includes('A has-source'));
    assert.ok((await request('GET', '/api/games/scraped-ids')).body.includes(withSource));
  });

  it('counts a game whose cover was dropped by hand as scraped', async () => {
    assert.ok((await listNames('true')).includes('B has-cover'));
    assert.ok((await request('GET', '/api/games/scraped-ids')).body.includes(withCover));
    assert.ok(!(await unscrapedNames()).includes('B has-cover'));
  });

  it('does not count an empty cover_path as a cover', async () => {
    assert.ok(!(await listNames('true')).includes('C empty-cover'));
    assert.ok(!(await request('GET', '/api/games/scraped-ids')).body.includes(emptyCover));
    assert.ok((await unscrapedNames()).includes('C empty-cover'));
  });

  it('agrees across the unscraped list and the list filter', async () => {
    const fromUnscraped = await unscrapedNames();
    assert.deepEqual(fromUnscraped, await listNames('false'));
    assert.deepEqual(fromUnscraped, ['C empty-cover', 'D neither']);
  });

  it('agrees with the batch-skip ids', async () => {
    const ids = await request('GET', '/api/games/scraped-ids');
    assert.deepEqual([...ids.body].sort(), [withSource, withCover].sort());
    assert.ok(!ids.body.includes(neither));
  });
});

describe('PUT /api/games/:id/manual-cover', () => {
  let gameId;
  let sourceImage;
  // Files the endpoint writes under COVERS_DIR; collected here and removed once at the
  // end rather than per test, so a run does not spend its whole cleanup budget here.
  const written = [];

  before(() => {
    // A real 1x1 PNG, so the content check passes on genuine image bytes. Kept outside
    // COVERS_DIR so its cleanup cannot collide with what the endpoint writes.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-lib-manual-cover-'));
    sourceImage = path.join(tmpDir, 'source.png');
    fs.writeFileSync(
      sourceImage,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const name of written) fs.rmSync(path.join(COVERS_DIR, name), { force: true });
  });

  beforeEach(async () => {
    await db.knex('game_source').del();
    await db.knex('game').del();
    await db.knex('library').del();
    await db.insertLibrary({ name: 'L', path: 'D:/tmp/L' });
    libraryId = (await db.knex('library').orderBy('id', 'desc').first()).id;

    fs.mkdirSync(COVERS_DIR, { recursive: true });
    gameId = await seedGame('needs-a-cover', null);

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
    if (server) await new Promise((r) => server.close(r));
  });

  const putCover = async (imagePath) => {
    const res = await request('PUT', `/api/games/${gameId}/manual-cover`, { imagePath });
    if (res.body?.cover_path) written.push(res.body.cover_path);
    return res;
  };

  it('stores a bare file name, not a /covers/ prefixed path', async () => {
    // The client builds the URL as `/covers/${cover_path}` and /covers is a static mount,
    // so a prefixed value resolves to /covers//covers/<name> and 404s.
    const res = await putCover(sourceImage);
    assert.equal(res.status, 200);
    assert.match(res.body.cover_path, new RegExp(`^manual_${gameId}_\\d+_[a-z0-9]+\\.png$`));
    assert.ok(!res.body.cover_path.startsWith('/'));
    assert.ok(fs.existsSync(path.join(COVERS_DIR, res.body.cover_path)));
  });

  it('takes the extension from the content, not the file name', async () => {
    const disguised = path.join(tmpDir, 'disguised.jpg');
    fs.copyFileSync(sourceImage, disguised);
    const res = await putCover(disguised);
    assert.equal(res.status, 200);
    assert.match(res.body.cover_path, /\.png$/, 'a PNG named .jpg must still be stored as .png');
  });

  it('rejects a file that is not an image', async () => {
    const notAnImage = path.join(tmpDir, 'not-an-image.jpg');
    fs.writeFileSync(notAnImage, '<!DOCTYPE html><html>not an image</html>');
    const res = await putCover(notAnImage);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /not a supported image/i);
    const game = await db.knex('game').where({ id: gameId }).first();
    assert.equal(game.cover_path, null, 'a rejected file must not be recorded as the cover');
  });

  it('rejects a missing path', async () => {
    const res = await putCover('D:/does/not/exist.png');
    assert.equal(res.status, 400);
  });

  it('marks the game as scraped', async () => {
    await putCover(sourceImage);
    const ids = await request('GET', '/api/games/scraped-ids');
    assert.ok(ids.body.includes(gameId));
  });

  it('removes the previous manual cover instead of leaving it behind', async () => {
    const first = await putCover(sourceImage);
    const second = await putCover(sourceImage);

    assert.notEqual(first.body.cover_path, second.body.cover_path);
    // Assert on the two files rather than on the directory contents: the test db is
    // in-memory so ids restart every run, and a leftover from an earlier run would
    // otherwise share this game's id prefix.
    assert.equal(
      fs.existsSync(path.join(COVERS_DIR, first.body.cover_path)),
      false,
      'the replaced cover should have been removed',
    );
    assert.ok(fs.existsSync(path.join(COVERS_DIR, second.body.cover_path)));
  });
});
