# Background Workers: Similar Scan + NSFW Classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move similar-name scan to a Worker thread with event-driven triggers + 5s debounce, and integrate both workers (similar + nsfw) into the Task/SSE notification system.

**Architecture:** Two worker threads (similar-worker, nsfw-worker) communicate with the main thread via postMessage. Main-thread classifier files (similar-classifier.js, nsfw-classifier.js) translate worker messages into createTask/updateTask calls. The existing SSE system propagates task state to the UI TaskPanel.

**Tech Stack:** Node.js Worker Threads, existing Task/SSE system (tasks.js + routes/task.js), Vue 3 + Quasar (frontend)

## Global Constraints

- Worker protocol messages: `{ type: 'task-create', task }`, `{ type: 'task-update', id, patch }`, `{ type: 'log', text }`, `{ type: 'warn', text }`
- Similar scan debounce: 5 seconds
- `computeSimilarPairs` must remain directly importable from `similar.js` for tests
- `cache.js` adopt does NOT trigger similar scan (it only writes to adopt_cache staging table)
- NSFW worker: each active classification round gets its own task; idle rounds create no task
- Task types: `similar-scan`, `nsfw-scan` added alongside existing `move`, `extract`
- Workers use `__latest__` as a placeholder task ID when they don't know the real ID; classifiers map this to the most recently created task of that type

---

### Task 1: Create similar-worker.js

**Files:**
- Create: `server/similar-worker.js`

**Interfaces:**
- Consumes: `computeSimilarPairs` from `similar.js`, `db.js` for settings, `parentPort` from `node:worker_threads`
- Produces: Worker thread that handles `{ type: 'trigger-scan' }`, `{ type: 'run-scan', full, taskId }`, `{ type: 'cancel', taskId }` messages; sends `{ type: 'task-create' }`, `{ type: 'task-update' }`, `{ type: 'log' }`, `{ type: 'warn' }` back

- [ ] **Step 1: Write similar-worker.js**

The worker calls `computeSimilarPairs` directly (it's self-contained: loads games, computes pairs, writes to DB, advances cursor). The worker adds debounce logic and task reporting on top.

```js
import { parentPort } from 'node:worker_threads';
import { computeSimilarPairs } from './similar.js';
import * as db from './database/db.js';

const log = (text) => parentPort?.postMessage({ type: 'log', text });
const warn = (text) => parentPort?.postMessage({ type: 'warn', text });

const SCAN_DONE_KEY = 'similar_scan_done';
const SCAN_CURSOR_KEY = 'similar_scan_max_id';
const DEBOUNCE_MS = 5_000;

let scanRunning = false;
let needsRescan = false;
let debounceTimer = null;
let activeTaskId = null;
let pairsFound = 0;

const runScan = async ({ full = false, taskId = null } = {}) => {
  if (scanRunning) return;

  scanRunning = true;
  activeTaskId = taskId;
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
      await db.knex('game_similar').del();
      await db.knex('setting').where({ key: SCAN_CURSOR_KEY }).del();
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
    activeTaskId = null;
    if (needsRescan) {
      needsRescan = false;
      onTriggerScan();
    }
  }
};

const onTriggerScan = () => {
  if (scanRunning) { needsRescan = true; return; }
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
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    runScan({ full: msg.full, taskId: msg.taskId });
  } else if (msg.type === 'cancel') {
    needsRescan = false;
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  }
});

log('[similar-worker] ready');
```

- [ ] **Step 2: Verify worker file is syntactically valid**

Run: `node --check server/similar-worker.js`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add server/similar-worker.js
git commit -m "feat: add similar-worker.js with debounce and task protocol"
```

---

### Task 2: Create similar-classifier.js

**Files:**
- Create: `server/similar-classifier.js`

**Interfaces:**
- Consumes: `tasks.js` (createTask, updateTask), `db.js` (for first-boot check), `node:worker_threads`
- Produces: `startSimilarWorker()`, `triggerSimilarScan()`, `requestFullScan()`

- [ ] **Step 1: Write similar-classifier.js**

The classifier spawns the worker, handles `task-create`/`task-update` messages by calling `createTask`/`updateTask`, and exposes three public functions. It tracks `latestTaskId` to resolve the `__latest__` placeholder.

```js
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
```

- [ ] **Step 2: Verify syntax**

Run: `node --check server/similar-classifier.js`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add server/similar-classifier.js
git commit -m "feat: add similar-classifier.js main-thread side"
```

---

### Task 3: Trim similar.js

**Files:**
- Modify: `server/similar.js` — remove `runSimilarScan`, `maybeStartSimilarScan`, `startSimilarScanPolling`, and related imports/variables

**Interfaces:**
- Produces: `computeSimilarPairs` (unchanged, used by tests and worker)

- [ ] **Step 1: Remove the task/polling functions from similar.js**

Remove these items from `server/similar.js`:
- `import { createTask, getTask, updateTask } from './tasks.js';`
- `let scanRunning = false;`
- `const SCAN_POLL_MS = 60_000;`
- The entire `runSimilarScan` function (lines ~135-175)
- The entire `maybeStartSimilarScan` function (lines ~180-185)
- The entire `startSimilarScanPolling` function (lines ~190-197)

Keep: all other imports, `SIMILAR_THRESHOLD`, `YIELD_EVERY`, `INSERT_BATCH`, `SCAN_DONE_KEY`, `SCAN_CURSOR_KEY`, `getCursorId`, `setCursorId`, `setScanDone`, `loadGamesWithVendorNames`, `bestCrossVendorScore`, `computeSimilarPairs` and its export.

- [ ] **Step 2: Verify similar.js still exports computeSimilarPairs**

Run: `node -e "import('./server/similar.js').then(m => console.log(Object.keys(m)))"`
Expected: `[ 'computeSimilarPairs' ]`

- [ ] **Step 3: Commit**

```bash
git add server/similar.js
git commit -m "refactor: trim similar.js to pure computation (computeSimilarPairs only)"
```

---

### Task 4: Update tasks.js label map

**Files:**
- Modify: `server/tasks.js` — add `nsfw-scan` to the `createTask` label logic

**Interfaces:**
- Produces: `createTask` now handles `type === 'similar-scan'` and `type === 'nsfw-scan'`

- [ ] **Step 1: Update the label logic in createTask**

Current code (line ~17):
```js
label:
  type === 'move'
    ? `Moving: ${meta.source.split('\\').pop()}`
    : type === 'similar-scan'
      ? 'Finding similar games'
      : `Extracting: ${meta.archivePath?.split('\\').pop() || ''}`,
```

Change to:
```js
label:
  type === 'move'
    ? `Moving: ${meta.source.split('\\').pop()}`
    : type === 'similar-scan'
      ? 'Finding similar games'
      : type === 'nsfw-scan'
        ? 'Classifying covers'
        : `Extracting: ${meta.archivePath?.split('\\').pop() || ''}`,
```

- [ ] **Step 2: Verify syntax**

Run: `node --check server/tasks.js`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add server/tasks.js
git commit -m "feat: add nsfw-scan label to createTask"
```

---

### Task 5: Update nsfw-worker.js with task protocol

**Files:**
- Modify: `server/nsfw-worker.js` — add `task-create`/`task-update` messages for model loading, classification rounds, and errors

**Interfaces:**
- Consumes: `parentPort`, `r18.js` (getUnknownR18Games, storeDetectionResults)
- Produces: `task-create` / `task-update` messages alongside existing `log`/`warn`

- [ ] **Step 1: Add task messaging to nsfw-worker.js**

Full replacement file:

```js
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
  if (!fs.existsSync(fullPath)) return 0;

  let inputTensor;
  try {
    const rgb = await sharp(fullPath)
      .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)
      .raw()
      .toBuffer();

    inputTensor = tf.tidy(() =>
      tf.tensor3d(new Uint8Array(rgb), [MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3], 'int32')
        .toFloat()
        .div(255),
    );

    const predictions = await classifyFn(inputTensor);

    const porn = predictions.find((p) => p.className === 'Porn')?.probability ?? 0;
    const sexy = predictions.find((p) => p.className === 'Sexy')?.probability ?? 0;
    return porn + sexy > R18_THRESHOLD ? 1 : 0;
  } catch {
    return 0;
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
    log(`[nsfw-classifier] cleaned ${cleaned} leaked tensors (was ${current}, baseline ${baselineTensors})`);
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
  for (const game of pending) {
    if (!game.cover_path) continue;
    const r18 = await classifyImage(game.cover_path);
    results.push({ gameId: game.id, r18 });
    parentPort?.postMessage({
      type: 'task-update',
      id: '__latest__',
      patch: {
        detail: `Classifying covers: ${results.length}/${pending.length}`,
        progress: Math.min(99, Math.round((results.length / pending.length) * 100)),
      },
    });
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
      detail: `Classified ${results.length} covers`,
    },
  });

  return results.length;
};

const startPolling = async () => {
  await initModel();

  let idleTicks = 0;
  const loop = () => {
    void runRound().then((classified) => {
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
    });
  };
  log(`[nsfw-classifier] polling started in worker (active=${ACTIVE_INTERVAL_MS}ms, idle=${IDLE_INTERVAL_MS}ms)`);
  loop();
};

startPolling();
```

- [ ] **Step 2: Verify syntax**

Run: `node --check server/nsfw-worker.js`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add server/nsfw-worker.js
git commit -m "feat: nsfw-worker reports progress via task-create/task-update protocol"
```

---

### Task 6: Update nsfw-classifier.js to handle task messages

**Files:**
- Modify: `server/nsfw-classifier.js` — add `task-create`/`task-update` message handling

**Interfaces:**
- Produces: `startNsfwPolling()` (unchanged signature), now also forwards task messages to tasks.js

- [ ] **Step 1: Update nsfw-classifier.js message handler**

Full replacement file:

```js
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTask, updateTask } from './tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let worker = null;
let latestTaskId = null;

export const initNsfwClassifier = async () => {
};

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
```

- [ ] **Step 2: Verify syntax**

Run: `node --check server/nsfw-classifier.js`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add server/nsfw-classifier.js
git commit -m "feat: nsfw-classifier handles task-create/task-update from worker"
```

---

### Task 7: Update dev.js and electron-main.ts

**Files:**
- Modify: `server/dev.js` — replace similar.js imports with similar-classifier.js
- Modify: `src-electron/electron-main.ts` — replace similar.js imports with similar-classifier.js

**Interfaces:**
- Consumes: `similar-classifier.js` (startSimilarWorker), `nsfw-classifier.js` (startNsfwPolling)

- [ ] **Step 1: Update dev.js**

Replace import:
```js
import { maybeStartSimilarScan, startSimilarScanPolling } from './similar.js';
```
With:
```js
import { startSimilarWorker } from './similar-classifier.js';
```

Replace startup block:
```js
if (!isTestEnv()) {
  void maybeStartSimilarScan();
  startSimilarScanPolling();
  startNsfwPolling();
}
```
With:
```js
if (!isTestEnv()) {
  void startSimilarWorker();
  startNsfwPolling();
}
```

- [ ] **Step 2: Update electron-main.ts**

Replace lines 91-97:
```js
const similarUrl = pathToFileURL(path.resolve(serverDir, 'similar.js')).href;
const { maybeStartSimilarScan, startSimilarScanPolling } = await import(similarUrl);
void maybeStartSimilarScan();
startSimilarScanPolling();

const nsfwUrl = pathToFileURL(path.resolve(serverDir, 'nsfw-classifier.js')).href;
const { startNsfwPolling } = await import(nsfwUrl);
startNsfwPolling();
```
With:
```js
const similarClassifierUrl = pathToFileURL(path.resolve(serverDir, 'similar-classifier.js')).href;
const { startSimilarWorker } = await import(similarClassifierUrl);
void startSimilarWorker();

const nsfwUrl = pathToFileURL(path.resolve(serverDir, 'nsfw-classifier.js')).href;
const { startNsfwPolling } = await import(nsfwUrl);
startNsfwPolling();
```

- [ ] **Step 3: Verify syntax**

Run: `node --check server/dev.js`
Expected: No syntax errors

- [ ] **Step 4: Commit**

```bash
git add server/dev.js src-electron/electron-main.ts
git commit -m "refactor: switch to similar-classifier worker in dev.js and electron-main.ts"
```

---

### Task 8: Update routes — game.js and scraper.js

**Files:**
- Modify: `server/routes/game.js` — replace `runSimilarScan` import with `requestFullScan` from similar-classifier, add `triggerSimilarScan` on game creation
- Modify: `server/routes/scraper.js` — add `triggerSimilarScan` after adopt/batch-adopt

**Interfaces:**
- Consumes: `similar-classifier.js` (requestFullScan, triggerSimilarScan)

- [ ] **Step 1: Update game.js**

Replace import (line 7):
```js
import { runSimilarScan } from '../similar.js';
```
With:
```js
import { requestFullScan, triggerSimilarScan } from '../similar-classifier.js';
```

Replace the `/similar-scan` handler (lines 387-393):
```js
router.post('/similar-scan', async (req, res, next) => {
  try {
    const task = await runSimilarScan({ full: true });
    if (!task) return res.send({ skipped: true });
    return res.send({ taskId: task.id });
  } catch (err) {
    next(err);
  }
});
```
With:
```js
router.post('/similar-scan', async (req, res, next) => {
  try {
    const task = await requestFullScan();
    if (!task) return res.send({ skipped: true });
    return res.send({ taskId: task.id });
  } catch (err) {
    next(err);
  }
});
```

Find the `POST /` route for game creation and add `triggerSimilarScan()` after the game is successfully created (after the `res.send` or `res.json` call in the success path).

- [ ] **Step 2: Update scraper.js**

Add import at top:
```js
import { triggerSimilarScan } from '../similar-classifier.js';
```

After the single adopt handler succeeds (around line 438), add `triggerSimilarScan()` after `res.send(game)`:
```js
    res.send(game);
    triggerSimilarScan();
```

After the batch-adopt handler succeeds, add `triggerSimilarScan()` after the response is sent:
```js
    res.send(results);
    triggerSimilarScan();
```

- [ ] **Step 3: Verify syntax**

Run: `node --check server/routes/game.js && node --check server/routes/scraper.js`
Expected: No syntax errors

- [ ] **Step 4: Commit**

```bash
git add server/routes/game.js server/routes/scraper.js
git commit -m "feat: routes use similar-classifier for scan triggers"
```

---

### Task 9: Update frontend — taskStore.ts and TaskPanel.vue

**Files:**
- Modify: `src/stores/taskStore.ts` — add `similar-scan` and `nsfw-scan` to Task type union
- Modify: `src/components/TaskPanel.vue` — add icons for new task types

**Interfaces:**
- Consumes: SSE task updates (already working, just need type + icon support)

- [ ] **Step 1: Update taskStore.ts Task type**

Change the `type` field from:
```ts
type: 'move' | 'extract';
```
To:
```ts
type: 'move' | 'extract' | 'similar-scan' | 'nsfw-scan';
```

Update the `meta` type to accommodate all task types:
```ts
meta: {
    source?: string;
    dest?: string;
    gameId?: number;
    totalFiles?: number;
    copiedFiles?: number;
    archivePath?: string;
    passwordUsed?: string;
    mode?: string;
    phase?: string;
    count?: number;
    games?: number;
  };
```

- [ ] **Step 2: Update TaskPanel.vue icon logic**

Change the icon binding from:
```vue
:name="task.type === 'move' ? 'drive_file_move' : 'archive'"
```
To:
```vue
:name="
  task.type === 'move'
    ? 'drive_file_move'
    : task.type === 'similar-scan'
      ? 'content_copy'
      : task.type === 'nsfw-scan'
        ? 'visibility'
        : 'archive'
"
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit` (or the project's typecheck command)
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/stores/taskStore.ts src/components/TaskPanel.vue
git commit -m "feat: add similar-scan and nsfw-scan task types to frontend"
```

---

### Task 10: Run existing tests

**Files:**
- Test: `server/__tests__/similar-scan.test.js`

- [ ] **Step 1: Run the similar-scan tests**

Run: `node --test server/__tests__/similar-scan.test.js`
Expected: All tests pass (they import `computeSimilarPairs` directly, unaffected by worker changes)

- [ ] **Step 2: Run any other test suite**

Run: `npm test` (or the project's test command)
Expected: All tests pass

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address test failures from worker refactor"
```