import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import gameRouter from '../routes/game.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';
import {
  getTask,
  getAllTasks,
  updateTask,
  removeTask,
  createTask,
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

const setupGame = async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-test-'));
  const libDir = path.join(tmpDir, 'RepoA');
  fs.mkdirSync(libDir, { recursive: true });

  const gameDir = path.join(libDir, 'TestGame');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'data.txt'), 'hello');

  const [id] = await db.knex('library').insert({ name: 'TestLib_' + Date.now(), path: libDir }, ['id']);
  const libId = id.id || id;

  const [gid] = await db.knex('game').insert({
    name: 'TestGame_' + Date.now(),
    library_id: libId,
    sub_path: 'TestGame',
  }, ['id']);
  const gameId = gid.id || gid;

  return { tmpDir, libDir, libId, gameId };
};

const teardownGame = async (tmpDir, libId, gameId) => {
  cleanupTasks();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  await db.knex('game').where({ id: gameId }).del().catch(() => {});
  await db.knex('library').where({ id: libId }).del().catch(() => {});
};

describe('Game Relocate Route', () => {
  it('should return 400 if newPath is missing', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { moveFiles: true });
    assert.equal(res.status, 400);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should return 404 if game does not exist', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const res = await request('PUT', `${base}/api/games/99999/relocate`, { newPath: 'C:\\x', moveFiles: false });
    assert.equal(res.status, 404);
    server.close();
  });

  it('should return 400 if newPath is same as current', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libDir, libId, gameId } = await setupGame(base);
    const currentPath = path.join(libDir, 'TestGame');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: currentPath, moveFiles: false });
    assert.equal(res.status, 400);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should update path only when moveFiles is false', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const newPath = path.join(tmpDir, 'RepoB', 'TestGame');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath, moveFiles: false });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'update_only');
    assert.equal(res.body.taskId, null);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should create move task for same-drive cross-directory relocation', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const destDir = path.join(tmpDir, 'RepoB', 'TestGame');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destDir, moveFiles: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'move');
    assert.ok(res.body.taskId);

    const task = getTask(res.body.taskId);
    assert.ok(task);
    assert.equal(task.type, 'move');
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should rename files for same-directory relocation (no task)', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libDir, libId, gameId } = await setupGame(base);
    const destPath = path.join(libDir, 'TestGameRenamed');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destPath, moveFiles: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'move');
    assert.equal(res.body.taskId, null);
    assert.ok(fs.existsSync(destPath));
    assert.ok(fs.existsSync(path.join(destPath, 'data.txt')));
    assert.ok(!fs.existsSync(path.join(libDir, 'TestGame')));
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should return 409 when dest exists and is non-empty without force', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const destDir = path.join(tmpDir, 'RepoB', 'TestGame');
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'existing.txt'), 'x');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destDir, moveFiles: true });
    assert.equal(res.status, 409);
    assert.ok(res.body.conflict);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should proceed when dest exists but is empty', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const destDir = path.join(tmpDir, 'RepoB', 'TestGame');
    fs.mkdirSync(destDir, { recursive: true });
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destDir, moveFiles: true });
    assert.equal(res.status, 200);
    assert.ok(res.body.operation);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should proceed when dest exists and force is true', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const destDir = path.join(tmpDir, 'RepoB', 'TestGame');
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'existing.txt'), 'x');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destDir, moveFiles: true, force: true });
    assert.equal(res.status, 200);
    assert.ok(res.body.operation);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should create extract task for archive source', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libDir, libId } = await setupGame(base);

    const archiveDir = path.join(libDir, 'ArchiveGame');
    fs.mkdirSync(archiveDir, { recursive: true });
    const archivePath = path.join(archiveDir, 'game.7z');
    fs.writeFileSync(archivePath, 'fake archive');

    const [gid2] = await db.knex('game').insert({
      name: 'ArchiveGame_' + Date.now(),
      library_id: libId,
      sub_path: 'ArchiveGame/game.7z',
    }, ['id']);
    const archiveGameId = gid2.id || gid2;

    const destDir = path.join(tmpDir, 'RepoB', 'ArchiveGame');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });

    const res = await request('PUT', `${base}/api/games/${archiveGameId}/relocate`, { newPath: destDir, moveFiles: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'extract');
    assert.ok(res.body.taskId);

    const task = getTask(res.body.taskId);
    assert.ok(task);
    assert.equal(task.type, 'extract');

    await db.knex('game').where({ id: archiveGameId }).del();
    await teardownGame(tmpDir, libId, 0);
    server.close();
  });

  it('should update path when source does not exist and moveFiles is true', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId } = await setupGame(base);

    const [gid2] = await db.knex('game').insert({
      name: 'GhostGame_' + Date.now(),
      library_id: libId,
      sub_path: 'GhostGame',
    }, ['id']);
    const ghostGameId = gid2.id || gid2;

    const newPath = path.join(tmpDir, 'RepoB', 'GhostGame');
    const res = await request('PUT', `${base}/api/games/${ghostGameId}/relocate`, { newPath, moveFiles: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'update_only');

    await db.knex('game').where({ id: ghostGameId }).del();
    await teardownGame(tmpDir, libId, 0);
    server.close();
  });

  it('should create move task for cross-drive relocation', async () => {
    await initDatabase();
    const drive = os.tmpdir().substring(0, 1);
    const otherDrives = 'CDEFGH'.split('').filter((d) => d !== drive.toUpperCase());
    if (otherDrives.length === 0) return;
    const otherDrive = otherDrives[0] + ':';
    try { fs.accessSync(otherDrive); } catch { return; }

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);

    const destDir = path.join(otherDrive, 'gamelib-test-dest', 'TestGame');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destDir, moveFiles: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'move');
    assert.ok(res.body.taskId);

    const task = getTask(res.body.taskId);
    assert.ok(task);
    assert.equal(task.type, 'move');

    try { fs.rmSync(path.join(otherDrive, 'gamelib-test-dest'), { recursive: true, force: true }); } catch { /* ignore */ }
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });
});

describe('Relocate is a per-game singleton', () => {
  const withServer = async (fn) => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      await fn(base);
    } finally {
      server.close();
    }
  };

  it('refuses a second relocate while a task is running for that game', async () => {
    await withServer(async (base) => {
      const { tmpDir, libId, gameId } = await setupGame(base);
      const task = createTask('extract', {
        source: 'C:\\fake.rar',
        dest: 'C:\\fake-out',
        gameId,
        archivePath: 'C:\\fake.rar',
      });

      const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
        newPath: 'C:\\somewhere-else',
        moveFiles: false,
      });

      assert.equal(res.status, 409);
      assert.equal(res.body.busy, true);
      assert.equal(res.body.busyTaskId, task.id);

      await teardownGame(tmpDir, libId, gameId);
    });
  });

  it('still allows relocating a different game (per-game, not global)', async () => {
    await withServer(async (base) => {
      const first = await setupGame(base);
      const second = await setupGame(base);
      createTask('extract', {
        source: 'C:\\fake.rar',
        dest: 'C:\\fake-out',
        gameId: first.gameId,
        archivePath: 'C:\\fake.rar',
      });

      const res = await request('PUT', `${base}/api/games/${second.gameId}/relocate`, {
        newPath: 'C:\\elsewhere',
        moveFiles: false,
      });

      assert.notEqual(res.status, 409);

      await teardownGame(first.tmpDir, first.libId, first.gameId);
      await teardownGame(second.tmpDir, second.libId, second.gameId);
    });
  });

  it('allows the next relocate once the previous task has finished', async () => {
    await withServer(async (base) => {
      const { tmpDir, libId, gameId } = await setupGame(base);
      const task = createTask('extract', {
        source: 'C:\\fake.rar',
        dest: 'C:\\fake-out',
        gameId,
        archivePath: 'C:\\fake.rar',
      });
      updateTask(task.id, { status: 'completed' });

      const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
        newPath: 'C:\\elsewhere',
        moveFiles: false,
      });

      assert.notEqual(res.status, 409);

      await teardownGame(tmpDir, libId, gameId);
    });
  });
});

after(async () => {
  await closePool();
});