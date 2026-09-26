/**
 * API smoke test - boots the real Express app against whatever db the current env selects
 * and hits every read-only endpoint. Read-only: it never mutates game/library/setting data.
 *
 *   npm run smoke              # dev db  (test-data/db.sqlite3)
 *   GAME_LIB_PROD=1 npm run smoke   # packaged db (%APPDATA%/Game Lib)
 *
 * Prints the resolved db path first, so "the list is empty" can be told apart from
 * "the server is reading a different db file".
 */
import { createApp } from '../app.js';
import { initDatabase } from '../database/init.js';
import { getDataDir, isTestEnv } from '../config.js';
import { closePool } from '../database/db.js';

const PORT = parseInt(process.env.SMOKE_PORT || '19777', 10);

const results = [];

const run = async (baseUrl, path, validate, expectStatus = 200) => {
  let status = 'ERR';
  let note = '';
  let ok = false;
  let sample = '';
  try {
    const res = await fetch(baseUrl + path);
    status = res.status;
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    sample = JSON.stringify(body).slice(0, 70);
    ok = status === expectStatus;
    if (ok && validate) {
      note = validate(body) || '';
    } else if (!ok) {
      note = `expected ${expectStatus}`;
    }
  } catch (err) {
    note = err.message;
  }
  results.push({ path, status, ok, note, sample });
};

const isArray = (label) => (b) => {
  if (!Array.isArray(b)) throw new Error('not an array');
  return `${b.length} ${label}`;
};

const runChecks = async (baseUrl) => {
  await run(baseUrl, '/api/health', (b) => (b.status === 'ok' ? 'ok' : 'bad payload'));
  await run(baseUrl, '/api/libraries', isArray('libraries'));
  await run(baseUrl, '/api/games', (b) => `total=${b.total} returned=${b.games?.length}`);
  await run(baseUrl, '/api/games?page=1&pageSize=10', (b) => `total=${b.total}`);
  await run(baseUrl, '/api/games?keyword=a', (b) => `total=${b.total}`);
  await run(baseUrl, '/api/games?sortBy=name&sortOrder=asc', (b) => `total=${b.total}`);
  await run(baseUrl, '/api/games?scraped=false', (b) => `total=${b.total}`);
  await run(baseUrl, '/api/games?duplicate=no', (b) => `total=${b.total}`);
  await run(baseUrl, '/api/games?favoritesOnly=true', (b) => `total=${b.total}`);
  await run(baseUrl, '/api/games/makers', isArray('makers'));
  await run(baseUrl, '/api/games/genres', isArray('genres'));
  await run(baseUrl, '/api/games/tags', isArray('tags'));
  await run(baseUrl, '/api/games/duplicates', isArray('duplicate groups'));
  await run(baseUrl, '/api/games/unscraped?libraryId=1', isArray('unscraped games'));
  await run(baseUrl, '/api/settings', (b) => `${Object.keys(b).length} settings`);
  await run(baseUrl, '/api/settings/archived-archives/list', isArray('archived archives'));
  await run(baseUrl, '/api/settings/archive-passwords/list', isArray('passwords'));
  await run(baseUrl, '/api/settings/detect-tools', (b) => Object.keys(b).join(',') || 'none found');
  await run(baseUrl, '/api/settings/extract-tools/list', (b) => Object.keys(b).join(',') || 'none found');
  await run(baseUrl, '/api/tasks', isArray('tasks'));
  await run(baseUrl, '/api/games/999999', () => '', 404);
  await run(baseUrl, '/api/settings/__nope__', () => '', 404);

  const games = await (await fetch(`${baseUrl}/api/games?page=1&pageSize=1`)).json();
  const firstId = games?.games?.[0]?.id;
  if (firstId) {
    await run(baseUrl, `/api/games/${firstId}`, (b) => (b.id ? `"${b.name}"` : 'no id'));
  }
};

const report = () => {
  console.log('\n=== smoke results ===');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${String(r.status).padEnd(4)} ${r.path.padEnd(44)} ${r.note}`);
    if (!r.ok) console.log(`     sample: ${r.sample}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return failed.length;
};

const main = async () => {
  console.log(` * data dir: ${getDataDir()}`);
  console.log(` * in-memory db: ${isTestEnv()}`);

  await initDatabase();
  const app = createApp(null);

  const failures = await new Promise((resolve) => {
    const server = app.listen(PORT, '127.0.0.1', () => {
      void runChecks(`http://127.0.0.1:${PORT}`).then(() => {
        server.close();
        resolve(report());
      });
    });
    server.on('error', (err) => {
      console.error(` * could not listen on ${PORT}: ${err.message}`);
      resolve(1);
    });
  });

  await closePool();
  process.exit(failures === 0 ? 0 : 1);
};

main().catch(async (err) => {
  console.error('smoke failed:', err.message);
  await closePool();
  process.exit(1);
});
