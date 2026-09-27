import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTask, updateTask } from './tasks.js';
import * as db from './database/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAN_DONE_KEY = 'similar_scan_done';

let worker = null;
let latestTaskId = null;

export const startSimilarWorker = async () => {
  if (worker) return;

  const workerPath = path.join(__dirname, 'similar-worker.js');
  worker = new Worker(workerPath);

  worker.on('message', (msg) => {
    if (msg.type === 'task-create') {
      const { type, meta } = msg.task;
      const task = createTask(type, meta);
      latestTaskId = task.id;
    } else if (msg.type === 'task-update') {
      let { id, patch } = msg;
      if (id === '__latest__') id = latestTaskId;
      if (id) updateTask(id, patch);
    } else if (msg.type === 'log') {
      console.log(msg.text);
    } else if (msg.type === 'warn') {
      console.warn(msg.text);
    }
  });

  worker.on('error', (err) => {
    console.warn('[similar-classifier] worker error:', err.message || err);
    worker = null;
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`[similar-classifier] worker exited with code ${code}`);
    }
    worker = null;
  });

  const done = await db.knex('setting').where({ key: SCAN_DONE_KEY }).first();
  if (!done) {
    requestFullScan();
  }
};

export const triggerSimilarScan = () => {
  if (!worker) return;
  worker.postMessage({ type: 'trigger-scan' });
};

export const requestFullScan = async () => {
  if (!worker) return null;
  const task = createTask('similar-scan', { mode: 'full' });
  latestTaskId = task.id;
  updateTask(task.id, { status: 'running', detail: 'Full scan starting...' });
  worker.postMessage({ type: 'run-scan', full: true, taskId: task.id });
  return task;
};