import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import taskRouter from '../routes/task.js';
import settingRouter from '../routes/setting.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';
import {
  createTask,
  getAllTasks,
  updateTask,
  removeTask,
} from '../tasks.js';

let app;
let baseUrl;
let server;

const request = async (method, path, body) => {
  const url = new URL(path, baseUrl);
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

const TASK_SHAPE = {
  id: 'string',
  type: 'string',
  status: 'string',
  label: 'string',
  progress: 'number',
  detail: 'string',
  error: 'object',
  createdAt: 'string',
  completedAt: 'object',
  meta: 'object',
};

const SETTING_SHAPE = {
  key: 'string',
  value: 'string',
};

const checkShape = (obj, shape, label) => {
  for (const [key, expectedType] of Object.entries(shape)) {
    assert.ok(key in obj, `${label}: missing key "${key}"`);
    if (expectedType !== 'object' || obj[key] !== null) {
      assert.equal(typeof obj[key], expectedType, `${label}: key "${key}" should be ${expectedType}, got ${typeof obj[key]}`);
    }
  }
};

describe('Snapshot: API Response Structure', () => {
  beforeEach(async () => {
    cleanupTasks();
    await initDatabase();
    app = express();
    app.use(express.json());
    app.use('/api/tasks', taskRouter);
    app.use('/api/settings', settingRouter);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    cleanupTasks();
    if (server) server.close();
  });

  describe('GET /api/tasks', () => {
    it('task object should have expected shape', async () => {
      createTask('move', { source: 'C:\\src', dest: 'D:\\dest' });
      const res = await request('GET', '/api/tasks/');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      checkShape(res.body[0], TASK_SHAPE, 'Task');
      assert.ok(!('childProcess' in res.body[0]), 'Task should not expose childProcess');
    });

    it('task type should be move or extract', async () => {
      createTask('move', { source: 'A', dest: 'B' });
      createTask('extract', { archivePath: 'C.rar' });
      const res = await request('GET', '/api/tasks/');
      for (const t of res.body) {
        assert.ok(['move', 'extract'].includes(t.type), `Invalid task type: ${t.type}`);
      }
    });

    it('task status should be valid enum', async () => {
      createTask('move', { source: 'A', dest: 'B' });
      const res = await request('GET', '/api/tasks/');
      for (const t of res.body) {
        assert.ok(['pending', 'running', 'completed', 'failed', 'cancelled'].includes(t.status), `Invalid task status: ${t.status}`);
      }
    });

    it('task progress should be 0-100', async () => {
      createTask('move', { source: 'A', dest: 'B' });
      const res = await request('GET', '/api/tasks/');
      for (const t of res.body) {
        assert.ok(t.progress >= 0 && t.progress <= 100, `Progress out of range: ${t.progress}`);
      }
    });
  });

  describe('GET /api/settings/:key', () => {
    it('setting object should have expected shape', async () => {
      await db.setSetting('snapshot_test_key', 'value1');
      const res = await request('GET', '/api/settings/snapshot_test_key');
      assert.equal(res.status, 200);
      checkShape(res.body, SETTING_SHAPE, 'Setting');
      await db.knex('setting').where({ key: 'snapshot_test_key' }).del();
    });
  });

  describe('GET /api/settings/archive-passwords/list', () => {
    it('should return array of strings', async () => {
      await db.setSetting('archive_passwords', JSON.stringify(['pw1', 'pw2']));
      const res = await request('GET', '/api/settings/archive-passwords/list');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      for (const item of res.body) {
        assert.equal(typeof item, 'string', 'Password should be string');
      }
      await db.knex('setting').where({ key: 'archive_passwords' }).del();
    });
  });

  describe('GET /api/settings/archived-archives/list', () => {
    it('should return array of strings', async () => {
      await db.setSetting('archived_archives', JSON.stringify(['a.rar', 'b.7z']));
      const res = await request('GET', '/api/settings/archived-archives/list');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      for (const item of res.body) {
        assert.equal(typeof item, 'string', 'Archive path should be string');
      }
      await db.knex('setting').where({ key: 'archived_archives' }).del();
    });
  });

  describe('GET /api/settings/extract-tools/list', () => {
    it('should return object with unrar/sevenzip/sevenzipZstd keys', async () => {
      const res = await request('GET', '/api/settings/extract-tools/list');
      assert.equal(res.status, 200);
      assert.ok(typeof res.body === 'object');
      assert.ok('unrar' in res.body);
      assert.ok('sevenzip' in res.body);
      assert.ok('sevenzipZstd' in res.body);
    });
  });
});

after(async () => {
  await closePool();
});