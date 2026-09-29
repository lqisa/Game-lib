# Background Workers: Similar Scan + NSFW Classifier

## Problem

1. The similar-name scan runs on the main thread's event loop. With 2000+ games the
   O(n²) pairwise comparison (~2M pairs) blocks the API for tens of seconds, making
   the UI unresponsive on first boot or when a large library is adopted.

2. The NSFW classifier worker runs silently — it logs to console but has no
   integration with the Task/SSE system. The user sees no progress, no completion,
   and no error reporting. If the model fails to load or classification errors
   accumulate, there is no UI signal.

## Solution

1. Move the similar scan into a dedicated Worker thread. Replace the 60s polling
   loop with event-driven triggers: when games are added, debounce 5s then run an
   incremental scan. Delete is handled by SQLite CASCADE.

2. Make both workers report through the unified Task + SSE system. Each scan
   or classification pass creates a task, reports progress, and reports completion
   or failure. The UI's existing TaskPanel shows these alongside move/extract tasks.

## Architecture

### Similar Scan

```
Main thread                                Worker thread
──────────                                 ──────────
similar-classifier.js  ←──spawn──→        similar-worker.js
  startSimilarWorker()                      │
  triggerSimilarScan()   ──msg──→          debounce 5s → runScan({full:false})
  requestFullScan()      ──msg──→          runScan({full:true})
                                            │
  ←──msg──  task-create/start/progress      createTask / updateTask
  ←──msg──  task-complete/task-failed        updateTask (SSE → UI)
  ←──msg──  log/warn                        console.log / console.warn
```

### NSFW Classifier

```
Main thread                                Worker thread
──────────                                 ──────────
nsfw-classifier.js     ←──spawn──→        nsfw-worker.js
  startNsfwPolling()                        │
                                            load model → createTask
                                            classify loop → updateTask progress
                                            round done → updateTask completed
                                            error → updateTask failed
  ←──msg──  task-create/start/progress
  ←──msg──  task-complete/task-failed
  ←──msg──  log/warn
```

## File Changes

| File                           | Action   | Description                                                                                                       |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `similar-classifier.js`        | **new**  | Main-thread side: spawn worker, forward messages to tasks.js + console                                            |
| `similar-worker.js`            | **new**  | Worker entry: import db.js + match.js, execute scan, 5s debounce                                                  |
| `similar.js`                   | **trim** | Keep `computeSimilarPairs` (tests), remove `runSimilarScan` / `maybeStartSimilarScan` / `startSimilarScanPolling` |
| `nsfw-classifier.js`           | **edit** | Add task message handling: `task-create` / `task-update` → tasks.js                                               |
| `nsfw-worker.js`               | **edit** | Create/update tasks for model load, each classification round, and errors                                         |
| `tasks.js`                     | **edit** | Add `nsfw-scan` and `similar-scan` to task label map                                                              |
| `dev.js`                       | **edit** | Import from `similar-classifier.js`                                                                               |
| `electron-main.ts`             | **edit** | Import from `similar-classifier.js`                                                                               |
| `routes/game.js`               | **edit** | `POST /similar-scan` → `requestFullScan()`, `POST /` → `triggerSimilarScan()`                                     |
| `routes/scraper.js`            | **edit** | After adopt/batch-adopt → `triggerSimilarScan()`                                                                  |
| `src/stores/taskStore.ts`      | **edit** | Add `similar-scan` and `nsfw-scan` to Task type union                                                             |
| `src/components/TaskPanel.vue` | **edit** | Add icons for `similar-scan` / `nsfw-scan` task types                                                             |

## Worker Protocol

Both workers use the same message format. The main-thread classifier files
(`similar-classifier.js`, `nsfw-classifier.js`) translate worker messages into
`createTask`/`updateTask` calls, which propagate to the UI via SSE.

### main → worker

```js
// Similar scan only:
{
  type: 'trigger-scan';
} // Game added; debounce 5s then incremental
{
  type: ('run-scan', full, taskId);
} // API/manual trigger; immediate, taskId from main
{
  type: ('cancel', taskId);
} // Cancel running scan
```

### worker → main (both workers)

```js
// Task lifecycle:
{ type: 'task-create', task: { id, type, label, meta } }  // Worker wants a new task
{ type: 'task-update', id, patch }                        // Progress/status update

// Logging:
{ type: 'log', text }
{ type: 'warn', text }
```

Main-thread handling of `task-create`: calls `createTask(type, meta)`, then sends
the generated `task.id` back to the worker if the protocol needs it (e.g. similar scan
needs the ID for progress updates). For NSFW, the worker creates its own task ID
and sends it in `task-create` so it can update it later.

### NSFW task lifecycle

| Phase         | Task type   | Status      | Detail                                 |
| ------------- | ----------- | ----------- | -------------------------------------- |
| Model loading | `nsfw-scan` | `running`   | "Loading NSFW model..."                |
| Model loaded  | `nsfw-scan` | `running`   | "Classifying covers: 0/N"              |
| Each round    | `nsfw-scan` | `running`   | "Classifying covers: X/N" (progress %) |
| All done      | `nsfw-scan` | `completed` | "Classified N covers"                  |
| Model fail    | `nsfw-scan` | `failed`    | error message                          |
| Round error   | `nsfw-scan` | `running`   | continues, error logged                |

The NSFW task stays alive across rounds (it's a long-running daemon). It transitions
to `completed` when an idle round finds zero pending covers. If new covers arrive later
(e.g. after adopt), the next active round creates a fresh task.

**Alternative (chosen)**: Each active round gets its own task. This is simpler and
matches the similar-scan pattern. Idle rounds create no task. The task goes
`pending → running → completed/failed` per batch of pending covers.

## Debounce Logic (inside similar-worker)

```js
let scanRunning = false;
let needsRescan = false;
let debounceTimer = null;
const DEBOUNCE_MS = 5_000;

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

const afterScan = () => {
  scanRunning = false;
  if (needsRescan) {
    needsRescan = false;
    onTriggerScan();
  }
};
```

## First Boot

`startSimilarWorker()` spawns the worker, then checks `similar_scan_done` setting:

- Missing → send `{ type: 'run-scan', full: true, taskId }` for full scan
- Present → no trigger; wait for game changes

## Trigger Points

| Location                  | Event                       | Call                   |
| ------------------------- | --------------------------- | ---------------------- |
| `routes/scraper.js` adopt | Single/batch adopt complete | `triggerSimilarScan()` |
| `routes/game.js` POST /   | Manual game creation        | `triggerSimilarScan()` |

Delete: `game_similar` rows removed by `ON DELETE CASCADE` on foreign keys. No worker trigger needed.

Note: `routes/cache.js` adopt only writes to `adopt_cache` (a staging table), not
`game_source`. It does not change the data that similar scan depends on, so it does
NOT trigger `triggerSimilarScan()`.

## Tests

`similar-scan.test.js` imports `computeSimilarPairs` directly — pure computation,
no worker involvement. Unchanged.

## similar-classifier.js API

```js
export const startSimilarWorker = async () => { ... }  // Spawn worker, maybe first-boot scan
export const triggerSimilarScan = () => { ... }        // Debounced incremental
export const requestFullScan = async () => { ... }     // Immediate full scan, returns taskId
```

## nsfw-classifier.js API (updated)

```js
export const startNsfwPolling = () => { ... }  // Spawn worker (unchanged signature)
```

The worker now sends `task-create`/`task-update` messages instead of just `log`/`warn`.
The main-thread handler maps them to `createTask`/`updateTask`.

## tasks.js Changes

Add `nsfw-scan` and `similar-scan` to the `createTask` label map:

```js
label: type === 'move'
  ? `Moving: ...`
  : type === 'similar-scan'
    ? 'Finding similar games'
    : type === 'nsfw-scan'
      ? 'Classifying covers'
      : `Extracting: ...`;
```

## Frontend Changes

### taskStore.ts

Add `similar-scan` and `nsfw-scan` to the `Task.type` union:

```ts
type: 'move' | 'extract' | 'similar-scan' | 'nsfw-scan';
```

### TaskPanel.vue

Add icons for the new task types:

- `similar-scan` → `content_copy` (duplicate detection)
- `nsfw-scan` → `visibility` (content classification)

Both task types are non-cancellable from the UI (they complete on their own).
Completed/failed tasks can be dismissed like existing tasks.
