# Relocate Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow editing game path on the Detail page, with automatic file move and library re-association.

**Architecture:** New `PUT /games/:id/relocate` backend API handles path resolution, library matching, and file operations. Frontend adds inline path editing with confirmation dialog. Electron IPC adds a combined folder/file picker.

**Tech Stack:** Quasar/Vue 3 frontend, Express 5 backend, Electron IPC, SQLite via Knex

## Global Constraints

- Follow existing code style: no comments unless asked, single quotes in JS, double quotes in JSON
- Use existing patterns: `db.knex` for DB, `api` from `useApi.ts` for HTTP, `window.electronAPI` for IPC
- Archive extensions defined in `server/constants.js` `ARCHIVE_EXTENSIONS`
- Path normalization: backslash, strip trailing slashes, case-insensitive comparison for library matching
- Run `npm run lint:check` and `npm run typecheck` after each task

---

### Task 1: Electron IPC — Open Path for Relocate

**Files:**
- Modify: `src-electron/electron-main.ts`
- Modify: `src-electron/electron-preload.ts`
- Modify: `src/types/electron.d.ts`

**Interfaces:**
- Consumes: None (first task)
- Produces: `window.electronAPI.openPathForRelocate(): Promise<string | null>`

- [ ] **Step 1: Add IPC handler in electron-main.ts**

Add after the existing `dialog:openDirectory` handler (around line 262):

```typescript
ipcMain.handle('dialog:openPathForRelocate', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'openFile'],
    title: 'Select Game Path',
    filters: [
      { name: 'Archives', extensions: ['zip', '7z', 'rar', '001'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
```

- [ ] **Step 2: Expose in preload**

Add to the `electronAPI` object in `electron-preload.ts`:

```typescript
openPathForRelocate: (): Promise<string | null> =>
  ipcRenderer.invoke('dialog:openPathForRelocate'),
```

- [ ] **Step 3: Add TypeScript declaration**

In `src/types/electron.d.ts`, add `openPathForRelocate` to the `ElectronAPI` interface:

```typescript
openPathForRelocate: () => Promise<string | null>;
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src-electron/electron-main.ts src-electron/electron-preload.ts src/types/electron.d.ts
git commit -m "feat: add openPathForRelocate IPC for folder/file picker"
```

---

### Task 2: Backend API — `PUT /games/:id/relocate`

**Files:**
- Modify: `server/routes/game.js`

**Interfaces:**
- Consumes: `ARCHIVE_EXTENSIONS` from `server/constants.js`, `db.knex` from `server/database/db.js`, `getGameDetail` from `server/database/db.js`
- Produces: `PUT /games/:id/relocate` endpoint accepting `{ newPath: string }`, returning updated game detail

- [ ] **Step 1: Add the relocate route**

Add the following route to `server/routes/game.js`, before the `export default router` line. Import `ARCHIVE_EXTENSIONS` at the top alongside the existing imports.

Add to imports at top of file:

```javascript
import { ARCHIVE_EXTENSIONS } from '../constants.js';
```

Add route before `export default router`:

```javascript
router.put('/:id/relocate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPath } = req.body;
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

    const ext = path.extname(normalizedNew).toLowerCase();
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

    let operation = 'update_only';
    let moveSource = null;
    let moveDest = null;

    if (!isArchive) {
      const sourceExists = fs.existsSync(currentFullPath);
      const destExists = fs.existsSync(normalizedNew);

      if (destExists) {
        return res.status(409).send({ error: 'Target path already exists' });
      }

      if (sourceExists) {
        operation = 'move';
        moveSource = currentFullPath;
        moveDest = normalizedNew;
      }
    }

    if (operation === 'move') {
      const sourceDrive = moveSource.substring(0, 1).toLowerCase();
      const destDrive = moveDest.substring(0, 1).toLowerCase();

      try {
        if (sourceDrive === destDrive) {
          fs.renameSync(moveSource, moveDest);
        } else {
          fs.cpSync(moveSource, moveDest, { recursive: true });
          fs.rmSync(moveSource, { recursive: true, force: true });
        }
      } catch (moveErr) {
        if (sourceDrive !== destDrive && fs.existsSync(moveDest)) {
          try { fs.rmSync(moveDest, { recursive: true, force: true }); } catch {}
        }
        return res.status(500).send({ error: `Failed to move files: ${moveErr.message}` });
      }
    }

    await db.updateGame(Number(id), {
      library_id: newLibraryId,
      sub_path: newSubPath,
    });

    const updated = await db.getGameDetail(Number(id));
    res.send({ ...updated, operation });
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
git commit -m "feat: add PUT /games/:id/relocate API endpoint"
```

---

### Task 3: Frontend — Detail Page Path Editing UI

**Files:**
- Modify: `src/pages/GameDetailPage.vue`

**Interfaces:**
- Consumes: `PUT /games/:id/relocate` API from Task 2, `window.electronAPI.openPathForRelocate()` from Task 1
- Produces: Inline path editing with confirmation dialog on the Detail page

- [ ] **Step 1: Add path editing state variables**

Add these refs after the existing `deleting` ref (around line 131):

```typescript
const editingPath = ref(false);
const editPathValue = ref('');
const relocating = ref(false);
const confirmRelocate = ref(false);
const relocateInfo = ref<{ operation: string; source: string; target: string } | null>(null);
```

- [ ] **Step 2: Add path editing helper functions**

Add these functions after the `openDir` function (around line 163):

```typescript
const currentFullPath = computed(() => {
  if (!game.value?.sub_path) return '';
  return isAbsolute(game.value.sub_path)
    ? game.value.sub_path
    : game.value.library?.path
      ? game.value.library.path + '\\' + game.value.sub_path
      : '';
});

const startEditPath = () => {
  editPathValue.value = currentFullPath.value;
  editingPath.value = true;
};

const cancelEditPath = () => {
  editingPath.value = false;
  editPathValue.value = '';
};

const browseForRelocate = async () => {
  if (!window.electronAPI?.openPathForRelocate) return;
  const selected = await window.electronAPI.openPathForRelocate();
  if (selected) {
    editPathValue.value = selected;
  }
};

const submitEditPath = async () => {
  const newPath = editPathValue.value.trim();
  if (!newPath || newPath === currentFullPath.value) {
    editingPath.value = false;
    return;
  }

  const srcExists = !!currentFullPath.value;
  const ext = newPath.split('.').pop()?.toLowerCase() || '';
  const archiveExts = ['zip', '7z', 'rar', '001', '002', '003', '004', '005', '006', '007', '008', '009'];
  const isArchive = archiveExts.includes(ext);

  let operation = 'update_only';
  if (!isArchive && srcExists) {
    operation = 'move';
  }

  relocateInfo.value = {
    operation,
    source: currentFullPath.value,
    target: newPath,
  };
  confirmRelocate.value = true;
};

const doRelocate = async () => {
  if (!game.value || !editPathValue.value.trim()) return;
  relocating.value = true;
  try {
    await api.put(`/games/${game.value.id}/relocate`, {
      newPath: editPathValue.value.trim(),
    });
    editingPath.value = false;
    confirmRelocate.value = false;
    relocating.value = false;
    await loadGame();
  } catch (err) {
    relocating.value = false;
    confirmRelocate.value = false;
  }
};
```

- [ ] **Step 3: Replace the path display section in the template**

Replace the existing path display div (the one with `Path: {{ game.library ? ... }}`) with:

```html
<div v-if="!editingPath" class="text-caption text-grey q-mt-sm">
  Path: {{ game.library ? game.library.path + '\\' + game.sub_path : game.sub_path }}
  <q-btn
    v-if="hasElectronAPI"
    flat
    round
    dense
    size="sm"
    icon="folder_open"
    color="grey-7"
    @click="openDir"
  >
    <q-tooltip>Open Directory</q-tooltip>
  </q-btn>
  <q-btn
    flat
    round
    dense
    size="sm"
    icon="edit"
    color="grey-7"
    @click="startEditPath"
  >
    <q-tooltip>Edit Path</q-tooltip>
  </q-btn>
</div>
<div v-else class="q-mt-sm row items-center q-gutter-xs">
  <q-input
    v-model="editPathValue"
    dense
    outlined
    style="flex: 1; min-width: 0"
    @keyup.enter="submitEditPath"
    @keyup.escape="cancelEditPath"
  />
  <q-btn
    v-if="hasElectronAPI"
    flat
    round
    dense
    size="sm"
    icon="folder_open"
    color="grey-7"
    @click="browseForRelocate"
  >
    <q-tooltip>Browse</q-tooltip>
  </q-btn>
  <q-btn flat round dense size="sm" icon="check" color="positive" @click="submitEditPath">
    <q-tooltip>Save</q-tooltip>
  </q-btn>
  <q-btn flat round dense size="sm" icon="close" color="grey-7" @click="cancelEditPath">
    <q-tooltip>Cancel</q-tooltip>
  </q-btn>
</div>
```

- [ ] **Step 4: Add confirmation and loading dialogs**

Add these dialogs before the closing `</q-page>` tag, after the existing `ScrapeDialog` component:

```html
<q-dialog v-model="confirmRelocate" persistent>
  <q-card>
    <q-card-section class="text-h6">Confirm Path Change</q-card-section>
    <q-card-section>
      <div class="q-mb-sm">
        <span class="text-grey">From: </span>{{ relocateInfo?.source }}
      </div>
      <div class="q-mb-md">
        <span class="text-grey">To: </span>{{ relocateInfo?.target }}
      </div>
      <q-banner v-if="relocateInfo?.operation === 'move'" dense class="bg-blue-1 text-blue-9 rounded-borders">
        <template v-slot:avatar>
          <q-icon name="drive_file_move" color="blue" />
        </template>
        Will move folder to new location
      </q-banner>
      <q-banner v-else dense class="bg-orange-1 text-orange-9 rounded-borders">
        <template v-slot:avatar>
          <q-icon name="edit_note" color="orange" />
        </template>
        Will only update path record (file will not be moved)
      </q-banner>
    </q-card-section>
    <q-card-actions align="right">
      <q-btn flat label="Cancel" color="grey" v-close-popup />
      <q-btn flat label="Confirm" color="primary" @click="doRelocate" :loading="relocating" />
    </q-card-actions>
  </q-card>
</q-dialog>

<q-dialog :model-value="relocating" persistent seamless>
  <q-card class="q-pa-lg" style="min-width: 200px">
    <div class="column items-center">
      <q-spinner size="40px" color="primary" />
      <div class="q-mt-sm text-body2">Moving files...</div>
    </div>
  </q-card>
</q-dialog>
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint:check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/pages/GameDetailPage.vue
git commit -m "feat: add path editing UI with relocate confirmation on Detail page"
```