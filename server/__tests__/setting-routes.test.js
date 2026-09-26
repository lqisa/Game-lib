import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import settingRouter from '../routes/setting.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';

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

const TEST_KEYS = [
  'test_foo', 'test_upkey', 'test_newkey', 'test_noval', 'test_delkey', 'test_nonexistent',
  'archived_archives', 'archive_passwords', 'extract_tools',
];

const cleanupDb = async () => {
  for (const key of TEST_KEYS) {
    await db.knex('setting').where({ key }).del();
  }
};

describe('Setting Routes', () => {
  beforeEach(async () => {
    await initDatabase();
    await cleanupDb();
    app = express();
    app.use(express.json());
    app.use('/api/settings', settingRouter);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await cleanupDb();
    if (server) await new Promise((r) => server.close(r));
  });

  describe('GET /api/settings/:key', () => {
    it('should return 404 for non-existent key', async () => {
      const res = await request('GET', `/api/settings/test_nonexistent`);
      assert.equal(res.status, 404);
    });

    it('should return value for existing key', async () => {
      await db.setSetting('test_foo', 'bar');
      const res = await request('GET', `/api/settings/test_foo`);
      assert.equal(res.status, 200);
      assert.equal(res.body.value, 'bar');
    });
  });

  describe('PUT /api/settings/:key', () => {
    it('should create a new setting', async () => {
      const res = await request('PUT', `/api/settings/test_newkey`, { value: 'hello' });
      assert.equal(res.status, 200);
      assert.equal(res.body.value, 'hello');
    });

    it('should update existing setting', async () => {
      await db.setSetting('test_upkey', 'old');
      const res = await request('PUT', `/api/settings/test_upkey`, { value: 'new' });
      assert.equal(res.status, 200);
      assert.equal(res.body.value, 'new');
    });

    it('should return 400 if value is missing', async () => {
      const res = await request('PUT', `/api/settings/test_noval`, {});
      assert.equal(res.status, 400);
    });
  });

  describe('DELETE /api/settings/:key', () => {
    it('should delete a setting', async () => {
      await db.setSetting('test_delkey', 'bye');
      const res = await request('DELETE', `/api/settings/test_delkey`);
      assert.equal(res.status, 204);
      const val = await db.getSetting('test_delkey');
      assert.equal(val, null);
    });
  });

  describe('Archive Passwords', () => {
    it('GET /archive-passwords/list should return empty array by default', async () => {
      const res = await request('GET', '/api/settings/archive-passwords/list');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 0);
    });

    it('PUT /archive-passwords/save should save passwords', async () => {
      const res = await request('PUT', '/api/settings/archive-passwords/save', { passwords: ['abc', '123'] });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, ['abc', '123']);
    });

    it('PUT /archive-passwords/save should reject non-array', async () => {
      const res = await request('PUT', '/api/settings/archive-passwords/save', { passwords: 'not-array' });
      assert.equal(res.status, 400);
    });

    it('saved passwords should be retrievable', async () => {
      await request('PUT', '/api/settings/archive-passwords/save', { passwords: ['pw1', 'pw2'] });
      const res = await request('GET', '/api/settings/archive-passwords/list');
      assert.deepEqual(res.body, ['pw1', 'pw2']);
    });
  });

  describe('Archived Archives', () => {
    it('GET /archived-archives/list should return empty array by default', async () => {
      const res = await request('GET', '/api/settings/archived-archives/list');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 0);
    });

    it('POST /archived-archives/add should add an archive', async () => {
      const res = await request('POST', '/api/settings/archived-archives/add', { path: 'C:\\game.rar' });
      assert.equal(res.status, 200);
      assert.ok(res.body.includes('C:\\game.rar'));
    });

    it('POST /archived-archives/add should not duplicate', async () => {
      await request('POST', '/api/settings/archived-archives/add', { path: 'C:\\game.rar' });
      const res = await request('POST', '/api/settings/archived-archives/add', { path: 'C:\\game.rar' });
      assert.equal(res.body.length, 1);
    });

    it('DELETE /archived-archives/remove/:index should remove by index', async () => {
      await request('POST', '/api/settings/archived-archives/add', { path: 'A.rar' });
      await request('POST', '/api/settings/archived-archives/add', { path: 'B.rar' });
      const res = await request('DELETE', '/api/settings/archived-archives/remove/0');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, ['B.rar']);
    });

    it('DELETE /archived-archives/remove/:index with invalid index should not crash', async () => {
      const res = await request('DELETE', '/api/settings/archived-archives/remove/999');
      assert.equal(res.status, 200);
    });

    it('POST /archived-archives/add should return 400 without path', async () => {
      const res = await request('POST', '/api/settings/archived-archives/add', {});
      assert.equal(res.status, 400);
    });
  });

  describe('Extract Tools', () => {
    it('GET /detect-tools should return tool detection results', async () => {
      const res = await request('GET', '/api/settings/detect-tools');
      assert.equal(res.status, 200);
      assert.ok(typeof res.body === 'object');
    });

    it('GET /extract-tools/list should return tools', async () => {
      const res = await request('GET', '/api/settings/extract-tools/list');
      assert.equal(res.status, 200);
      assert.ok(typeof res.body === 'object');
    });

    it('PUT /extract-tools/save should save tools', async () => {
      const tools = { unrar: 'C:\\UnRAR.exe', sevenzip: '', sevenzipZstd: '' };
      const res = await request('PUT', '/api/settings/extract-tools/save', { tools });
      assert.equal(res.status, 200);
      assert.equal(res.body.unrar, 'C:\\UnRAR.exe');
    });

    it('PUT /extract-tools/save should reject invalid input', async () => {
      const res = await request('PUT', '/api/settings/extract-tools/save', { tools: 'not-object' });
      assert.equal(res.status, 400);
    });

    it('saved tools should be retrievable', async () => {
      const tools = { unrar: '', sevenzip: 'C:\\7z.exe', sevenzipZstd: '' };
      await request('PUT', '/api/settings/extract-tools/save', { tools });
      const res = await request('GET', '/api/settings/extract-tools/list');
      assert.equal(res.body.sevenzip, 'C:\\7z.exe');
    });
  });
});

after(async () => {
  await closePool();
});