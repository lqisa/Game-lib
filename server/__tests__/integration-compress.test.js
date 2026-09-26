import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import gameRouter from '../routes/game.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';
import {
  getTask,
  getAllTasks,
  updateTask,
  removeTask,
  detectCompressTools,
} from '../tasks.js';

const request = async (method, url, body) => {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
};

const cleanupTasks = () => {
  for (const t of getAllTasks()) {
    if (t.status === 'running' && t.type === 'move') {
      updateTask(t.id, { status: 'completed' });
    }
    removeTask(t.id);
  }
};

const waitFor = (fn, timeout = 60000, interval = 500) => new Promise((resolve, reject) => {
  const start = Date.now();
  const check = () => {
    const result = fn();
    if (result) return resolve(result);
    if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
    setTimeout(check, interval);
  };
  check();
});

let hasRar = false;

before(async () => {
  await initDatabase();
  const tools = detectCompressTools();
  hasRar = !!tools.winrar;
});

describe('Integration: Compress Tool Detection', () => {
  it('should detect WinRAR on this system', () => {
    const tools = detectCompressTools();
    assert.ok(tools.winrar, 'WinRAR rar.exe not found - expected at C:\\Program Files\\WinRAR\\rar.exe');
  });

  it('detected tool should be valid executable path', () => {
    const tools = detectCompressTools();
    if (tools.winrar) {
      assert.ok(fs.existsSync(tools.winrar), `WinRAR path does not exist: ${tools.winrar}`);
    }
  });
});

describe('Integration: Compress Folder to RAR', () => {
  it('should compress a simple folder to .rar and add source to archived_folders', async () => {
    if (!hasRar) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-comp-'));
    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });

    const gameDir = path.join(libDir, 'TestGame');
    fs.mkdirSync(gameDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(gameDir, `file${i}.dat`), `content ${i}`);
    }

    const [id] = await db.knex('library').insert({ name: 'CompLib_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'TestGame_' + Date.now(),
      library_id: libId,
      sub_path: 'TestGame',
    }, ['id']);
    const gameId = gid.id || gid;

    const destDir = path.join(tmpDir, 'RepoB');
    fs.mkdirSync(destDir, { recursive: true });
    const destArchive = path.join(destDir, 'TestGame.rar');

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destArchive,
      moveFiles: true,
      compressFiles: true,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'compress');
    assert.ok(res.body.taskId);

    const taskId = res.body.taskId;
    const finalTask = await waitFor(() => {
      const t = getTask(taskId);
      return (t && (t.status === 'completed' || t.status === 'failed')) ? t : null;
    }, 60000);

    assert.equal(finalTask.status, 'completed', `Compression failed: ${finalTask.error}`);

    assert.ok(fs.existsSync(destArchive), 'Destination .rar should exist');

    const archivedStr = await db.getSetting('archived_folders');
    const archived = archivedStr ? JSON.parse(archivedStr) : [];
    assert.ok(archived.includes('TestGame'), 'Source folder should be added to archived_folders list');

    const updatedGame = await db.getGameDetail(gameId);
    assert.equal(updatedGame.sub_path, 'TestGame.rar', 'Game sub_path should be updated to .rar');

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
    await db.knex('setting').where({ key: 'archived_folders' }).del().catch(() => {});
  });

  it('should skip compression when source is already an archive (rule 1.1)', async () => {
    if (!hasRar) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-comp-'));
    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });

    const archiveDir = path.join(libDir, 'ArchiveGame');
    fs.mkdirSync(archiveDir, { recursive: true });
    const archivePath = path.join(archiveDir, 'game.7z');
    fs.writeFileSync(archivePath, 'fake archive');

    const [id] = await db.knex('library').insert({ name: 'CompLib2_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'ArchiveGame_' + Date.now(),
      library_id: libId,
      sub_path: 'ArchiveGame/game.7z',
    }, ['id']);
    const gameId = gid.id || gid;

    const destDir = path.join(tmpDir, 'RepoB', 'ArchiveGame');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destDir,
      moveFiles: true,
      compressFiles: true,
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.compressSkipped === true);
    assert.equal(res.body.reason, 'already_archive');

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
  });

  it('should skip compression when source folder contains archive files (rule 1.2)', async () => {
    if (!hasRar) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-comp-'));
    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });

    const gameDir = path.join(libDir, 'GameWithArchives');
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(path.join(gameDir, 'data.txt'), 'some data');
    fs.writeFileSync(path.join(gameDir, 'part1.rar'), 'fake rar part');

    const [id] = await db.knex('library').insert({ name: 'CompLib3_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'GameWithArchives_' + Date.now(),
      library_id: libId,
      sub_path: 'GameWithArchives',
    }, ['id']);
    const gameId = gid.id || gid;

    const destDir = path.join(tmpDir, 'RepoB', 'GameWithArchives');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destDir,
      moveFiles: true,
      compressFiles: true,
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.compressSkipped === true);
    assert.equal(res.body.reason, 'contains_archives');

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
  });

  it('should handle target archive already exists conflict', async () => {
    if (!hasRar) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-comp-'));
    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });

    const gameDir = path.join(libDir, 'ConflictGame');
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(path.join(gameDir, 'file.txt'), 'content');

    const [id] = await db.knex('library').insert({ name: 'CompLib4_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'ConflictGame_' + Date.now(),
      library_id: libId,
      sub_path: 'ConflictGame',
    }, ['id']);
    const gameId = gid.id || gid;

    const destDir = path.join(tmpDir, 'RepoB');
    fs.mkdirSync(destDir, { recursive: true });
    const destArchive = path.join(destDir, 'ConflictGame.rar');
    fs.writeFileSync(destArchive, 'existing archive');

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destArchive,
      moveFiles: true,
      compressFiles: true,
    });

    assert.equal(res.status, 409);
    assert.ok(res.body.conflict === true);

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
  });

  it('should proceed with force when target archive exists', async () => {
    if (!hasRar) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-comp-'));
    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });

    const gameDir = path.join(libDir, 'ForceGame');
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(path.join(gameDir, 'file.txt'), 'content');

    const [id] = await db.knex('library').insert({ name: 'CompLib5_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'ForceGame_' + Date.now(),
      library_id: libId,
      sub_path: 'ForceGame',
    }, ['id']);
    const gameId = gid.id || gid;

    const destDir = path.join(tmpDir, 'RepoB');
    fs.mkdirSync(destDir, { recursive: true });
    const destArchive = path.join(destDir, 'ForceGame.rar');
    fs.writeFileSync(destArchive, 'existing archive');

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destArchive,
      moveFiles: true,
      compressFiles: true,
      force: true,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'compress');
    assert.ok(res.body.taskId);

    const taskId = res.body.taskId;
    const finalTask = await waitFor(() => {
      const t = getTask(taskId);
      return (t && (t.status === 'completed' || t.status === 'failed')) ? t : null;
    }, 60000);

    assert.equal(finalTask.status, 'completed', `Compression failed: ${finalTask.error}`);
    assert.ok(fs.existsSync(destArchive), 'Destination .rar should exist');

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
    await db.knex('setting').where({ key: 'archived_folders' }).del().catch(() => {});
  });

  it('should handle split archive patterns in subdirectory (rule 1.2)', async () => {
    if (!hasRar) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-comp-'));
    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });

    const gameDir = path.join(libDir, 'GameWithSplit');
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(path.join(gameDir, 'data.txt'), 'some data');
    fs.writeFileSync(path.join(gameDir, 'game.part1.rar'), 'split part 1');
    fs.writeFileSync(path.join(gameDir, 'game.part2.rar'), 'split part 2');

    const [id] = await db.knex('library').insert({ name: 'CompLib6_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'GameWithSplit_' + Date.now(),
      library_id: libId,
      sub_path: 'GameWithSplit',
    }, ['id']);
    const gameId = gid.id || gid;

    const destDir = path.join(tmpDir, 'RepoB', 'GameWithSplit');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destDir,
      moveFiles: true,
      compressFiles: true,
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.compressSkipped === true);
    assert.equal(res.body.reason, 'contains_archives');

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
  });
});

describe('Integration: archived_folders excluded from scan', () => {
  it('should exclude archived_folders from scan results', async () => {
    if (!hasRar) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-scan-'));
    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });

    const gameDir1 = path.join(libDir, 'NormalGame');
    fs.mkdirSync(gameDir1, { recursive: true });
    fs.writeFileSync(path.join(gameDir1, 'file.txt'), 'content');

    const gameDir2 = path.join(libDir, 'ArchivedGame');
    fs.mkdirSync(gameDir2, { recursive: true });
    fs.writeFileSync(path.join(gameDir2, 'file.txt'), 'content');

    const [id] = await db.knex('library').insert({ name: 'ScanLib_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid1] = await db.knex('game').insert({
      name: 'NormalGame_' + Date.now(),
      library_id: libId,
      sub_path: 'NormalGame',
    }, ['id']);
    const gameId1 = gid1.id || gid1;

    const [gid2] = await db.knex('game').insert({
      name: 'ArchivedGame_' + Date.now(),
      library_id: libId,
      sub_path: 'ArchivedGame',
    }, ['id']);
    const gameId2 = gid2.id || gid;

    await db.setSetting('archived_folders', JSON.stringify(['ArchivedGame']));

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await request('POST', `${base}/api/games/scan`, { libraryId: libId });
    assert.equal(res.status, 200);
    assert.ok(res.body.allDirs.includes('NormalGame'));
    assert.ok(!res.body.allDirs.includes('ArchivedGame'), 'ArchivedGame should be excluded from scan');

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId1 }).del().catch(() => {});
    await db.knex('game').where({ id: gameId2 }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
    await db.knex('setting').where({ key: 'archived_folders' }).del().catch(() => {});
  });
});

after(async () => {
  await closePool();
});