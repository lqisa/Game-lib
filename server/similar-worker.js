import { parentPort } from 'node:worker_threads';
import { computeSimilarPairs, prepareFullScan } from './similar.js';

const log = (text) => parentPort?.postMessage({ type: 'log', text });
const warn = (text) => parentPort?.postMessage({ type: 'warn', text });

const DEBOUNCE_MS = 5_000;

let scanRunning = false;
let needsRescan = false;
let debounceTimer = null;
let pairsFound = 0;

const runScan = async ({ full = false, taskId = null } = {}) => {
  if (scanRunning) return;

  scanRunning = true;
  pairsFound = 0;
  const mode = full ? 'full' : 'incremental';

  if (!taskId) {
    parentPort?.postMessage({
      type: 'task-create',
      task: { type: 'similar-scan', meta: { mode } },
    });
  } else {
    parentPort?.postMessage({
      type: 'task-update',
      id: taskId,
      patch: { status: 'running', detail: `${mode} scan starting...` },
    });
  }

  try {
    if (full) {
      await prepareFullScan();
    }

    const result = await computeSimilarPairs({
      full,
      isCancelled: () => false,
      onProgress: (comparisons, total) => {
        const progress = total > 0 ? Math.min(99, Math.round((comparisons / total) * 100)) : 0;
        parentPort?.postMessage({
          type: 'task-update',
          id: taskId || '__latest__',
          patch: { progress, detail: `${comparisons} comparisons, ${pairsFound} pairs` },
        });
      },
    });

    pairsFound = result.pairs;
    parentPort?.postMessage({
      type: 'task-update',
      id: taskId || '__latest__',
      patch: {
        status: 'completed',
        progress: 100,
        detail: `${result.comparisons} comparisons, ${result.pairs} similar pairs`,
      },
    });
  } catch (err) {
    warn(`[similar-worker] scan failed: ${err.message}`);
    parentPort?.postMessage({
      type: 'task-update',
      id: taskId || '__latest__',
      patch: { status: 'failed', detail: err.message },
    });
  } finally {
    scanRunning = false;
    if (needsRescan) {
      needsRescan = false;
      onTriggerScan();
    }
  }
};

const onTriggerScan = () => {
  if (scanRunning) {
    needsRescan = true;
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runScan({ full: false });
  }, DEBOUNCE_MS);
};

parentPort?.on('message', (msg) => {
  if (msg.type === 'trigger-scan') {
    onTriggerScan();
  } else if (msg.type === 'run-scan') {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    runScan({ full: msg.full, taskId: msg.taskId });
  } else if (msg.type === 'cancel') {
    needsRescan = false;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }
});

log('[similar-worker] ready');
