# Library Management & Open Directory 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 支持 Library 改名/编辑、Electron 原生目录选择、游戏详情页打开目录

**架构：** 通过 Electron IPC 暴露 `dialog:openDirectory` 和 `shell:openPath` 两个通道给渲染进程，前端通过 `window.electronAPI` 调用。SettingPage 添加编辑弹窗和 Browse 按钮，GameDetailPage 添加打开目录按钮。

**技术栈：** Electron IPC (ipcMain/ipcRenderer)、contextBridge、Quasar Dialog

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src-electron/electron-main.ts` | 注册 ipcMain handlers |
| `src-electron/electron-preload.ts` | 通过 contextBridge 暴露 electronAPI |
| `src/types/electron.d.ts` | TypeScript 类型声明 |
| `src/pages/SettingPage.vue` | Library 编辑弹窗 + Browse 按钮 |
| `src/pages/GameDetailPage.vue` | 打开目录按钮 |

---

### 任务 1：Electron IPC 通道 — electron-main.ts

**文件：**
- 修改：`src-electron/electron-main.ts`

- [ ] **步骤 1：添加 ipcMain handlers**

在文件顶部 import 中加入 `ipcMain`, `dialog`, `shell`：

```typescript
import { BrowserWindow, app, ipcMain, dialog, shell } from "electron";
```

在 `void app.whenReady().then(...)` 内、`createWindow()` 调用之前，注册两个 handler：

```typescript
ipcMain.handle('dialog:openDirectory', async (_event, title: string) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: title || 'Select Directory'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('shell:openPath', async (_event, path: string) => {
  await shell.openPath(path)
})
```

- [ ] **步骤 2：验证编译**

运行：`cd d:\work\game-lib && npx vue-tsc --noEmit 2>&1`
预期：无错误（electron-main.ts 不在 vue-tsc 范围内，但确认不影响前端编译）

- [ ] **步骤 3：Commit**

```bash
cd d:\work\game-lib
git add src-electron/electron-main.ts
git commit -m "feat: add IPC handlers for directory dialog and open path"
```

---

### 任务 2：Electron IPC 通道 — preload + 类型声明

**文件：**
- 修改：`src-electron/electron-preload.ts`
- 创建：`src/types/electron.d.ts`

- [ ] **步骤 1：更新 preload 暴露 electronAPI**

修改 `src-electron/electron-preload.ts`，将现有内容替换为：

```typescript
import { contextBridge, ipcRenderer } from "electron";
import { quasarRuntime } from "#q-app/electron/preload";

contextBridge.exposeInMainWorld("quasarRuntime", quasarRuntime);

contextBridge.exposeInMainWorld("electronAPI", {
  openDirectory: (title: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openDirectory', title),
  openPath: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:openPath', path),
});
```

- [ ] **步骤 2：创建 TypeScript 类型声明**

创建 `src/types/electron.d.ts`：

```typescript
interface ElectronAPI {
  openDirectory(title: string): Promise<string | null>
  openPath(path: string): Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
```

- [ ] **步骤 3：验证类型检查**

运行：`cd d:\work\game-lib && npx vue-tsc --noEmit 2>&1`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
cd d:\work\game-lib
git add src-electron/electron-preload.ts src/types/electron.d.ts
git commit -m "feat: expose electronAPI via preload for directory dialog and open path"
```

---

### 任务 3：SettingPage — Library 编辑弹窗 + Browse 按钮

**文件：**
- 修改：`src/pages/SettingPage.vue`

- [ ] **步骤 1：添加编辑弹窗状态和逻辑**

在 `<script setup>` 中添加：

```typescript
const showEditDialog = ref(false)
const editLibId = ref(0)
const editLibName = ref('')
const editLibPath = ref('')

const openEditDialog = (lib: Library) => {
  editLibId.value = lib.id
  editLibName.value = lib.name
  editLibPath.value = lib.path
  showEditDialog.value = true
}

const saveEditLibrary = async () => {
  if (!editLibName.value || !editLibPath.value) return
  await api.put(`/libraries/${editLibId.value}`, { name: editLibName.value, path: editLibPath.value })
  showEditDialog.value = false
  await fetchLibraries()
}

const browseDirectory = async (target: 'add' | 'edit') => {
  if (!window.electronAPI) return
  const path = await window.electronAPI.openDirectory('Select Library Path')
  if (path) {
    if (target === 'add') newLibPath.value = path
    else editLibPath.value = path
  }
}
```

- [ ] **步骤 2：修改 Library 列表项，添加编辑按钮**

将 `<q-item-section side>` 中仅有的删除按钮改为包含编辑和删除两个按钮：

```html
<q-item-section side>
  <div class="row q-gutter-xs">
    <q-btn flat round color="primary" icon="edit" @click="openEditDialog(lib)">
      <q-tooltip>Edit</q-tooltip>
    </q-btn>
    <q-btn flat round color="negative" icon="delete" @click="deleteLibrary(lib.id)" />
  </div>
</q-item-section>
```

- [ ] **步骤 3：修改新增弹窗，添加 Browse 按钮**

将新增弹窗中的路径输入框改为带 Browse 按钮的行：

```html
<q-input v-model="newLibPath" label="Library Path" outlined class="q-mb-md">
  <template v-slot:append>
    <q-icon v-if="window.electronAPI" name="folder_open" class="cursor-pointer" @click="browseDirectory('add')" />
  </template>
</q-input>
```

注意：模板中引用 `window.electronAPI` 需要一个 computed 或直接在模板中用 `!!window.electronAPI`。添加一个 computed：

```typescript
const hasElectronAPI = computed(() => !!window.electronAPI)
```

模板中用 `v-if="hasElectronAPI"` 替代 `v-if="window.electronAPI"`。

- [ ] **步骤 4：添加编辑弹窗模板**

在 `</q-dialog>` (新增弹窗结束) 之后添加：

```html
<q-dialog v-model="showEditDialog">
  <q-card style="min-width: 400px">
    <q-card-section>
      <div class="text-h6">Edit Library</div>
    </q-card-section>
    <q-card-section>
      <q-input v-model="editLibName" label="Library Name" outlined class="q-mb-md" />
      <q-input v-model="editLibPath" label="Library Path" outlined>
        <template v-slot:append>
          <q-icon v-if="hasElectronAPI" name="folder_open" class="cursor-pointer" @click="browseDirectory('edit')" />
        </template>
      </q-input>
    </q-card-section>
    <q-card-actions align="right">
      <q-btn flat label="Cancel" v-close-popup />
      <q-btn color="primary" label="Save" @click="saveEditLibrary" />
    </q-card-actions>
  </q-card>
</q-dialog>
```

- [ ] **步骤 5：验证类型检查**

运行：`cd d:\work\game-lib && npx vue-tsc --noEmit 2>&1`
预期：无错误

- [ ] **步骤 6：Commit**

```bash
cd d:\work\game-lib
git add src/pages/SettingPage.vue
git commit -m "feat: add library edit dialog and directory browse button"
```

---

### 任务 4：GameDetailPage — 打开目录按钮

**文件：**
- 修改：`src/pages/GameDetailPage.vue`

- [ ] **步骤 1：添加 openDir 函数**

在 `<script setup>` 中添加：

```typescript
const hasElectronAPI = computed(() => !!window.electronAPI)

const openDir = async () => {
  if (!game.value?.library?.path || !window.electronAPI) return
  const fullPath = game.value.library.path + '\\' + game.value.sub_path
  await window.electronAPI.openPath(fullPath)
}
```

在 import 中添加 `computed`：

```typescript
import { ref, computed, onMounted } from 'vue'
```

- [ ] **步骤 2：修改 Path 显示区域，添加打开按钮**

将：

```html
<div class="text-caption text-grey">
  Path: {{ game.library?.path }}\{{ game.sub_path }}
</div>
```

改为：

```html
<div class="text-caption text-grey">
  Path: {{ game.library?.path }}\{{ game.sub_path }}
  <q-btn v-if="hasElectronAPI" flat round dense size="sm" icon="folder_open" color="grey-7" @click="openDir">
    <q-tooltip>Open Directory</q-tooltip>
  </q-btn>
</div>
```

- [ ] **步骤 3：验证类型检查**

运行：`cd d:\work\game-lib && npx vue-tsc --noEmit 2>&1`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
cd d:\work\game-lib
git add src/pages/GameDetailPage.vue
git commit -m "feat: add open directory button on game detail page"
```