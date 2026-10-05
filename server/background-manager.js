import { startSimilarWorker } from './similar-classifier.js';
import { startNsfwPolling } from './nsfw-classifier.js';
import { startBackupScheduler } from './backup.js';
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
  // The backup scheduler only reads settings and decides whether a backup is due (plus an
  // hourly re-check); its own errors are caught and logged inside.
  startBackupScheduler();
};

export const areBackgroundWorkersStarted = () => started;
