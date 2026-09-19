# Async Task System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synchronous relocate with an async task system supporting background file move (robocopy) and archive extraction (UnRAR/7z/7z-zstd) with real-time SSE progress, password auto-try, and exit/shutdown interception.

**Architecture:** In-memory task manager on the backend spawns child processes (robocopy for moves, CLI tools for extraction) and pushes progress via SSE. Frontend Pinia store connects SSE, drives a global task panel with badge. Electron main process intercepts quit/shutdown when move tasks are running.

**Tech Stack:** Express 5 (SSE), Node.js child_process (robocopy/7z/UnRAR), Pinia (taskStore), Quasar (UI), Electron (powerMonitor/before-quit)

## Global Constraints

- Follow existing code style: no comments unless asked, single quotes in JS, double quotes in JSON
- Use existing patterns: `db.knex` for DB, `api` from `useApi.ts` for HTTP, `window.electronAPI` for IPC
- Archive extensions defined in `server/constants.js` `ARCHIVE_EXTENSIONS`
- Path normalization: backslash, strip trailing slashes, case-insensitive comparison for library matching
- Run `npm run lint:check` and `npm run typecheck` after each task
- Windows-only: robocopy is Windows built-in

---

### Task 1: Backend — Task Manager Core (`server/tasks.js`)

**Files:**
- Create: `server/tasks.js`

**Interfaces:**
- Consumes: None
- Produces: `createTask(type, meta)`, `getTask(id)`, `getAllTasks()`, `updateTask(id, patch)`, `cancelTask(id)`, `removeTask(id)`, `hasRunningMoveTasks()`, `hasRunningTasks()`, `onTaskChange(callback)`, `attachChildProcess(id, child)`

- [ ] **Step 1: Create `server/tasks.js` with task manager**

```js
import { randomUUID } from 'node:crypto';

const tasks = new Map();
const listeners = new Set();

const notify = (task) => {
  for (const fn of listeners) fn(task);
};

const createTask = (type, meta) => {
  const task = {
    id: randomUUID(),
    type,
    status: 'pending',
    label: type === 'move' ? `Moving: ${meta.source.split('\\').pop()}` : `Extracting: ${meta.archivePath?.split('\\').pop() || ''}`,
    progress: 0,
    detail: 'Waiting...',
    error: null,
    createdAt: new Date(),
    completedAt: null,
    meta,
    childProcess: null,
  };
  tasks.set(task.id, task);
  notify(task);
  return task;
};

const getTask = (id) => tasks.get(id);

const getAllTasks = () => [...tasks.values()];

const updateTask = (id, patch) => {
  const task = tasks.get(id);
  if (!task) return;
  Object.assign(task, patch);
  if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'cancelled') {
    task.completedAt = new Date();
  }
  notify(task);
};

const cancelTask = (id) => {
  const task = tasks.get(id);
  if (!task || task.type === 'move') return false;
  if (task.childProcess) {
    task.childProcess.kill();
  }
  updateTask(id, { status: 'cancelled', detail: 'Cancelled' });
  return true;
};

const removeTask = (id) => {
  const task = tasks.get(id);
  if (!task) return;
  if (task.status === 'running' && task.type === 'move') return;
  if (task.childProcess && task.status === 'running') {
    task.childProcess.kill();
  }
  tasks.delete(id);
};

const hasRunningMoveTasks = () => [...tasks.values()].some((t) => t.status === 'running' && t.type === 'move');

const hasRunningTasks = () => [...tasks.values()].some((t) => t.status === 'running');

const onTaskChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const attachChildProcess = (id, child) => {
  const task = tasks.get(id);
  if (task) task.childProcess = child;
};

export {
  createTask,
  getTask,
  getAllTasks,
  updateTask,
  cancelTask,
  removeTask,
  hasRunningMoveTasks,
  hasRunningTasks,
  onTaskChange,
  attachChildProcess,
};
```

- [ ] **Step 2: Verify**

Run: `npm run lint:check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/tasks.js
git commit -m "feat: add in-memory task manager core"
```

---

### Task 2: Backend — Task Routes + SSE (`server/routes/task.js`)

**Files:**
- Create: `server/routes/task.js`
- Modify: `server/routes/index.js`

**Interfaces:**
- Consumes: `getAllTasks`, `cancelTask`, `removeTask`, `onTaskChange` from `server/tasks.js`
- Produces: `GET /api/tasks`, `DELETE /api/tasks/:id`, `GET /api/tasks/events` (SSE)

- [ ] **Step 1: Create `server/routes/task.js`**

```js
import express from 'express';
import { getAllTasks, cancelTask, removeTask, onTaskChange } from '../tasks.js';

const router = express.Router();

router.get('/', (_req, res) => {
  res.send(getAllTasks().map(({ childProcess, ...rest }) => rest));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const task = getAllTasks().find((t) => t.id === id);
  if (!task) {
    return res.status(404).send({ error: 'Task not found' });
  }
  if (task.status === 'running' && task.type === 'move') {
    return res.status(403).send({ error: 'Move tasks cannot be cancelled' });
  }
  if (task.status === 'running') {
    cancelTask(id);
  } else {
    removeTask(id);
  }
  res.status(204).end();
});

router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const snapshot = getAllTasks().map(({ childProcess, ...rest }) => rest);
  res.write(`data: ${JSON.stringify({ type: 'snapshot', tasks: snapshot })}\n\n`);

  const onChange = (task) => {
    const { childProcess, ...rest } = task;
    res.write(`data: ${JSON.stringify({ type: 'update', task: rest })}\n\n`);
  };

  const unsubscribe = onTaskChange(onChange);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
```

- [ ] **Step 2: Mount in `server/routes/index.js`**

Add import at top:

```js
import taskRoutes from './task.js';
```

Add route after existing `router.use('/proxy', proxyRoutes);`:

```js
router.use('/tasks', taskRoutes);
```

- [ ] **Step 3: Verify**

Run: `npm run lint:check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/routes/task.js server/routes/index.js
git commit -m "feat: add task routes with SSE endpoint"
```

---

### Task 3: Backend — robocopy Move Executor

**Files:**
- Modify: `server/tasks.js`

**Interfaces:**
- Consumes: `createTask`, `updateTask`, `attachChildProcess` from `server/tasks.js`; `db.updateGame`, `db.getGameDetail`, `db.getLibraries` from `server/database/db.js`
- Produces: `executeMoveTask(taskId, source, dest, gameId, newLibraryId, newSubPath)` — spawns robocopy, tracks progress, updates DB on completion

- [ ] **Step 1: Add `executeMoveTask` to `server/tasks.js`**

Add imports at top of file:

```js
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
```

Add function at bottom before export:

```js
const executeMoveTask = async (taskId, source, dest, gameId, newLibraryId, newSubPath) => {
  const sourceDrive = source.substring(0, 1).toLowerCase();
  const destDrive = dest.substring(0, 1).toLowerCase();

  if (sourceDrive === destDrive) {
    try {
      updateTask(taskId, { status: 'running', detail: 'Renaming...', progress: 50 });
      await fs.promises.rename(source, dest);
      await updateGameAfterMove(gameId, newLibraryId, newSubPath, taskId);
    } catch (err) {
      updateTask(taskId, { status: 'failed', error: err.message, detail: 'Rename failed' });
    }
    return;
  }

  updateTask(taskId, { status: 'running', detail: 'Scanning files...', progress: 0 });

  try {
    const totalFiles = await countFilesWithRobocopy(source, dest);
    updateTask(taskId, { meta: { ...getTask(taskId).meta, totalFiles }, detail: `Found ${totalFiles} files` });

    const logFile = path.join(os.tmpdir(), `robocopy-${taskId}.log`);
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

    const child = spawn('robocopy', [
      source, dest,
      '/E', '/COPY:DAT', '/MT:8', '/R:3', '/W:5', '/NP',
      `/LOG+:${logFile}`,
    ]);

    attachChildProcess(taskId, child);

    let copiedFiles = 0;
    let lastSize = 0;
    const pollInterval = setInterval(() => {
      try {
        const stat = fs.statSync(logFile);
        if (stat.size > lastSize) {
          lastSize = stat.size;
          const content = fs.readFileSync(logFile, 'utf-8');
          const newFileCount = (content.match(/New File/g) || []).length;
          if (newFileCount > copiedFiles) {
            copiedFiles = newFileCount;
            const progress = totalFiles > 0 ? Math.min(99, Math.round((copiedFiles / totalFiles) * 100)) : 0;
            updateTask(taskId, {
              progress,
              detail: `Copying ${copiedFiles}/${totalFiles}`,
              meta: { ...getTask(taskId).meta, copiedFiles },
            });
          }
        }
      } catch {}
    }, 1000);

    child.on('close', (code) => {
      clearInterval(pollInterval);
      try { fs.unlinkSync(logFile); } catch {}

      if (code <= 7) {
        updateTask(taskId, { progress: 99, detail: 'Deleting source...' });
        fs.promises.rm(source, { recursive: true, force: true })
          .then(() => updateGameAfterMove(gameId, newLibraryId, newSubPath, taskId))
          .catch((err) => updateTask(taskId, { status: 'failed', error: `Source deletion failed: ${err.message}`, detail: 'Move completed but source deletion failed' }));
      } else {
        updateTask(taskId, { status: 'failed', error: `robocopy exited with code ${code}`, detail: 'Move failed' });
        if (fs.existsSync(dest)) {
          try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
        }
      }
    });

    child.on('error', (err) => {
      clearInterval(pollInterval);
      updateTask(taskId, { status: 'failed', error: err.message, detail: 'Failed to start robocopy' });
    });
  } catch (err) {
    updateTask(taskId, { status: 'failed', error: err.message, detail: 'Scan failed' });
  }
};

const countFilesWithRobocopy = (source, dest) => {
  return new Promise((resolve, reject) => {
    const child = spawn('robocopy', [
      source, dest,
      '/L', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP',
    ]);
    let output = '';
    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });
    child.on('close', (code) => {
      const match = output.match(/Total\s+Copied\s+Skipped\s+Mismatch\s+FAIL\s+Extras\s+[\r\n]+\s+Files\s*:\s*(\d+)/);
      if (match) {
        resolve(parseInt(match[1], 10));
      } else {
        const newFileCount = (output.match(/New File/g) || []).length;
        resolve(newFileCount || 1);
      }
    });
    child.on('error', reject);
  });
};

const updateGameAfterMove = async (gameId, newLibraryId, newSubPath, taskId) => {
  const db = (await import('./database/db.js'));
  await db.updateGame(gameId, { library_id: newLibraryId, sub_path: newSubPath });
  updateTask(taskId, { status: 'completed', progress: 100, detail: 'Move completed', completedAt: new Date() });
};
```

Add `executeMoveTask` to the export list.

- [ ] **Step 2: Verify**

Run: `npm run lint:check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/tasks.js
git commit -m "feat: add robocopy move executor with progress tracking"
```

---

### Task 4: Backend — Archive Extraction Executor

**Files:**
- Modify: `server/tasks.js`
- Modify: `server/constants.js`

**Interfaces:**
- Consumes: `createTask`, `updateTask`, `attachChildProcess` from `server/tasks.js`; `db.getSetting`, `db.setSetting`, `db.updateGame` from `server/database/db.js`; `ARCHIVE_EXTENSIONS` from `server/constants.js`
- Produces: `executeExtractTask(taskId, archivePath, dest, gameId, newLibraryId, newSubPath)`, `detectExtractTools()`

- [ ] **Step 1: Add tool detection paths to `server/constants.js`**

Add at bottom before export:

```js
const EXTRACT_TOOL_PATHS = {
  unrar: [
    'C:\\Program Files\\WinRAR\\UnRAR.exe',
    'C:\\Program Files (x86)\\WinRAR\\UnRAR.exe',
  ],
  sevenzip: [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ],
  sevenzipZstd: [
    'C:\\Program Files\\7-Zip-ZStandard\\7z.exe',
    `${process.env.LOCALAPPDATA || ''}\\Programs\\7-Zip-ZStandard\\7z.exe`,
  ],
};

const FORMAT_TOOL_PRIORITY = {
  '.rar': ['unrar', 'sevenzip'],
  '.zip': ['unrar', 'sevenzip'],
  '.7z': ['sevenzip', 'sevenzipZstd'],
  '.zst': ['sevenzipZstd'],
};
```

Update export:

```js
export { NON_GAME_DIRS, ARCHIVE_EXTENSIONS, VOLUME_PATTERNS, EXTRACT_TOOL_PATHS, FORMAT_TOOL_PRIORITY };
```

- [ ] **Step 2: Add `detectExtractTools` and `executeExtractTask` to `server/tasks.js`**

Add imports:

```js
import { ARCHIVE_EXTENSIONS, EXTRACT_TOOL_PATHS, FORMAT_TOOL_PRIORITY } from './constants.js';
```

Add functions before export:

```js
const detectExtractTools = () => {
  const found = {};
  for (const [tool, paths] of Object.entries(EXTRACT_TOOL_PATHS)) {
    for (const p of paths) {
      if (fs.existsSync(p)) {
        found[tool] = p;
        break;
      }
    }
  }
  return found;
};

const getEffectiveTools = async () => {
  const db = (await import('./database/db.js'));
  const savedStr = await db.getSetting('extract_tools');
  if (savedStr) {
    try {
      const saved = JSON.parse(savedStr);
      return saved;
    } catch {}
  }
  return detectExtractTools();
};

const selectTool = (ext, tools) => {
  const priority = FORMAT_TOOL_PRIORITY[ext];
  if (!priority) return null;
  for (const toolName of priority) {
    if (tools[toolName]) return { name: toolName, path: tools[toolName] };
  }
  return null;
};

const executeExtractTask = async (taskId, archivePath, dest, gameId, newLibraryId, newSubPath) => {
  const ext = path.extname(archivePath).toLowerCase();
  const tools = await getEffectiveTools();
  const tool = selectTool(ext, tools);

  if (!tool) {
    updateTask(taskId, { status: 'failed', error: `No extraction tool found for ${ext}`, detail: 'No tool available' });
    return;
  }

  const db = (await import('./database/db.js'));
  const passwordsStr = await db.getSetting('archive_passwords');
  const passwords = passwordsStr ? JSON.parse(passwordsStr) : [];
  const allPasswords = [null, ...passwords];

  updateTask(taskId, { status: 'running', detail: `Extracting with ${tool.name}...`, progress: 0 });

  for (const pwd of allPasswords) {
    const result = await tryExtract(taskId, tool, archivePath, dest, pwd);
    if (result === 'success') {
      const archiveSubPath = getTask(taskId).meta.archiveSubPath;
      if (archiveSubPath) {
        const archivedStr = await db.getSetting('archived_archives');
        const archived = archivedStr ? JSON.parse(archivedStr) : [];
        if (!archived.includes(archiveSubPath)) {
          archived.push(archiveSubPath);
          await db.setSetting('archived_archives', JSON.stringify(archived));
        }
      }
      await db.updateGame(gameId, { library_id: newLibraryId, sub_path: newSubPath });
      updateTask(taskId, { status: 'completed', progress: 100, detail: 'Extraction completed', completedAt: new Date() });
      return;
    }
    if (result === 'error') {
      return;
    }
  }

  updateTask(taskId, { status: 'failed', error: 'All passwords failed', detail: 'No matching password found' });
};

const tryExtract = (taskId, tool, archivePath, dest, password) => {
  return new Promise((resolve) => {
    let args;
    if (tool.name === 'unrar') {
      args = ['x', password ? `-p${password}` : '-p-', '-o+', archivePath, dest + '\\'];
    } else {
      args = ['x', password ? `-p${password}` : '-p0', `-o${dest}`, '-aoa', archivePath];
    }

    const child = spawn(tool.path, args);
    attachChildProcess(taskId, child);

    let lastProgress = 0;
    child.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/(\d+)%/);
      if (match) {
        const p = parseInt(match[1], 10);
        if (p > lastProgress) {
          lastProgress = p;
          updateTask(taskId, { progress: p, detail: `Extracting ${p}%` });
        }
      }
    });

    let stderrText = '';
    child.stderr.on('data', (data) => { stderrText += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 || (tool.name === 'unrar' && code === 1)) {
        resolve('success');
      } else if ((tool.name === 'unrar' && code === 2) || (tool.name !== 'unrar' && code === 2)) {
        resolve('wrong_password');
      } else {
        const task = getTask(taskId);
        if (task && task.status === 'cancelled') {
          resolve('error');
          return;
        }
        updateTask(taskId, { status: 'failed', error: `Exit code ${code}: ${stderrText}`, detail: 'Extraction failed' });
        resolve('error');
      }
    });

    child.on('error', (err) => {
      updateTask(taskId, { status: 'failed', error: err.message, detail: 'Failed to start extraction tool' });
      resolve('error');
    });
  });
};
```

Add `executeExtractTask`, `detectExtractTools`, `getEffectiveTools` to the export list.

- [ ] **Step 3: Verify**

Run: `npm run lint:check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/tasks.js server/constants.js
git commit -m "feat: add archive extraction executor with password auto-try"
```

---

### Task 5: Backend — Relocate API Rewrite

**Files:**
- Modify: `server/routes/game.js`

**Interfaces:**
- Consumes: `createTask`, `executeMoveTask`, `executeExtractTask` from `server/tasks.js`; `ARCHIVE_EXTENSIONS` from `server/constants.js`
- Produces: `PUT /games/:id/relocate` returns `{ taskId, operation }` immediately

- [ ] **Step 1: Replace the existing `PUT /:id/relocate` route in `server/routes/game.js`**

Add import at top:

```js
import { createTask, executeMoveTask, executeExtractTask } from '../tasks.js';
```

Replace the entire `router.put('/:id/relocate', ...)` handler with:

```js
router.put('/:id/relocate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPath, moveFiles, force } = req.body;
    if (!newPath || typeof newPath !== 'string') {
      return res.status(400).send({ error: 'newPath is required' });
    }

    const game = await db.knex('game').where({ id: Number(id) }).first();
    if (!game) {
      return res.status(404).send({ error: 'Game not found' });
    }

    const normalizePath = (p) => p.replace(/\//g, '\\').replace(/\\+$/, '');
    const normalizedNew = normalizePath(newPath);

    const currentFullPath = game.library_id
      ? normalizePath((await db.knex('library').where({ id: game.library_id }).first())?.path || '') + '\\' + normalizePath(game.sub_path)
      : normalizePath(game.sub_path);

    if (normalizedNew.toLowerCase() === currentFullPath.toLowerCase()) {
      return res.status(400).send({ error: 'New path is the same as current path' });
    }

    const ext = path.extname(currentFullPath).toLowerCase();
    const isArchive = ARCHIVE_EXTENSIONS.has(ext);

    let newLibraryId = null;
    let newSubPath = normalizedNew;

    const libraries = await db.getLibraries();
    for (const lib of libraries) {
      const libNorm = normalizePath(lib.path);
      if (normalizedNew.toLowerCase().startsWith(libNorm.toLowerCase() + '\\')) {
        newLibraryId = lib.id;
        newSubPath = normalizedNew.substring(libNorm.length + 1);
        break;
      }
    }

    if (!moveFiles) {
      await db.updateGame(Number(id), { library_id: newLibraryId, sub_path: newSubPath });
      const updated = await db.getGameDetail(Number(id));
      return res.send({ ...updated, operation: 'update_only', taskId: null });
    }

    if (isArchive) {
      const destExists = fs.existsSync(normalizedNew);
      if (destExists) {
        const files = fs.readdirSync(normalizedNew);
        if (files.length > 0 && !force) {
          return res.status(409).send({ error: 'Target path already exists and is not empty', conflict: true });
        }
      } else {
        fs.mkdirSync(normalizedNew, { recursive: true });
      }

      const task = createTask('extract', {
        source: currentFullPath,
        dest: normalizedNew,
        gameId: Number(id),
        archivePath: currentFullPath,
        archiveSubPath: game.sub_path,
      });

      void executeExtractTask(task.id, currentFullPath, normalizedNew, Number(id), newLibraryId, newSubPath);

      return res.send({ operation: 'extract', taskId: task.id });
    }

    const sourceExists = fs.existsSync(currentFullPath);
    if (!sourceExists) {
      await db.updateGame(Number(id), { library_id: newLibraryId, sub_path: newSubPath });
      const updated = await db.getGameDetail(Number(id));
      return res.send({ ...updated, operation: 'update_only', taskId: null });
    }

    const destExists = fs.existsSync(normalizedNew);
    if (destExists) {
      const files = fs.readdirSync(normalizedNew);
      if (files.length > 0 && !force) {
        return res.status(409).send({ error: 'Target path already exists and is not empty', conflict: true });
      }
    }

    const sourceDrive = currentFullPath.substring(0, 1).toLowerCase();
    const destDrive = normalizedNew.substring(0, 1).toLowerCase();

    if (sourceDrive === destDrive) {
      try {
        await fs.promises.rename(currentFullPath, normalizedNew);
        await db.updateGame(Number(id), { library_id: newLibraryId, sub_path: newSubPath });
        const updated = await db.getGameDetail(Number(id));
        return res.send({ ...updated, operation: 'move', taskId: null });
      } catch (err) {
        return res.status(500).send({ error: `Rename failed: ${err.message}` });
      }
    }

    const task = createTask('move', {
      source: currentFullPath,
      dest: normalizedNew,
      gameId: Number(id),
    });

    void executeMoveTask(task.id, currentFullPath, normalizedNew, Number(id), newLibraryId, newSubPath);

    res.send({ operation: 'move', taskId: task.id });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Verify**

Run: `npm run lint:check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/routes/game.js
git commit -m "feat: rewrite relocate API as async task-based"
```

---

### Task 6: Backend — Settings API Extensions (Archived Archives, Passwords, Tool Detection)

**Files:**
- Modify: `server/routes/setting.js`

**Interfaces:**
- Consumes: `detectExtractTools` from `server/tasks.js`; `db.getSetting`, `db.setSetting` from `server/database/db.js`
- Produces: `GET /api/settings/archived-archives`, `POST /api/settings/archived-archives`, `DELETE /api/settings/archived-archives/:index`, `GET /api/settings/archive-passwords`, `PUT /api/settings/archive-passwords`, `GET /api/settings/detect-tools`, `GET /api/settings/extract-tools`, `PUT /api/settings/extract-tools`

- [ ] **Step 1: Add new routes to `server/routes/setting.js`**

Add import at top:

```js
import { detectExtractTools } from '../tasks.js';
```

Add before `export default router`:

```js
router.get('/archived-archives', async (_req, res, next) => {
  try {
    const val = await db.getSetting('archived_archives');
    res.send(val ? JSON.parse(val) : []);
  } catch (err) { next(err); }
});

router.post('/archived-archives', async (req, res, next) => {
  try {
    const { path: archivePath } = req.body;
    if (!archivePath) return res.status(400).send({ error: 'path is required' });
    const val = await db.getSetting('archived_archives');
    const list = val ? JSON.parse(val) : [];
    if (!list.includes(archivePath)) {
      list.push(archivePath);
      await db.setSetting('archived_archives', JSON.stringify(list));
    }
    res.send(list);
  } catch (err) { next(err); }
});

router.delete('/archived-archives/:index', async (req, res, next) => {
  try {
    const idx = Number(req.params.index);
    const val = await db.getSetting('archived_archives');
    const list = val ? JSON.parse(val) : [];
    if (idx >= 0 && idx < list.length) {
      list.splice(idx, 1);
      await db.setSetting('archived_archives', JSON.stringify(list));
    }
    res.send(list);
  } catch (err) { next(err); }
});

router.get('/archive-passwords', async (_req, res, next) => {
  try {
    const val = await db.getSetting('archive_passwords');
    res.send(val ? JSON.parse(val) : []);
  } catch (err) { next(err); }
});

router.put('/archive-passwords', async (req, res, next) => {
  try {
    const { passwords } = req.body;
    if (!Array.isArray(passwords)) return res.status(400).send({ error: 'passwords must be an array' });
    await db.setSetting('archive_passwords', JSON.stringify(passwords));
    res.send(passwords);
  } catch (err) { next(err); }
});

router.get('/detect-tools', (_req, res) => {
  res.send(detectExtractTools());
});

router.get('/extract-tools', async (_req, res, next) => {
  try {
    const val = await db.getSetting('extract_tools');
    res.send(val ? JSON.parse(val) : detectExtractTools());
  } catch (err) { next(err); }
});

router.put('/extract-tools', async (req, res, next) => {
  try {
    const { tools } = req.body;
    if (!tools || typeof tools !== 'object') return res.status(400).send({ error: 'tools object is required' });
    await db.setSetting('extract_tools', JSON.stringify(tools));
    res.send(tools);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Update scan endpoints to merge archived_archives into exclusion**

In `server/routes/game.js`, find the `getBlacklist` function and add after it:

```js
const getArchivedArchives = async () => {
  const row = await db.knex('setting').where({ key: 'archived_archives' }).first();
  if (!row) return [];
  try {
    return JSON.parse(row.value);
  } catch {
    return [];
  }
};
```

In the `router.get('/')` handler, after `const blacklist = await getBlacklist();`, add:

```js
const archived = await getArchivedArchives();
```

Change the blacklist merge line from:

```js
if (blacklist.length > 0) {
  const set = new Set(blacklist);
```

to:

```js
const excludeList = [...blacklist, ...archived];
if (excludeList.length > 0) {
  const set = new Set(excludeList);
```

Do the same in the `router.post('/scan')` handler — merge `archived` into the exclusion set alongside `blacklist`.

- [ ] **Step 3: Verify**

Run: `npm run lint:check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/routes/setting.js server/routes/game.js
git commit -m "feat: add archived archives, passwords, tool detection settings + scan exclusion"
```

---

### Task 7: Frontend — Pinia Task Store (`src/stores/taskStore.ts`)

**Files:**
- Create: `src/stores/taskStore.ts`

**Interfaces:**
- Consumes: `useExpressUrl` from `src/composables/useExpressUrl.ts`
- Produces: `useTaskStore()` — `tasks` ref, `runningCount` computed, `connectSSE()`, `disconnectSSE()`

- [ ] **Step 1: Create `src/stores/taskStore.ts`**

```ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useExpressUrl } from '../composables/useExpressUrl';

export interface Task {
  id: string;
  type: 'move' | 'extract';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  label: string;
  progress: number;
  detail: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  meta: {
    source: string;
    dest: string;
    gameId: number;
    totalFiles?: number;
    copiedFiles?: number;
    archivePath?: string;
    passwordUsed?: string;
  };
}

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Map<string, Task>>(new Map());
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const runningCount = computed(() =>
    [...tasks.value.values()].filter((t) => t.status === 'running' || t.status === 'pending').length
  );

  const hasRunningMoveTasks = computed(() =>
    [...tasks.value.values()].some((t) => t.status === 'running' && t.type === 'move')
  );

  const hasRunningTasks = computed(() =>
    [...tasks.value.values()].some((t) => t.status === 'running')
  );

  const connectSSE = () => {
    if (eventSource) return;

    const { getApiUrl } = useExpressUrl();
    const url = getApiUrl('/tasks/events');
    eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'snapshot') {
          const newMap = new Map<string, Task>();
          for (const task of data.tasks) {
            newMap.set(task.id, task);
          }
          tasks.value = newMap;
        } else if (data.type === 'update') {
          tasks.value.set(data.task.id, data.task);
        }
      } catch {}
    };

    eventSource.onerror = () => {
      disconnectSSE();
      reconnectTimer = setTimeout(() => {
        connectSSE();
      }, 3000);
    };
  };

  const disconnectSSE = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  return {
    tasks,
    runningCount,
    hasRunningMoveTasks,
    hasRunningTasks,
    connectSSE,
    disconnectSSE,
  };
});
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/taskStore.ts
git commit -m "feat: add Pinia task store with SSE connection"
```

---

### Task 8: Frontend — Task Panel Component (`src/components/TaskPanel.vue`)

**Files:**
- Create: `src/components/TaskPanel.vue`

**Interfaces:**
- Consumes: `useTaskStore` from `src/stores/taskStore.ts`; `api` from `src/composables/useApi.ts`

- [ ] **Step 1: Create `src/components/TaskPanel.vue`**

```vue
<template>
  <q-dialog v-model="show" position="bottom" seamless>
    <q-card style="min-width: 400px; max-width: 600px; max-height: 400px;" class="q-pa-sm">
      <div class="row items-center q-mb-sm">
        <div class="text-subtitle2" style="color: var(--m3-on-surface);">Background Tasks</div>
        <q-space />
        <q-btn flat round dense size="sm" icon="close" style="color: var(--m3-on-surface-variant);" @click="show = false" />
      </div>
      <q-scroll-area style="height: 300px;">
        <q-list dense>
          <q-item v-for="task in sortedTasks" :key="task.id" class="q-pa-xs">
            <q-item-section avatar>
              <q-icon
                :name="task.type === 'move' ? 'drive_file_move' : 'archive'"
                :color="statusColor(task)"
                size="sm"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label caption style="color: var(--m3-on-surface);">{{ task.label }}</q-item-label>
              <q-linear-progress
                v-if="task.status === 'running' || task.status === 'pending'"
                :value="task.progress / 100"
                color="primary"
                size="4px"
                class="q-mt-xs"
              />
              <div class="text-caption" style="color: var(--m3-on-surface-variant);">
                {{ task.detail }}
                <span v-if="task.status === 'running'"> ({{ task.progress }}%)</span>
              </div>
              <div v-if="task.error" class="text-caption text-negative">{{ task.error }}</div>
            </q-item-section>
            <q-item-section side>
              <q-btn
                v-if="task.status === 'running' && task.type === 'extract'"
                flat
                round
                dense
                size="sm"
                icon="close"
                color="grey-7"
                @click="cancelTask(task.id)"
              >
                <q-tooltip>Cancel</q-tooltip>
              </q-btn>
              <q-btn
                v-if="task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'"
                flat
                round
                dense
                size="sm"
                icon="delete"
                color="grey-7"
                @click="removeTask(task.id)"
              >
                <q-tooltip>Remove</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
          <q-item v-if="sortedTasks.length === 0">
            <q-item-section>
              <q-item-label caption class="text-center" style="color: var(--m3-on-surface-variant);">No tasks</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import api from '../composables/useApi';
import { useTaskStore, type Task } from '../stores/taskStore';

const taskStore = useTaskStore();

const show = defineModel<boolean>({ default: false });

const sortedTasks = computed(() =>
  [...taskStore.tasks.values()].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
);

const statusColor = (task: Task) => {
  if (task.status === 'completed') return 'positive';
  if (task.status === 'failed') return 'negative';
  if (task.status === 'cancelled') return 'grey';
  return 'primary';
};

const cancelTask = async (id: string) => {
  await api.delete(`/tasks/${id}`);
};

const removeTask = async (id: string) => {
  await api.delete(`/tasks/${id}`);
};
</script>
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TaskPanel.vue
git commit -m "feat: add TaskPanel component with progress display"
```

---

### Task 9: Frontend — MainLayout Integration (FAB + Badge + SSE)

**Files:**
- Modify: `src/layouts/MainLayout.vue`

**Interfaces:**
- Consumes: `useTaskStore` from `src/stores/taskStore.ts`; `TaskPanel` from `src/components/TaskPanel.vue`

- [ ] **Step 1: Add task FAB + badge + TaskPanel to MainLayout**

In the `<template>`, add before `</q-layout>` closing tag:

```html
    <q-page-sticky position="bottom-right" :offset="[16, 16]">
      <q-btn
        fab
        icon="assignment"
        color="primary"
        @click="showTaskPanel = true"
      >
        <q-badge v-if="taskStore.runningCount > 0" color="red" floating>{{ taskStore.runningCount }}</q-badge>
        <q-tooltip>Tasks</q-tooltip>
      </q-btn>
    </q-page-sticky>

    <TaskPanel v-model="showTaskPanel" />
```

In the `<script setup>`, add imports:

```ts
import { useTaskStore } from '../stores/taskStore';
import TaskPanel from '../components/TaskPanel.vue';
```

Add after existing refs:

```ts
const taskStore = useTaskStore();
const showTaskPanel = ref(false);

taskStore.connectSSE();
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/layouts/MainLayout.vue
git commit -m "feat: add task FAB with badge and TaskPanel to MainLayout"
```

---

### Task 10: Frontend — Detail Page Relocate Flow Update

**Files:**
- Modify: `src/pages/GameDetailPage.vue`

**Interfaces:**
- Consumes: `useTaskStore` from `src/stores/taskStore.ts`

- [ ] **Step 1: Update `doRelocate` to handle async task response**

Replace the existing `doRelocate` function with:

```ts
const doRelocate = async () => {
  if (!game.value || !editPathValue.value.trim()) return;
  const isArchiveRelocate = relocateInfo.value?.moveDisabled;
  const targetPath = editPathValue.value.trim();
  const sourcePath = relocateInfo.value?.source || '';
  confirmRelocate.value = false;
  relocating.value = true;
  try {
    const res = await api.put(`/games/${game.value.id}/relocate`, {
      newPath: targetPath,
      moveFiles: relocateMoveFiles.value,
    });

    const { taskId, operation } = res.data;

    editingPath.value = false;
    relocating.value = false;

    if (!taskId) {
      await loadGame();
      if (isArchiveRelocate) {
        try {
          await navigator.clipboard.writeText(targetPath);
        } catch {}
        $q.dialog({
          title: 'Archive Relocated',
          message: 'Target path copied to clipboard. Open the archive for extraction?',
          cancel: true,
          persistent: false,
        }).onOk(() => {
          if (sourcePath) {
            void window.electronAPI?.openPath(sourcePath);
          }
        });
      }
      return;
    }

    $q.notify({
      type: 'info',
      message: operation === 'move' ? 'File move started in background' : 'Extraction started in background',
      icon: operation === 'move' ? 'drive_file_move' : 'archive',
    });

    const taskStore = (await import('../stores/taskStore')).useTaskStore();
    const unwatch = taskStore.$subscribe((_mutation, state) => {
      const task = state.tasks.get(taskId);
      if (!task) return;
      if (task.status === 'completed') {
        unwatch();
        $q.notify({ type: 'positive', message: task.type === 'move' ? 'Move completed' : 'Extraction completed' });
        void loadGame();
      } else if (task.status === 'failed') {
        unwatch();
        $q.notify({ type: 'negative', message: task.error || 'Task failed' });
      }
    });
  } catch (err: any) {
    relocating.value = false;
    if (err.response?.status === 409 && err.response.data?.conflict) {
      $q.dialog({
        title: 'Target Conflict',
        message: 'Target path already exists and is not empty. Continue anyway?',
        cancel: true,
        persistent: true,
      }).onOk(() => {
        relocateMoveFiles.value = relocateMoveFiles.value;
        void doRelocateWithForce(targetPath);
      });
    }
  }
};

const doRelocateWithForce = async (targetPath: string) => {
  if (!game.value) return;
  relocating.value = true;
  try {
    const res = await api.put(`/games/${game.value.id}/relocate`, {
      newPath: targetPath,
      moveFiles: relocateMoveFiles.value,
      force: true,
    });
    const { taskId, operation } = res.data;
    editingPath.value = false;
    relocating.value = false;

    if (!taskId) {
      await loadGame();
      return;
    }

    $q.notify({
      type: 'info',
      message: operation === 'move' ? 'File move started in background' : 'Extraction started in background',
    });

    const taskStore = (await import('../stores/taskStore')).useTaskStore();
    const unwatch = taskStore.$subscribe((_mutation, state) => {
      const task = state.tasks.get(taskId);
      if (!task) return;
      if (task.status === 'completed') {
        unwatch();
        $q.notify({ type: 'positive', message: 'Task completed' });
        void loadGame();
      } else if (task.status === 'failed') {
        unwatch();
        $q.notify({ type: 'negative', message: task.error || 'Task failed' });
      }
    });
  } catch {
    relocating.value = false;
  }
};
```

Remove the old "Moving files..." dialog (the `<q-dialog :model-value="relocating" persistent>` block) since progress is now in the task panel.

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/GameDetailPage.vue
git commit -m "feat: update relocate flow to async task-based"
```

---

### Task 11: Frontend — Settings Page Extensions

**Files:**
- Modify: `src/pages/SettingPage.vue`

**Interfaces:**
- Consumes: `api` from `src/composables/useApi.ts`

- [ ] **Step 1: Add Archive Passwords, Extraction Tools, and Archived Archives sections to SettingPage**

Add after the Blacklist card in `<template>`:

```html
      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Archive Passwords</div>
          <div class="m3-label-medium q-mb-sm">Passwords to try when extracting encrypted archives. Tried in order, no password first.</div>
        </q-card-section>
        <q-card-section>
          <q-markup-table flat bordered dense>
            <thead>
              <tr>
                <th class="text-left">Password</th>
                <th class="text-right" style="width: 80px">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pwd, idx) in archivePasswords" :key="idx">
                <td>
                  <span v-if="!passwordVisible[idx]">••••••••</span>
                  <span v-else>{{ pwd }}</span>
                  <q-btn flat round dense size="xs" :icon="passwordVisible[idx] ? 'visibility_off' : 'visibility'" color="grey-7" class="q-ml-xs" @click="passwordVisible[idx] = !passwordVisible[idx]" />
                </td>
                <td class="text-right">
                  <q-btn flat round size="sm" icon="delete" style="color: var(--m3-error);" @click="removePassword(idx)" />
                </td>
              </tr>
              <tr v-if="archivePasswords.length === 0">
                <td colspan="2" class="text-center" style="color: var(--m3-on-surface-variant);">No passwords</td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card-section>
        <q-card-section>
          <div class="row q-gutter-sm items-center">
            <q-input v-model="newPassword" label="Password" type="password" outlined dense class="m3-input" style="max-width: 300px" @keyup.enter="addPassword" />
            <q-btn unelevated class="m3-btn--tonal" label="Add" dense @click="addPassword" />
          </div>
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Extraction Tools</div>
          <div class="m3-label-medium q-mb-sm">Auto-detected paths. Override manually if needed.</div>
        </q-card-section>
        <q-card-section>
          <div class="q-gutter-sm">
            <div class="row items-center q-gutter-sm">
              <div class="text-body2" style="min-width: 100px; color: var(--m3-on-surface);">UnRAR.exe</div>
              <q-input v-model="extractTools.unrar" outlined dense class="m3-input" style="flex: 1" />
              <q-icon :name="extractTools.unrar ? 'check_circle' : 'cancel'" :color="extractTools.unrar ? 'positive' : 'negative'" size="sm" />
            </div>
            <div class="row items-center q-gutter-sm">
              <div class="text-body2" style="min-width: 100px; color: var(--m3-on-surface);">7z.exe</div>
              <q-input v-model="extractTools.sevenzip" outlined dense class="m3-input" style="flex: 1" />
              <q-icon :name="extractTools.sevenzip ? 'check_circle' : 'cancel'" :color="extractTools.sevenzip ? 'positive' : 'negative'" size="sm" />
            </div>
            <div class="row items-center q-gutter-sm">
              <div class="text-body2" style="min-width: 100px; color: var(--m3-on-surface);">7z-zstd</div>
              <q-input v-model="extractTools.sevenzipZstd" outlined dense class="m3-input" style="flex: 1" />
              <q-icon :name="extractTools.sevenzipZstd ? 'check_circle' : 'cancel'" :color="extractTools.sevenzipZstd ? 'positive' : 'negative'" size="sm" />
            </div>
          </div>
        </q-card-section>
        <q-card-section>
          <q-btn unelevated class="m3-btn--filled" label="Save Tools" @click="saveExtractTools" />
          <q-btn flat class="m3-btn--text q-ml-sm" label="Re-detect" @click="redetectTools" />
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Archived Archives</div>
          <div class="m3-label-medium q-mb-sm">Archives that have been extracted. Excluded from scans. Copy path to manually delete the archive file.</div>
        </q-card-section>
        <q-card-section>
          <q-markup-table flat bordered dense>
            <thead>
              <tr>
                <th class="text-left">Archive Path</th>
                <th class="text-right" style="width: 120px">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in archivedArchives" :key="idx">
                <td style="max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ item }}</td>
                <td class="text-right">
                  <q-btn flat round size="sm" icon="content_copy" style="color: var(--m3-primary);" @click="copyPath(item)">
                    <q-tooltip>Copy Path</q-tooltip>
                  </q-btn>
                  <q-btn flat round size="sm" icon="delete" style="color: var(--m3-error);" @click="removeArchivedArchive(idx)" />
                </td>
              </tr>
              <tr v-if="archivedArchives.length === 0">
                <td colspan="2" class="text-center" style="color: var(--m3-on-surface-variant);">No archived archives</td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card-section>
      </q-card>
```

Add corresponding script logic:

```ts
const archivePasswords = ref<string[]>([]);
const newPassword = ref('');
const passwordVisible = ref<boolean[]>([]);

const extractTools = ref<{ unrar: string; sevenzip: string; sevenzipZstd: string }>({
  unrar: '',
  sevenzip: '',
  sevenzipZstd: '',
});

const archivedArchives = ref<string[]>([]);

const fetchArchivePasswords = async () => {
  try {
    const res = await api.get('/settings/archive-passwords');
    archivePasswords.value = res.data;
    passwordVisible.value = res.data.map(() => false);
  } catch {
    archivePasswords.value = [];
  }
};

const addPassword = async () => {
  const pwd = newPassword.value;
  if (!pwd) return;
  archivePasswords.value.push(pwd);
  passwordVisible.value.push(false);
  newPassword.value = '';
  await api.put('/settings/archive-passwords', { passwords: archivePasswords.value });
};

const removePassword = async (idx: number) => {
  archivePasswords.value.splice(idx, 1);
  passwordVisible.value.splice(idx, 1);
  await api.put('/settings/archive-passwords', { passwords: archivePasswords.value });
};

const fetchExtractTools = async () => {
  try {
    const res = await api.get('/settings/extract-tools');
    extractTools.value = {
      unrar: res.data.unrar || '',
      sevenzip: res.data.sevenzip || '',
      sevenzipZstd: res.data.sevenzipZstd || '',
    };
  } catch {
    extractTools.value = { unrar: '', sevenzip: '', sevenzipZstd: '' };
  }
};

const saveExtractTools = async () => {
  await api.put('/settings/extract-tools', { tools: extractTools.value });
  $q.notify({ type: 'positive', message: 'Tools saved' });
};

const redetectTools = async () => {
  try {
    const res = await api.get('/settings/detect-tools');
    extractTools.value = {
      unrar: res.data.unrar || '',
      sevenzip: res.data.sevenzip || '',
      sevenzipZstd: res.data.sevenzipZstd || '',
    };
    await api.put('/settings/extract-tools', { tools: extractTools.value });
    $q.notify({ type: 'positive', message: 'Tools re-detected' });
  } catch {
    $q.notify({ type: 'negative', message: 'Detection failed' });
  }
};

const fetchArchivedArchives = async () => {
  try {
    const res = await api.get('/settings/archived-archives');
    archivedArchives.value = res.data;
  } catch {
    archivedArchives.value = [];
  }
};

const copyPath = async (item: string) => {
  try {
    await navigator.clipboard.writeText(item);
    $q.notify({ type: 'positive', message: 'Path copied' });
  } catch {}
};

const removeArchivedArchive = async (idx: number) => {
  await api.delete(`/settings/archived-archives/${idx}`);
  await fetchArchivedArchives();
};
```

Add to `onMounted`:

```ts
  void fetchArchivePasswords();
  void fetchExtractTools();
  void fetchArchivedArchives();
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingPage.vue
git commit -m "feat: add archive passwords, extraction tools, archived archives to settings"
```

---

### Task 12: Electron — Exit & Shutdown Interception

**Files:**
- Modify: `src-electron/electron-main.ts`
- Modify: `src-electron/electron-preload.ts`
- Modify: `src/types/electron.d.ts`

**Interfaces:**
- Consumes: `hasRunningMoveTasks`, `hasRunningTasks` from `server/tasks.js` (via dynamic import)

- [ ] **Step 1: Add IPC handlers for task state queries in `src-electron/electron-main.ts`**

Add after the existing `dialog:openPathForRelocate` handler:

```ts
  ipcMain.handle('tasks:hasRunningMoveTasks', async () => {
    try {
      const tasksModule = await import(
        pathToFileURL(path.resolve(getServerDir(), 'tasks.js')).href
      );
      return tasksModule.hasRunningMoveTasks();
    } catch {
      return false;
    }
  });

  ipcMain.handle('tasks:hasRunningTasks', async () => {
    try {
      const tasksModule = await import(
        pathToFileURL(path.resolve(getServerDir(), 'tasks.js')).href
      );
      return tasksModule.hasRunningTasks();
    } catch {
      return false;
    }
  });
```

- [ ] **Step 2: Add before-quit interception**

Replace the existing `app.on('before-quit', () => { isQuitting = true; });` with:

```ts
app.on('before-quit', (e) => {
  if (isQuitting) return;
  try {
    const tasksUrl = pathToFileURL(path.resolve(getServerDir(), 'tasks.js')).href;
    import(tasksUrl).then((tasksModule) => {
      if (tasksModule.hasRunningMoveTasks()) {
        e.preventDefault();
        isQuitting = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('task:move-in-progress');
        }
      } else {
        isQuitting = true;
      }
    }).catch(() => { isQuitting = true; });
  } catch {
    isQuitting = true;
  }
});
```

- [ ] **Step 3: Add powerMonitor shutdown interception**

Add after `app.on('before-quit', ...)`:

```ts
app.on('window-all-closed', () => {
  if (!closeToTray) {
    app.quit();
  }
});

try {
  const { powerMonitor } = await import('electron');
  powerMonitor.on('shutdown', (e) => {
    try {
      const tasksUrl = pathToFileURL(path.resolve(getServerDir(), 'tasks.js')).href;
      import(tasksUrl).then((tasksModule) => {
        if (tasksModule.hasRunningMoveTasks()) {
          e.preventDefault();
        }
      }).catch(() => {});
    } catch {}
  });
} catch {}
```

Remove the existing `app.on('window-all-closed', ...)` that was already there (to avoid duplicate).

- [ ] **Step 4: Add preload exposure**

In `src-electron/electron-preload.ts`, add to the `electronAPI` object:

```ts
  hasRunningMoveTasks: (): Promise<boolean> => ipcRenderer.invoke('tasks:hasRunningMoveTasks'),
  hasRunningTasks: (): Promise<boolean> => ipcRenderer.invoke('tasks:hasRunningTasks'),
```

- [ ] **Step 5: Add TypeScript declaration**

In `src/types/electron.d.ts`, add to `ElectronAPI`:

```ts
  hasRunningMoveTasks(): Promise<boolean>;
  hasRunningTasks(): Promise<boolean>;
```

- [ ] **Step 6: Handle `task:move-in-progress` IPC in MainLayout**

In `src/layouts/MainLayout.vue`, add in the script setup section after `taskStore.connectSSE()`:

```ts
if (window.electronAPI) {
  window.electronAPI.onMoveInProgress?.(() => {
    $q.dialog({
      title: 'Move In Progress',
      message: 'A file move is currently running. Closing now may cause data loss. Force quit?',
      cancel: true,
      persistent: true,
    }).onOk(() => {
      void window.electronAPI?.forceQuit?.();
    });
  });
}
```

Add corresponding IPC listener in `src-electron/electron-preload.ts`:

```ts
  onMoveInProgress: (callback: () => void) => {
    ipcRenderer.on('task:move-in-progress', callback);
  },
  forceQuit: (): Promise<void> => ipcRenderer.invoke('app:forceQuit'),
```

Add `app:forceQuit` handler in `src-electron/electron-main.ts`:

```ts
  ipcMain.handle('app:forceQuit', () => {
    isQuitting = true;
    app.quit();
  });
```

Update `src/types/electron.d.ts`:

```ts
  onMoveInProgress(callback: () => void): void;
  forceQuit(): Promise<void>;
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src-electron/electron-main.ts src-electron/electron-preload.ts src/types/electron.d.ts src/layouts/MainLayout.vue
git commit -m "feat: add exit/shutdown interception for running move tasks"
```

---

### Task 13: Integration Verification

**Files:** None new

- [ ] **Step 1: Run full lint and typecheck**

Run: `npm run lint:check && npm run typecheck`
Expected: No errors

- [ ] **Step 2: Manual smoke test checklist**

1. Start app with `npm run dev`
2. Go to Settings — verify Archive Passwords, Extraction Tools, Archived Archives sections render
3. Click "Re-detect" in Extraction Tools — verify paths populate
4. Go to a game detail page, click Edit Path, change to a different drive path
5. Confirm relocate — verify task appears in bottom-right FAB panel with progress
6. Verify badge count shows on FAB button
7. Verify SSE updates progress in real-time
8. Verify task completion shows `$q.notify`
9. Try closing app during a move — verify dialog appears
10. Verify archived archives list populates after extraction

- [ ] **Step 3: Commit final state**

```bash
git add -A
git commit -m "feat: complete async task system integration"
```