import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let worker = null;

export const initNsfwClassifier = async () => {
  // Model loading now happens inside the worker; nothing to do here.
};

export const startNsfwPolling = () => {
  if (worker) return;

  const workerPath = path.join(__dirname, 'nsfw-worker.js');
  worker = new Worker(workerPath);

  worker.on('message', (msg) => {
    if (msg.type === 'log') {
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