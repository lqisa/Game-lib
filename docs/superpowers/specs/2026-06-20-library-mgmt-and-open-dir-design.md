# Library Management & Open Directory Design

## Overview

Three enhancements to the game-lib Electron app:
1. Library rename/edit via dialog
2. Directory selection using Electron native dialog
3. Open game directory from detail page

## 1. Electron IPC Channels

### electron-main.ts

Register two IPC handlers:

| Channel | Params | Returns | Purpose |
|---------|--------|---------|---------|
| `dialog:openDirectory` | `{ title: string }` | `string \| null` | System folder picker |
| `shell:openPath` | `{ path: string }` | `void` | Open directory in file manager |

Implementation:
- `dialog:openDirectory`: calls `dialog.showOpenDialog({ properties: ['openDirectory'], title })`, returns selected path or null
- `shell:openPath`: calls `shell.openPath(path)`, no return value needed

### electron-preload.ts

Expose via `contextBridge.exposeInMainWorld('electronAPI', { ... })`:

```typescript
window.electronAPI = {
  openDirectory: (title: string) => Promise<string | null>,
  openPath: (path: string) => Promise<void>
}
```

### Type declaration

Add `src/types/electron.d.ts` for TypeScript support:

```typescript
interface ElectronAPI {
  openDirectory(title: string): Promise<string | null>
  openPath(path: string): Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
```

## 2. SettingPage Changes

### Library list item

Each row adds an edit icon button (alongside existing delete button). Clicking opens edit dialog.

### Edit dialog

- Name input (pre-filled with current name)
- Path input (pre-filled with current path) + "Browse" button
  - Browse button calls `window.electronAPI.openDirectory('Select Library Path')`
  - On selection, updates path input value
- Save button: calls `PUT /libraries/:id` with `{ name, path }`
- Cancel button

### Add dialog

Same as current but add "Browse" button next to path input, calling `window.electronAPI.openDirectory('Select Library Path')`.

## 3. GameDetailPage Changes

In the path display section, add a `folder_open` icon button next to the path text:

```html
<div class="text-caption text-grey">
  Path: {{ game.library?.path }}\{{ game.sub_path }}
  <q-btn flat round dense size="sm" icon="folder_open" @click="openDir" />
</div>
```

`openDir` calls `window.electronAPI.openPath(fullPath)` where `fullPath = path.join(library.path, sub_path)`.

Path separator: use `path.join` equivalent on frontend or simply `library.path + '\\' + sub_path` (Windows-only is acceptable per current project scope).

## Files Changed

| File | Change |
|------|--------|
| `src-electron/electron-main.ts` | Add ipcMain handlers for dialog:openDirectory, shell:openPath |
| `src-electron/electron-preload.ts` | Expose electronAPI via contextBridge |
| `src/types/electron.d.ts` | New: TypeScript declarations for window.electronAPI |
| `src/pages/SettingPage.vue` | Add edit dialog, Browse buttons |
| `src/pages/GameDetailPage.vue` | Add folder_open button next to path |