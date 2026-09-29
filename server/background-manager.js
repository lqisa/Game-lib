import { startSimilarWorker } from './similar-classifier.js';
import { startNsfwPolling } from './nsfw-classifier.js';
import { isTestEnv } from './config.js';

let started = false;

export const startBackgroundWorkers = () => {
  if (started) return;
  if (isTestEnv()) return;
  started = true;
  console.log(
    ' * [background-workers] Initial page render complete. Starting background workers...',
  );
  // Fire and forget, but never unhandled: a rejection here (a locked settings read) used to be an
  // unhandled rejection, which ends the main process - the whole app - by default.
  void startSimilarWorker().catch((err) => {
    console.warn('[background-workers] similar worker failed to start:', err.message || err);
  });
  startNsfwPolling();
};

export const areBackgroundWorkersStarted = () => started;
