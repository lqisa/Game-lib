import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import taskRouter from '../routes/task.js';
import { createTask, getTask, getAllTasks, updateTask, removeTask } from '../tasks.js';

let app;
let baseUrl;
let server;

const request = async (method, path, body) => {
  const url = new URL(path, baseUrl);
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
};

const cleanup = () => {
  for (const t of getAllTasks()) {
    if (t.status === 'running' && t.type === 'move') {
      updateTask(t.id, { status: 'completed' });
    }
    removeTask(t.id);
  }
};

describe('Task Routes', () => {
  beforeEach(async () => {
    cleanup();
    // Set SSE token for testing
    process.env.SSE_TOKEN = 'test-token';
    app = express();
    app.use(express.json());
    app.use('/api/tasks', taskRouter);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    cleanup();
    if (server) server.close();
  });

  describe('GET /api/tasks', () => {
    it('should return empty array when no tasks', async () => {
      const res = await request('GET', '/api/tasks/');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 0);
    });

    it('should return tasks without childProcess field', async () => {
      const task = createTask('move', { source: 'C:\\src', dest: 'D:\\dest' });
      const res = await request('GET', '/api/tasks/');
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].id, task.id);
      assert.ok(!('childProcess' in res.body[0]));
    });

    it('should return multiple tasks', async () => {
      createTask('move', { source: 'A', dest: 'B' });
      createTask('extract', { archivePath: 'C.rar' });
      const res = await request('GET', '/api/tasks/');
      assert.equal(res.body.length, 2);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should return 404 for non-existent task', async () => {
      const res = await request('DELETE', '/api/tasks/nonexistent-id');
      assert.equal(res.status, 404);
    });

    it('should cancel a running extract task', async () => {
      const task = createTask('extract', { archivePath: 'C.rar' });
      updateTask(task.id, { status: 'running' });
      const res = await request('DELETE', `/api/tasks/${task.id}`);
      assert.equal(res.status, 204);
      assert.equal(getTask(task.id).status, 'cancelled');
    });

    it('should remove a completed task', async () => {
      const task = createTask('move', { source: 'A', dest: 'B' });
      updateTask(task.id, { status: 'completed' });
      const res = await request('DELETE', `/api/tasks/${task.id}`);
      assert.equal(res.status, 204);
      assert.equal(getTask(task.id), undefined);
    });

    it('should remove a pending task', async () => {
      const task = createTask('move', { source: 'A', dest: 'B' });
      const res = await request('DELETE', `/api/tasks/${task.id}`);
      assert.equal(res.status, 204);
      assert.equal(getTask(task.id), undefined);
    });

    it('should return 403 when trying to cancel a running move task', async () => {
      const task = createTask('move', { source: 'A', dest: 'B' });
      updateTask(task.id, { status: 'running' });
      const res = await request('DELETE', `/api/tasks/${task.id}`);
      assert.equal(res.status, 403);
      assert.equal(getTask(task.id).status, 'running');
    });

    it('should remove a failed task', async () => {
      const task = createTask('extract', { archivePath: 'C.rar' });
      updateTask(task.id, { status: 'failed', error: 'boom' });
      const res = await request('DELETE', `/api/tasks/${task.id}`);
      assert.equal(res.status, 204);
      assert.equal(getTask(task.id), undefined);
    });
  });

  describe('GET /api/tasks/events (SSE)', () => {
    it('should send snapshot on connect', async () => {
      createTask('move', { source: 'A', dest: 'B' });
      const url = new URL('/api/tasks/events', baseUrl);
      url.searchParams.set('token', process.env.SSE_TOKEN || 'test-token');
      const res = await fetch(url);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/event-stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let data = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        data += decoder.decode(value, { stream: true });
        if (data.includes('\n\n')) break;
      }
      reader.cancel();

      const match = data.match(/^data: (.+)\n\n/m);
      assert.ok(match, 'should have SSE data line');
      const parsed = JSON.parse(match[1]);
      assert.equal(parsed.type, 'snapshot');
      assert.ok(Array.isArray(parsed.tasks));
      assert.equal(parsed.tasks.length, 1);
      assert.ok(!('childProcess' in parsed.tasks[0]));
    });

    it('should send update event when task changes', async () => {
      const url = new URL('/api/tasks/events', baseUrl);
      url.searchParams.set('token', process.env.SSE_TOKEN || 'test-token');
      const res = await fetch(url);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let data = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        data += decoder.decode(value, { stream: true });
        if (data.includes('\n\n')) break;
      }

      const task = createTask('extract', { archivePath: 'X.rar' });
      updateTask(task.id, { progress: 50 });

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        data += decoder.decode(value, { stream: true });
        if (data.split('\n\n').length > 3) break;
      }
      reader.cancel();

      const events = data
        .split('\n\n')
        .filter((s) => s.startsWith('data: '))
        .map((s) => JSON.parse(s.replace('data: ', '')));

      const snapshot = events.find((e) => e.type === 'snapshot');
      assert.ok(snapshot);

      const updates = events.filter((e) => e.type === 'update');
      assert.ok(updates.length >= 1, 'should have at least one update event');
    });

    it('snapshot should not include childProcess', async () => {
      createTask('move', { source: 'A', dest: 'B' });
      const url = new URL('/api/tasks/events', baseUrl);
      url.searchParams.set('token', process.env.SSE_TOKEN || 'test-token');
      const res = await fetch(url);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let data = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        data += decoder.decode(value, { stream: true });
        if (data.includes('\n\n')) break;
      }
      reader.cancel();
      const match = data.match(/^data: (.+)\n\n/m);
      const parsed = JSON.parse(match[1]);
      for (const t of parsed.tasks) {
        assert.ok(!('childProcess' in t));
      }
    });
  });
});
