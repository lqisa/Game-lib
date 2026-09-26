import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import gameRouter from '../routes/game.js';
import taskRouter from '../routes/task.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';
import {
  getTask,
  getAllTasks,
  updateTask,
  removeTask,
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

const waitFor = (fn, timeout = 15000, interval = 200) => new Promise((resolve, reject) => {
  const start = Date.now();
  const check = () => {
    const result = fn();
    if (result) return resolve(result);
    if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
    setTimeout(check, interval);
  };
  check();
});

describe('Integration: Relocate Full Chain', () => {
  it('should robocopy files, update DB, and push SSE events', async () => {
    await initDatabase();
    cleanupTasks();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-int-'));
    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });

    const gameDir = path.join(libDir, 'BigGame');
    fs.mkdirSync(gameDir, { recursive: true });
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(gameDir, `file${i}.dat`), Buffer.alloc(1024, i));
    }

    const [id] = await db.knex('library').insert({ name: 'IntLib_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'BigGame_' + Date.now(),
      library_id: libId,
      sub_path: 'BigGame',
    }, ['id']);
    const gameId = gid.id || gid;

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    app.use('/api/tasks', taskRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const destDir = path.join(tmpDir, 'RepoB', 'BigGame');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destDir, moveFiles: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'move');
    assert.ok(res.body.taskId);

    const taskId = res.body.taskId;

    const finalTask = await waitFor(() => {
      const t = getTask(taskId);
      return (t && (t.status === 'completed' || t.status === 'failed')) ? t : null;
    }, 30000);

    assert.equal(finalTask.status, 'completed', `Task failed: ${finalTask.error}`);
    assert.equal(finalTask.progress, 100);

    assert.ok(fs.existsSync(destDir));
    for (let i = 0; i < 10; i++) {
      assert.ok(fs.existsSync(path.join(destDir, `file${i}.dat`)), `file${i}.dat should exist in dest`);
    }
    assert.ok(!fs.existsSync(gameDir), 'Source should be deleted after move');

    const updatedGame = await db.getGameDetail(gameId);
    assert.ok(updatedGame);

    const taskListRes = await request('GET', `${base}/api/tasks/`);
    const completedTask = taskListRes.body.find((t) => t.id === taskId);
    assert.ok(completedTask);
    assert.equal(completedTask.status, 'completed');

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
  });

  it('should handle same-directory rename without robocopy', async () => {
    await initDatabase();
    cleanupTasks();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-int-'));
    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });

    const gameDir = path.join(libDir, 'SimpleGame');
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(path.join(gameDir, 'readme.txt'), 'test');

    const [id] = await db.knex('library').insert({ name: 'IntLib2_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'SimpleGame_' + Date.now(),
      library_id: libId,
      sub_path: 'SimpleGame',
    }, ['id']);
    const gameId = gid.id || gid;

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const destPath = path.join(libDir, 'SimpleGameRenamed');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destPath, moveFiles: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'move');
    assert.equal(res.body.taskId, null);

    assert.ok(fs.existsSync(destPath));
    assert.ok(fs.existsSync(path.join(destPath, 'readme.txt')));
    assert.ok(!fs.existsSync(gameDir));

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
  });
});

after(async () => {
  await closePool();
});