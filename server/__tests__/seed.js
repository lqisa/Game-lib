import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { knex, setSetting } from '../database/db.js';
import { initDatabase } from '../database/init.js';

const TEST_LIB_NAME = 'E2E_TestLibrary';
const DEST_LIB_NAME = 'E2E_DestLibrary';

const REWRITE = {
  name: 'Rewrite',
  vndbId: 'v751',
  vndbUrl: 'https://vndb.org/v751',
  makers: ['Key'],
  genres: ['Visual Novel', 'Romance'],
  tags: ['Multiple Endings', 'Fantasy', 'School Life'],
  description: 'Key\'s 6th game, released in 2016. A story about Kazamatsuri, a city where nature and civilization coexist.',
};

const createFakeFiles = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Rewrite.exe'), 'MZ' + '\0'.repeat(100));
  fs.writeFileSync(path.join(dir, 'Readme.txt'), 'Rewrite - Key Visual Novel');
  fs.mkdirSync(path.join(dir, 'savedata'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'savedata', 'config.dat'), 'test config');
  fs.writeFileSync(path.join(dir, 'savedata', 'save1.dat'), 'save data');
  fs.mkdirSync(path.join(dir, 'bgm'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bgm', 'title.ogg'), Buffer.alloc(256, 0));
  fs.mkdirSync(path.join(dir, 'ev'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ev', 'cg01.png'), Buffer.alloc(512, 0));
};

const createFakeArchive = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  const fake7z = Buffer.alloc(2048);
  fake7z[0] = 0x37;
  fake7z[1] = 0x7A;
  fake7z[2] = 0xBC;
  fake7z[3] = 0xAF;
  fake7z[4] = 0x27;
  fake7z[5] = 0x1C;
  fs.writeFileSync(path.join(dir, 'Rewrite_Haruka.7z'), fake7z);

  const fakeRar = Buffer.alloc(2048);
  fakeRar[0] = 0x52;
  fakeRar[1] = 0x61;
  fakeRar[2] = 0x72;
  fakeRar[3] = 0x21;
  fs.writeFileSync(path.join(dir, 'Rewrite_Akane.rar'), fakeRar);
};

export const seed = async (baseDir) => {
  await initDatabase();

  const rootDir = baseDir || process.env.GAME_LIB_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-e2e-'));
  const libDir = path.join(rootDir, 'TestLibrary');
  fs.mkdirSync(libDir, { recursive: true });

  const destLibDir = path.join(rootDir, 'DestLib');
  fs.mkdirSync(destLibDir, { recursive: true });

  const rewriteDir = path.join(libDir, 'Rewrite');
  createFakeFiles(rewriteDir);

  const archiveDir = path.join(libDir, 'Archives');
  createFakeArchive(archiveDir);

  const existingLib = await knex('library').where({ name: TEST_LIB_NAME }).first();
  let libId;

  if (existingLib) {
    libId = existingLib.id;
    await knex('library').where({ id: libId }).update({ path: libDir });
  } else {
    const [row] = await knex('library').insert({ name: TEST_LIB_NAME, path: libDir }, ['id']);
    libId = row.id || row;
  }

  // Create DestLib
  let destLibId;
  const existingDestLib = await knex('library').where({ name: DEST_LIB_NAME }).first();
  if (existingDestLib) {
    destLibId = existingDestLib.id;
    await knex('library').where({ id: destLibId }).update({ path: destLibDir });
  } else {
    const [row] = await knex('library').insert({ name: DEST_LIB_NAME, path: destLibDir }, ['id']);
    destLibId = row.id || row;
  }

  const existingGame = await knex('game').where({ name: REWRITE.name, library_id: libId }).first();
  let gameId;

  if (existingGame) {
    gameId = existingGame.id;
    await knex('game').where({ id: gameId }).update({
      sub_path: 'Rewrite',
      description: REWRITE.description,
    });
  } else {
    const [row] = await knex('game').insert({
      name: REWRITE.name,
      library_id: libId,
      sub_path: 'Rewrite',
      description: REWRITE.description,
    }, ['id']);
    gameId = row.id || row;
  }

  const makerIds = [];
  for (const name of REWRITE.makers) {
    const existing = await knex('maker').where({ name }).first();
    if (existing) {
      makerIds.push(existing.id);
    } else {
      const [row] = await knex('maker').insert({ name }, ['id']);
      makerIds.push(row.id || row);
    }
  }
  await knex('game_maker').where({ game_id: gameId }).del();
  for (const mid of makerIds) {
    await knex('game_maker').insert({ game_id: gameId, maker_id: mid }).catch(() => {});
  }

  const genreIds = [];
  for (const name of REWRITE.genres) {
    const existing = await knex('genre').where({ name }).first();
    if (existing) {
      genreIds.push(existing.id);
    } else {
      const [row] = await knex('genre').insert({ name }, ['id']);
      genreIds.push(row.id || row);
    }
  }
  await knex('game_genre').where({ game_id: gameId }).del();
  for (const gid of genreIds) {
    await knex('game_genre').insert({ game_id: gameId, genre_id: gid }).catch(() => {});
  }

  const tagIds = [];
  for (const name of REWRITE.tags) {
    const existing = await knex('tag').where({ name }).first();
    if (existing) {
      tagIds.push(existing.id);
    } else {
      const [row] = await knex('tag').insert({ name }, ['id']);
      tagIds.push(row.id || row);
    }
  }
  await knex('game_tag').where({ game_id: gameId }).del();
  for (const tid of tagIds) {
    await knex('game_tag').insert({ game_id: gameId, tag_id: tid }).catch(() => {});
  }

  const existingSource = await knex('game_source').where({ game_id: gameId, source_type: 'vndb' }).first();
  if (!existingSource) {
    await knex('game_source').insert({
      game_id: gameId,
      source_type: 'vndb',
      source_id: REWRITE.vndbId,
      source_url: REWRITE.vndbUrl,
      name: REWRITE.name,
    });
  }

  const existingArchiveGame = await knex('game').where({ name: 'Rewrite_Haruka.7z', library_id: libId }).first();
  let archiveGameId;
  if (existingArchiveGame) {
    archiveGameId = existingArchiveGame.id;
  } else {
    const [row] = await knex('game').insert({
      name: 'Rewrite_Haruka.7z',
      library_id: libId,
      sub_path: 'Archives/Rewrite_Haruka.7z',
    }, ['id']);
    archiveGameId = row.id || row;
  }

  await setSetting('archive_passwords', JSON.stringify(['testpw', 'rewrite2024']));
  await setSetting('e2e_test_lib_path', libDir);

  const result = {
    rootDir,
    libDir,
    libId,
    destLibDir,
    destLibId,
    rewriteGameId: gameId,
    archiveGameId,
    rewriteDir,
    archiveDir,
  };

  const jsonPath = path.join(os.tmpdir(), 'gamelib-e2e-seed.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  console.log('✓ E2E seed data created:');
  console.log(`  Library: ${TEST_LIB_NAME} (id=${libId})`);
  console.log(`  Path: ${libDir}`);
  console.log(`  Dest Library: ${DEST_LIB_NAME} (id=${destLibId})`);
  console.log(`  Dest Path: ${destLibDir}`);
  console.log(`  Rewrite game id: ${gameId}`);
  console.log(`  Archive game id: ${archiveGameId}`);
  console.log(`  Seed file: ${jsonPath}`);

  return result;
};

export const unseed = async () => {
  const jsonPath = path.join(os.tmpdir(), 'gamelib-e2e-seed.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('No seed data to clean up');
    return;
  }

  const { rootDir, libId, rewriteGameId, archiveGameId, destLibId } = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  await knex('game_source').where({ game_id: rewriteGameId }).del().catch(() => {});
  await knex('game_maker').where({ game_id: rewriteGameId }).del().catch(() => {});
  await knex('game_genre').where({ game_id: rewriteGameId }).del().catch(() => {});
  await knex('game_tag').where({ game_id: rewriteGameId }).del().catch(() => {});
  await knex('game').where({ id: rewriteGameId }).del().catch(() => {});
  await knex('game').where({ id: archiveGameId }).del().catch(() => {});
  await knex('library').where({ id: libId }).del().catch(() => {});
  await knex('library').where({ id: destLibId }).del().catch(() => {});

  try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.unlinkSync(jsonPath); } catch { /* ignore */ }

  console.log('✓ E2E seed data cleaned up');
};

const isMain = process.argv[1] && process.argv[1].includes('seed');
if (isMain) {
  const action = process.argv[2] || 'create';
  if (action === 'create') {
    seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
  } else if (action === 'clean') {
    unseed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
  }
}