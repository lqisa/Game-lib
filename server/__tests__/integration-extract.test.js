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
  detectExtractTools,
  selectTool,
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

const waitFor = (fn, timeout = 30000, interval = 500) => new Promise((resolve, reject) => {
  const start = Date.now();
  const check = () => {
    const result = fn();
    if (result) return resolve(result);
    if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
    setTimeout(check, interval);
  };
  check();
});

let availableTools = {};
let has7z = false;

before(async () => {
  await initDatabase();
  availableTools = detectExtractTools();
  has7z = !!availableTools.sevenzip;
});

describe('Integration: Extract Tool Detection', () => {
  it('should detect at least one extraction tool on this system', () => {
    const tools = detectExtractTools();
    const hasAny = tools.unrar || tools.sevenzip || tools.sevenzipZstd;
    assert.ok(hasAny, 'No extraction tools found - expected at least 7z or UnRAR on Windows');
  });

  it('detected tools should be valid executable paths', () => {
    const tools = detectExtractTools();
    for (const [name, p] of Object.entries(tools)) {
      if (p) {
        assert.ok(fs.existsSync(p), `${name} path does not exist: ${p}`);
      }
    }
  });

  it('selectTool should return a valid tool for .7z format', () => {
    if (!has7z && !availableTools.sevenzipZstd) return;
    const tool = selectTool('.7z', availableTools);
    assert.ok(tool);
    assert.ok(fs.existsSync(tool.path));
  });
});

describe('Integration: Extract with Password', () => {
  it('should extract a password-protected 7z archive using password table', async () => {
    if (!has7z) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-ext-'));
    const contentDir = path.join(tmpDir, 'content');
    fs.mkdirSync(contentDir, { recursive: true });
    fs.writeFileSync(path.join(contentDir, 'hello.txt'), 'Hello World');

    const archivePath = path.join(tmpDir, 'game.7z');
    const sevenzip = availableTools.sevenzip;

    const { spawn } = await import('node:child_process');
    await new Promise((resolve, reject) => {
      const child = spawn(sevenzip, ['a', archivePath, path.join(contentDir, '*'), '-ptestpw123', '-y']);
      child.on('close', (code) => code <= 1 ? resolve() : reject(new Error(`7z create exit ${code}`)));
      child.on('error', reject);
    });

    assert.ok(fs.existsSync(archivePath));

    await db.setSetting('archive_passwords', JSON.stringify(['wrongpw', 'testpw123']));

    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });
    const archiveInLib = path.join(libDir, 'game.7z');
    fs.copyFileSync(archivePath, archiveInLib);

    const [id] = await db.knex('library').insert({ name: 'ExtLib_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'ExtGame_' + Date.now(),
      library_id: libId,
      sub_path: 'game.7z',
    }, ['id']);
    const gameId = gid.id || gid;

    const destDir = path.join(tmpDir, 'RepoB', 'game');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destDir, moveFiles: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'extract');
    assert.ok(res.body.taskId);

    const taskId = res.body.taskId;
    const finalTask = await waitFor(() => {
      const t = getTask(taskId);
      return (t && (t.status === 'completed' || t.status === 'failed')) ? t : null;
    }, 60000);

    assert.equal(finalTask.status, 'completed', `Extract failed: ${finalTask.error}`);

    assert.ok(fs.existsSync(path.join(destDir, 'hello.txt')));

    const archivedStr = await db.getSetting('archived_archives');
    const archived = archivedStr ? JSON.parse(archivedStr) : [];
    assert.ok(archived.includes('game.7z'), 'Archive should be added to archived_archives list');

    assert.ok(fs.existsSync(archiveInLib), 'Source archive should NOT be deleted');

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
    await db.knex('setting').where({ key: 'archive_passwords' }).del().catch(() => {});
    await db.knex('setting').where({ key: 'archived_archives' }).del().catch(() => {});
  });

  it('should extract a non-encrypted archive without password', async () => {
    if (!has7z) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-ext-'));
    const contentDir = path.join(tmpDir, 'content');
    fs.mkdirSync(contentDir, { recursive: true });
    fs.writeFileSync(path.join(contentDir, 'data.bin'), 'Binary data here');

    const archivePath = path.join(tmpDir, 'plain.7z');
    const sevenzip = availableTools.sevenzip;

    const { spawn } = await import('node:child_process');
    await new Promise((resolve, reject) => {
      const child = spawn(sevenzip, ['a', archivePath, path.join(contentDir, '*'), '-y']);
      child.on('close', (code) => code <= 1 ? resolve() : reject(new Error(`7z create exit ${code}`)));
      child.on('error', reject);
    });

    const libDir = path.join(tmpDir, 'RepoA');
    fs.mkdirSync(libDir, { recursive: true });
    const archiveInLib = path.join(libDir, 'plain.7z');
    fs.copyFileSync(archivePath, archiveInLib);

    const [id] = await db.knex('library').insert({ name: 'ExtLib2_' + Date.now(), path: libDir }, ['id']);
    const libId = id.id || id;

    const [gid] = await db.knex('game').insert({
      name: 'PlainGame_' + Date.now(),
      library_id: libId,
      sub_path: 'plain.7z',
    }, ['id']);
    const gameId = gid.id || gid;

    const destDir = path.join(tmpDir, 'RepoB', 'plain');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });

    await db.setSetting('archive_passwords', JSON.stringify([]));

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { newPath: destDir, moveFiles: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'extract');

    const taskId = res.body.taskId;
    const finalTask = await waitFor(() => {
      const t = getTask(taskId);
      return (t && (t.status === 'completed' || t.status === 'failed')) ? t : null;
    }, 60000);

    assert.equal(finalTask.status, 'completed', `Extract failed: ${finalTask.error}`);
    assert.ok(fs.existsSync(path.join(destDir, 'data.bin')));

    cleanupTasks();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.knex('game').where({ id: gameId }).del().catch(() => {});
    await db.knex('library').where({ id: libId }).del().catch(() => {});
    await db.knex('setting').where({ key: 'archived_archives' }).del().catch(() => {});
  });
});

after(async () => {
  await closePool();
});