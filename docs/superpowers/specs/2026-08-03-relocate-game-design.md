# Relocate Game — Path Update & Auto File Move

## Problem

Games stored on NAS (H:\GAL) need to be moved to local disk (D:\GAL). Current workflow requires: manually copy files → delete game record → re-scan → re-scrape. This is tedious and loses existing scrape data.

## Solution

Allow editing game path directly on the Detail page. When the path changes, the system automatically determines whether to move files or just update the record, and preserves all existing scrape data.

## Design

### 1. Frontend — Detail Page Path Editing

**Current:** Path is read-only text + "Open Directory" button.

**New behavior:**

- Add an edit button (pencil icon) next to the path display
- On click: path text becomes a `q-input`, with a browse button (folder_open icon) + save button (check) + cancel button (close)
- Browse button opens an Electron dialog that supports both folder and file selection (file filter: `.zip .7z .rar .001`)
- User can also type a path directly into the input (no validation on input)
- On save: if new path equals current path, ignore; otherwise show confirmation dialog

**Confirmation dialog:**

- Display "source path → target path"
- Auto-detect and display operation type:
  - Source exists + target doesn't + game is folder → "Will move folder to new location"
  - Source doesn't exist → "Source path not accessible, will only update path record"
  - Game is archive → "Archives are not auto-moved, will only update path record"
  - Target already exists → Error, operation not allowed
- On confirm: show loading overlay ("Moving files..."), call backend API
- On success: `$q.notify` success, refresh page data
- On failure: `$q.notify` error, revert path to pre-edit value

### 2. Backend API — `PUT /games/:id/relocate`

**Request body:**
```json
{ "newPath": "D:\\GAL\\SomeGame" }
```

**Processing flow:**

1. **Get current game info**: Read `id`, `library_id`, `sub_path` from DB, compute current full path
2. **Normalize paths**: Unify backslashes, strip trailing slashes
3. **Determine game type** (folder vs archive): Check if current full path extension is in `ARCHIVE_EXTENSIONS`
4. **Auto-match target library**: Iterate all libraries, check if `newPath` starts with `library.path`
   - Matched: `library_id = matched library id`, `sub_path = relative path after stripping library prefix`
   - Not matched: `library_id = null`, `sub_path = newPath` (absolute path)
5. **Determine operation type**:
   - Archive → don't move files, only update DB
   - Source path doesn't exist → don't move files, only update DB (NAS may be offline, user may have moved manually)
   - Source path exists + is folder + target doesn't exist → execute move
   - Target already exists → return 409 error
6. **Execute move** (folder only):
   - Same drive: `fs.renameSync` (instant)
   - Cross-drive: `fs.cpSync(src, dst, { recursive: true })` + `fs.rmSync(src, { recursive: true, force: true })`
   - Move failure: throw error, don't update DB
7. **Update database**: Update `game.library_id` and `game.sub_path`, `updated_at` auto-updated via knex
8. **Return updated game detail**

**Error handling:**

- Cross-drive copy failure → clean up partial target directory → return error
- DB update failure after file move → don't rollback file (edge case, user can manually fix)

### 3. Electron IPC — Open Path for Relocate

**New IPC handler:** `dialog:openPathForRelocate`

- Uses `dialog.showOpenDialog` with `properties: ['openDirectory', 'openFile']`
- File filter: `filters: [{ name: 'Archives', extensions: ['zip', '7z', 'rar', '001'] }]`
- Returns selected path string, or null if cancelled

**Preload exposure:** `window.electronAPI.openPathForRelocate()`

**TypeScript type:** Add declaration in `electron.d.ts`

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/GameDetailPage.vue` | Add path editing UI, confirmation dialog, loading state, API call |
| `server/routes/game.js` | Add `PUT /:id/relocate` route |
| `src-electron/electron-main.ts` | Add `dialog:openPathForRelocate` IPC handler |
| `src-electron/electron-preload.ts` | Expose `openPathForRelocate` |
| `src/types/electron.d.ts` | Add type declaration for `openPathForRelocate` |