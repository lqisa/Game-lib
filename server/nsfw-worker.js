import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import { getDataDir } from './config.js';
import { getUnknownR18Games, storeDetectionResults } from './r18.js';

const BATCH_SIZE = 50;
const ACTIVE_INTERVAL_MS = 2_000;
const IDLE_INTERVAL_MS = 60_000;
const R18_THRESHOLD = 0.5;
const MODEL_INPUT_SIZE = 299;

const log = (text) => parentPort?.postMessage({ type: 'log', text });
const warn = (text) => parentPort?.postMessage({ type: 'warn', text });

let model = null;
let tf = null;
let classifyFn = null;
let sharp = null;
let baselineTensors = 0;

const formatMem = () => {
  if (!tf) return 'n/a';
  const m = tf.memory();
  return `tensors:${m.numTensors} ${(m.numBytes / 1024 / 1024).toFixed(1)}MB`;
};

const formatProcessMem = () => {
  const m = process.memoryUsage();
  return `rss:${(m.rss / 1024 / 1024).toFixed(0)}MB heap:${(m.heapUsed / 1024 / 1024).toFixed(0)}MB`;
};

const initModel = async () => {
  parentPort?.postMessage({
    type: 'task-create',
    task: { type: 'nsfw-scan', meta: { phase: 'model-load' } },
  });
  parentPort?.postMessage({
    type: 'task-update',
    id: '__latest__',
    patch: { status: 'running', detail: 'Loading NSFW model...' },
  });

  try {
    sharp = (await import('sharp')).default;

    await import('@tensorflow/tfjs-backend-wasm');
    tf = await import('@tensorflow/tfjs');
    await tf.setBackend('wasm');
    await tf.ready();

    const nsfwjs = await import('nsfwjs');
    model = await nsfwjs.load();
    classifyFn = model.classify.bind(model);

    baselineTensors = tf.memory().numTensors;
    log(
      `[nsfw-classifier] model loaded (wasm backend, worker), ${formatMem()}, process: ${formatProcessMem()}`,
    );
    parentPort?.postMessage({
      type: 'task-update',
      id: '__latest__',
      patch: { status: 'completed', progress: 100, detail: 'NSFW model loaded' },
    });
  } catch (err) {
    warn('[nsfw-classifier] model load failed, disabled: ' + (err.message || err));
    parentPort?.postMessage({
      type: 'task-update',
      id: '__latest__',
      patch: { status: 'failed', detail: 'Model load failed: ' + (err.message || err) },
    });
  }
};

const classifyImage = async (coverPath) => {
  const fullPath = path.join(getDataDir(), 'covers', coverPath);
  // No file, no verdict. Returning 0 here wrote the game down as "safe" for good, because only
  // rows whose r18 is still NULL are ever looked at again.
  if (!fs.existsSync(fullPath)) return null;

  let inputTensor;
  try {
    const rgb = await sharp(fullPath).resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE).raw().toBuffer();

    inputTensor = tf.tidy(() =>
      tf
        .tensor3d(new Uint8Array(rgb), [MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3], 'int32')
        .toFloat()
        .div(255),
    );

    const predictions = await classifyFn(inputTensor);

    const porn = predictions.find((p) => p.className === 'Porn')?.probability ?? 0;
    const sexy = predictions.find((p) => p.className === 'Sexy')?.probability ?? 0;
    return porn + sexy > R18_THRESHOLD ? 1 : 0;
  } catch {
    // A cover that cannot be decoded is the same thing: no answer, not a "safe" answer. A later
    // pass can still decide it, once the file is readable again.
    return null;
  } finally {
    if (inputTensor) inputTensor.dispose();
  }
};

const cleanupLeakedTensors = () => {
  if (!tf) return;
  const current = tf.memory().numTensors;
  if (current <= baselineTensors) return;

  const engine = tf.engine();
  engine.startScope();
  engine.endScope();

  const after = tf.memory().numTensors;
  const cleaned = current - after;
  if (cleaned > 0) {
    log(
      `[nsfw-classifier] cleaned ${cleaned} leaked tensors (was ${current}, baseline ${baselineTensors})`,
    );
  }
};

const runRound = async () => {
  if (!model || !classifyFn) return 0;

  const pending = await getUnknownR18Games(BATCH_SIZE);
  if (pending.length === 0) return 0;

  parentPort?.postMessage({
    type: 'task-create',
    task: { type: 'nsfw-scan', meta: { phase: 'classify', count: pending.length } },
  });
  parentPort?.postMessage({
    type: 'task-update',
    id: '__latest__',
    patch: { status: 'running', detail: `Classifying covers: 0/${pending.length}`, progress: 0 },
  });

  const results = [];
  let checked = 0;
  let unreadable = 0;
  for (const game of pending) {
    if (!game.cover_path) continue;
    const r18 = await classifyImage(game.cover_path);
    checked += 1;
    if (r18 === null) {
      // Leave it unknown and try again another round rather than storing a verdict nothing supports.
      unreadable += 1;
    } else {
      results.push({ gameId: game.id, r18 });
    }
    if (checked % 10 === 0 || checked === pending.length) {
      parentPort?.postMessage({
        type: 'task-update',
        id: '__latest__',
        patch: {
          detail: `Classifying covers: ${checked}/${pending.length}`,
          progress: Math.min(99, Math.round((checked / pending.length) * 100)),
        },
      });
    }
    // Yield brief moment to avoid starvation of OS scheduling and CPU
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  cleanupLeakedTensors();

  if (results.length > 0) {
    await storeDetectionResults(results);
  }

  parentPort?.postMessage({
    type: 'task-update',
    id: '__latest__',
    patch: {
      status: 'completed',
      progress: 100,
      detail:
        unreadable > 0
          ? `Classified ${results.length} covers (${unreadable} unreadable, left unknown)`
          : `Classified ${results.length} covers`,
    },
  });

  return results.length;
};

const startPolling = async () => {
  await initModel();

  let idleTicks = 0;
  const loop = () => {
    void runRound()
      .then((classified) => {
        if (classified > 0) {
          idleTicks = 0;
          log(
            `[nsfw-classifier] classified ${classified} covers, ${formatMem()}, process: ${formatProcessMem()}`,
          );
        } else {
          idleTicks++;
          if (idleTicks <= 3 || idleTicks % 10 === 0) {
            log(
              `[nsfw-classifier] idle (no pending covers), tick #${idleTicks}, next check in ${IDLE_INTERVAL_MS / 1000}s`,
            );
          }
        }
        const next = classified > 0 ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
        setTimeout(loop, next);
      })
      .catch((err) => {
        // A round that throws - a locked database, a query error - must not end the polling. The
        // loop used to die right here, leaving a worker that looked alive and never classified
        // anything again, with one warning line as the only trace.
        warn(`[nsfw-classifier] round failed: ${err.message || err}`);
        setTimeout(loop, IDLE_INTERVAL_MS);
      });
  };
  log(
    `[nsfw-classifier] polling started in worker (active=${ACTIVE_INTERVAL_MS}ms, idle=${IDLE_INTERVAL_MS}ms)`,
  );
  loop();
};

// Polling only belongs to the worker thread this module is written to be. Importing it - a test
// does exactly that - must not load a model, which would be a multi-second CPU and disk burst.
if (parentPort) startPolling();

export { classifyImage };
