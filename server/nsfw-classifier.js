import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTask, updateTask } from './tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let worker = null;
let latestTaskId = null;

export const initNsfwClassifier = async () => {};

export const startNsfwPolling = () => {
  if (worker) return;

  const workerPath = path.join(__dirname, 'nsfw-worker.js');
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
    console.warn('[nsfw-classifier] worker error:', err.message || err);
    worker = null;
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`[nsfw-classifier] worker exited with code ${code}`);
    }
    worker = null;
  });
};
