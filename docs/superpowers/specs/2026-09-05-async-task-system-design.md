# Async Task System — Background Move & Extract with Progress

## Problem

Current relocate (`PUT /games/:id/relocate`) is a synchronous blocking API. Cross-drive folder moves for large games (RPG with thousands of small files on HDD) exceed the 600s timeout. Archive extraction is not supported at all. There is no progress feedback — just a spinner.

## Solution

Build an in-memory async task system with SSE-based real-time progress. File moves use `robocopy` (multi-threaded, reliable, progress-capable). Archive extraction uses CLI tools (UnRAR/7z/7z-zstd) with password auto-try. A global task panel in the UI shows live progress with badge counts.

## Design

### 1. Backend — Task Manager Core (`server/tasks.js`)

In-memory task manager. Tasks live only during the application session (not persisted to DB).

**Task object:**

```js
{
  id: string,          // uuid
  type: 'move' | 'extract',
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
  label: string,       // e.g. "Moving: SomeGame" or "Extracting: SomeGame.rar"
  progress: number,    // 0-100
  detail: string,      // e.g. "Scanning files..." / "Copying 1234/5678"
  error: string | null,
  createdAt: Date,
  completedAt: Date | null,
  meta: {
    source: string,
    dest: string,
    gameId: number,
    totalFiles?: number,      // move
    copiedFiles?: number,     // move
    archivePath?: string,     // extract
    passwordUsed?: string,    // extract
  }
}
```

**API:**

| Endpoint                | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `GET /api/tasks`        | List all tasks                                        |
| `DELETE /api/tasks/:id` | Cancel (extract only) or remove completed/failed task |
| `GET /api/tasks/events` | SSE stream — pushes task state changes in real-time   |

**SSE behavior:**

- New connections receive a snapshot of all current tasks
- Any task state change pushes the updated task object
- Heartbeat every 15s to prevent timeout
- Client auto-reconnects on disconnect (3s interval)

**Cancellation rules:**

- Move tasks: **cannot be cancelled** — killing robocopy mid-copy leaves the target in an incomplete state with no safe recovery. No cancel button in UI.
- Extract tasks: can be cancelled — kill child process, delete target directory contents (source archive untouched).

### 2. Backend — File Move via robocopy

**Flow:**

1. **Conflict check** (before creating task):
   - Target doesn't exist → proceed
   - Target exists and is empty directory → proceed (robocopy merges)
   - Target exists and non-empty → return 409 `{ error, conflict: true }`. Frontend prompts user; if confirmed, re-request with `force: true` to skip check.

2. **Same-drive optimization**: If source and target are on the same drive, use `fs.promises.rename()` (instant, no task needed). Only cross-drive moves go through robocopy.

3. **Scan phase**: `robocopy <src> <dst> /L /NFL /NDL /NJH /NJS /NC /NS /NP` — `/L` flag lists files without copying. Parse output to count `totalFiles`. Task detail shows "Scanning files...".

4. **Copy phase**: `robocopy <src> <dst> /E /COPY:DAT /MT:8 /R:3 /W:5 /NP /LOG+:<logfile>`
   - `/E` — recursive including empty dirs
   - `/MT:8` — 8 parallel IO threads
   - `/R:3 /W:5` — retry 3 times, 5s between retries
   - `/NP` — no progress bar in console (we parse log instead)
   - `/LOG+:<logfile>` — append output to a temp log file

5. **Progress tracking**: Watch the log file with `fs.watch` + readline. Each `New File` line increments `copiedFiles`. Progress = `copiedFiles / totalFiles * 100`. Push updates via SSE.

6. **Post-copy**: robocopy exit codes 0-7 = success, 8+ = error. On success, delete source directory with `fs.promises.rm(src, { recursive: true, force: true })`.

7. **DB update**: Update `game.library_id` and `game.sub_path` to reflect new location.

### 3. Backend — Archive Extraction via CLI Tools

**Tool selection by format:**

| Format                | Priority           |
| --------------------- | ------------------ |
| `.rar`                | UnRAR.exe > 7z.exe |
| `.zip`                | UnRAR.exe > 7z.exe |
| `.7z`                 | 7z.exe or 7z-zstd  |
| `.zst` / zstd volumes | 7z-zstd only       |

**Tool auto-detection** (`GET /api/settings/detect-tools`):

Scans common install paths:

- UnRAR.exe: `C:\Program Files\WinRAR\UnRAR.exe`, `C:\Program Files (x86)\WinRAR\UnRAR.exe`
- 7z.exe: `C:\Program Files\7-Zip\7z.exe`, `C:\Program Files (x86)\7-Zip\7z.exe`
- 7z-zstd: `C:\Program Files\7-Zip-ZStandard\7z.exe`, `%LOCALAPPDATA%\Programs\7-Zip-ZStandard\7z.exe`

Returns found paths. Users can override in Settings (stored in `setting.extract_tools`).

**Extraction flow:**

1. **Target check**: Target exists and non-empty → conflict error. Empty dir → proceed.
2. **Password attempt**: Read `setting.archive_passwords` from DB.
   - Try extraction without password first
   - If exit code indicates password error, try each password from the list sequentially
   - If all fail, task status = `failed`, error = "All passwords failed"
3. **Execute extraction**:
   - UnRAR.exe: `unrar x -p<password> -o+ "<archive>" "<dest>\"`
   - 7z.exe: `7z x -p<password> -o"<dest>" "<archive>"`
   - Parse stdout for progress percentage (regex `(\d+)%`)
4. **Post-extraction**:
   - Add archive's `sub_path` to `setting.archived_archives` (JSON array)
   - Update `game.sub_path` to point to extracted directory
   - Do NOT delete the source archive

**Volume support**: Point CLI tool at the first volume file — UnRAR/7z auto-detect subsequent volumes.

### 4. Backend — Relocate API Change

**Before** (synchronous): `PUT /games/:id/relocate` blocks until move completes.

**After** (async): Returns immediately with a task ID.

**Request:**

```json
{
  "newPath": "D:\\GAL\\SomeGame",
  "moveFiles": true,
  "force": false
}
```

**Response:**

```json
{
  "taskId": "uuid-xxx",
  "operation": "move" | "extract" | "update_only"
}
```

- `update_only`: No files to move/extract, just DB update. Returned synchronously, no task created.
- `move`: Cross-drive folder move task created.
- `extract`: Archive extraction task created.

For same-drive moves (instant rename), the API still returns synchronously with `operation: "move"` and `taskId: null` — the rename is done before response. Frontend checks: if `taskId` is null, the operation is already complete; refresh page data directly.

### 5. Backend — Archived Archives

**Setting key**: `archived_archives` — JSON array of `sub_path` strings.

These paths are excluded from scan results alongside the existing `blacklist`.

**API:**

| Endpoint                                        | Description          |
| ----------------------------------------------- | -------------------- |
| `GET /api/settings/archived-archives`           | Get list             |
| `POST /api/settings/archived-archives`          | Add entry `{ path }` |
| `DELETE /api/settings/archived-archives/:index` | Remove entry         |

**Settings page UI**: Separate section from blacklist. Each row shows path + "Copy Path" button + "Remove from list" button.

### 6. Backend — Archive Passwords

**Setting key**: `archive_passwords` — JSON array of password strings.

**Settings page UI**: List with add/delete. Passwords shown masked by default with reveal toggle.

### 7. Frontend — Task Panel & Badge

**MainLayout changes:**

- FAB button (icon `assignment`) in bottom-right corner
- Badge shows `runningCount` from taskStore when > 0
- Click opens bottom panel (`q-dialog` position bottom) with task list

**Task panel content per row:**

- Icon: `drive_file_move` (move) or `archive` (extract)
- Label text
- `q-linear-progress` bar with percentage
- Detail text (e.g. "Copying 1234/5678")
- Move tasks: no cancel button
- Extract tasks: cancel button (x icon)
- Completed/failed: status icon, clickable to dismiss

**Pinia store `taskStore`:**

- Connects to SSE `/api/tasks/events`
- Maintains `tasks` Map<id, Task>
- `runningCount` computed
- Auto-reconnect on disconnect (3s interval)

### 8. Frontend — Detail Page Relocate Flow Change

**Before**: `doRelocate` calls API with 600s timeout, shows "Moving files..." spinner.

**After**:

1. Call `PUT /games/:id/relocate` → get `{ taskId, operation }`
2. If `operation === "update_only"` or same-drive instant move → refresh page directly
3. Otherwise → close confirm dialog, task is visible in task panel
4. taskStore watches for task completion/failure via SSE → `$q.notify` + refresh page data

### 9. Electron — Exit & Shutdown Interception

**`before-quit` event:**

- Has running move tasks → `e.preventDefault()`, show dialog: "File move in progress. Closing now may cause data loss. Force quit?"
- Has running extract tasks only → show dialog: "Extract task running. Confirm close?" (safe to cancel)
- No running tasks → proceed normally

**`powerMonitor.on('shutdown')` event:**

- Has running move tasks → `e.preventDefault()` (Windows shows "This app is preventing shutdown" to user)
- Extract tasks only → allow shutdown (safe to cancel)

## Files to Modify/Create

| File                            | Change                                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| `server/tasks.js`               | **New** — Task manager, SSE, robocopy/extract execution             |
| `server/routes/game.js`         | Modify relocate route to create async tasks                         |
| `server/routes/setting.js`      | Add archived-archives, archive-passwords, detect-tools endpoints    |
| `server/routes/index.js`        | Mount task routes                                                   |
| `server/constants.js`           | Add tool detection paths, format-to-tool mapping                    |
| `src/stores/taskStore.ts`       | **New** — Pinia store for SSE connection and task state             |
| `src/components/TaskPanel.vue`  | **New** — Task panel dialog component                               |
| `src/layouts/MainLayout.vue`    | Add task FAB button + badge + TaskPanel                             |
| `src/pages/GameDetailPage.vue`  | Modify relocate flow to async                                       |
| `src/pages/SettingPage.vue`     | Add archive passwords, extraction tools, archived archives sections |
| `src-electron/electron-main.ts` | Add before-quit and powerMonitor shutdown handlers                  |

## Scan Exclusion Integration

In `server/routes/game.js` scan endpoints, merge `blacklist` and `archived_archives` for exclusion:

```js
const blacklist = await getBlacklist();
const archived = await getArchivedArchives();
const excludeSet = new Set([...blacklist, ...archived]);
```
