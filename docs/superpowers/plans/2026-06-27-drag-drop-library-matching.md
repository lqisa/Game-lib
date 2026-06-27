# Drag-Drop Library Matching 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 拖拽文件夹添加游戏时自动匹配 library 归属，禁止嵌套 library，新增/修改 library 时自动迁移 dropped 游戏。

**架构：** 前端拖拽时获取 libraries 列表做路径匹配；后端 library 接口增加嵌套校验和 dropped 游戏迁移；前端 SettingPage 增加嵌套校验前置检查。

**技术栈：** Vue 3 + Quasar（前端），Express + Knex/SQLite（后端）

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `server/routes/library.js` | 嵌套校验 + dropped 迁移 + PUT 迁移 |
| `src/pages/GameLibPage.vue` | `onDropAdopt` 添加 library 匹配逻辑 |
| `src/pages/SettingPage.vue` | 添加/编辑 library 时前端嵌套校验 |

---

### 任务 1：后端 — 嵌套 library 校验

**文件：**
- 修改：`server/routes/library.js`

- [ ] **步骤 1：添加路径归一化和嵌套校验函数**

在 `server/routes/library.js` 顶部（router 定义之前）添加：

```js
const normalizePath = (p) => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');

const checkNestedLibrary = async (newPath, excludeId) => {
  const libraries = await db.getLibraries();
  const newNorm = normalizePath(newPath);

  for (const lib of libraries) {
    if (excludeId && lib.id === excludeId) continue;
    const libNorm = normalizePath(lib.path);
    if (newNorm.startsWith(libNorm + '\\')) {
      return { conflict: 'child', parentLib: lib };
    }
    if (libNorm.startsWith(newNorm + '\\')) {
      return { conflict: 'parent', childLib: lib };
    }
  }
  return null;
};
```

- [ ] **步骤 2：在 `POST /` 中添加嵌套校验**

在 `router.post('/', ...)` 的 `try` 块中，`db.insertLibrary` 之前添加：

```js
const nested = await checkNestedLibrary(path || '');
if (nested) {
  return res.status(400).send({
    error: nested.conflict === 'child'
      ? `Path is a subdirectory of library "${nested.parentLib.name}"`
      : `Path contains existing library "${nested.childLib.name}"`,
  });
}
```

- [ ] **步骤 3：在 `PUT /:id` 中添加嵌套校验**

在 `router.put('/:id', ...)` 的 `try` 块中，`db.updateLibrary` 之前添加：

```js
const nested = await checkNestedLibrary(path, Number(id));
if (nested) {
  return res.status(400).send({
    error: nested.conflict === 'child'
      ? `Path is a subdirectory of library "${nested.parentLib.name}"`
      : `Path contains existing library "${nested.childLib.name}"`,
  });
}
```

- [ ] **步骤 4：手动验证**

启动后端，使用 curl 测试：
1. 创建 library A：`POST /libraries { name: "LibA", path: "D:\\Games" }` — 应成功
2. 创建嵌套 library B：`POST /libraries { name: "LibB", path: "D:\\Games\\Sub" }` — 应返回 400 "Path is a subdirectory of library"
3. 创建父级 library C：`POST /libraries { name: "LibC", path: "D:\\" }` — 应返回 400 "Path contains existing library"

- [ ] **步骤 5：Commit**

```bash
git add server/routes/library.js
git commit -m "feat: add nested library path validation on create/update"
```

---

### 任务 2：后端 — 新增 library 时自动迁移 dropped 游戏

**文件：**
- 修改：`server/routes/library.js`

- [ ] **步骤 1：添加 migrateDroppedGames 函数**

在 `checkNestedLibrary` 函数之后添加：

```js
const migrateDroppedGames = async (libraryId, libraryPath) => {
  const libPrefix = libraryPath.replace(/\//g, '\\').replace(/\\+$/, '');
  const libNorm = normalizePath(libraryPath);

  const droppedGames = await db.knex('game').whereNull('library_id').select('id', 'sub_path');

  const toUpdate = [];
  for (const game of droppedGames) {
    const gameNorm = normalizePath(game.sub_path);
    if (gameNorm.startsWith(libNorm + '\\')) {
      const subPath = game.sub_path.replace(/\//g, '\\').substring(libPrefix.length + 1);
      toUpdate.push({ id: game.id, subPath });
    }
  }

  if (toUpdate.length > 0) {
    await db.knex.transaction(async (trx) => {
      for (const item of toUpdate) {
        await trx('game').where({ id: item.id }).update({
          library_id: libraryId,
          sub_path: item.subPath,
        });
      }
    });
  }

  return toUpdate.length;
};
```

- [ ] **步骤 2：在 `POST /` 中调用迁移**

在 `router.post('/', ...)` 中，`db.insertLibrary` 之后、`res.status(201).send(library)` 之前添加：

```js
await migrateDroppedGames(id, path || '');
```

注意：`id` 来自 `const [id] = await db.insertLibrary(...)` 的返回值。

- [ ] **步骤 3：手动验证**

1. 先通过拖拽创建一个 dropped 游戏（绝对路径如 `D:\Games\SomeGame`，无 library_id）
2. 创建 library：`POST /libraries { name: "LibA", path: "D:\\Games" }`
3. 查询该游戏，应自动归属到新 library，`sub_path` 变为 `SomeGame`

- [ ] **步骤 4：Commit**

```bash
git add server/routes/library.js
git commit -m "feat: auto-migrate dropped games when adding a library"
```

---

### 任务 3：后端 — 修改 library 路径时的迁移

**文件：**
- 修改：`server/routes/library.js`

- [ ] **步骤 1：在 `PUT /:id` 中添加路径变更迁移逻辑**

在 `router.put('/:id', ...)` 中，`db.updateLibrary` 之后、`res.send(library)` 之前添加：

```js
const oldLib = await db.knex('library').where({ id: Number(id) }).first();
if (path && path !== oldLib.path) {
  const oldPrefix = oldLib.path.replace(/\//g, '\\').replace(/\\+$/, '');
  const newNorm = normalizePath(path);
  const newPrefix = path.replace(/\//g, '\\').replace(/\\+$/, '');

  const currentGames = await db.knex('game').where({ library_id: Number(id) }).select('id', 'sub_path');

  if (currentGames.length > 0) {
    await db.knex.transaction(async (trx) => {
      for (const game of currentGames) {
        const absPath = oldPrefix + '\\' + game.sub_path.replace(/\//g, '\\');
        const absNorm = normalizePath(absPath);

        if (absNorm.startsWith(newNorm + '\\')) {
          const newSubPath = absPath.substring(newPrefix.length + 1);
          await trx('game').where({ id: game.id }).update({ sub_path: newSubPath });
        } else {
          await trx('game').where({ id: game.id }).update({
            library_id: null,
            sub_path: absPath,
          });
        }
      }
    });
  }

  await migrateDroppedGames(Number(id), path);
}
```

注意：需要在 `db.updateLibrary` 之前先获取 `oldLib`，因为 update 之后就拿不到旧路径了。调整顺序：

将 `const oldLib = await db.knex('library').where({ id: Number(id) }).first();` 移到 `db.updateLibrary` 之前。

- [ ] **步骤 2：手动验证**

1. 有 library `D:\Games`，下有游戏 `SomeGame`（sub_path = `SomeGame`）
2. 修改 library 路径为 `D:\Other` — 游戏应变为 dropped（library_id = null, sub_path = `D:\Games\SomeGame`）
3. 修改 library 路径回 `D:\Games` — 游戏应重新归属（library_id = lib.id, sub_path = `SomeGame`）

- [ ] **步骤 3：Commit**

```bash
git add server/routes/library.js
git commit -m "feat: migrate games on library path change"
```

---

### 任务 4：前端 — SettingPage 嵌套 library 校验

**文件：**
- 修改：`src/pages/SettingPage.vue`

- [ ] **步骤 1：添加路径归一化和嵌套校验函数**

在 `<script setup>` 中添加：

```ts
const normalizePath = (p: string) => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');

const checkNestedLibrary = (newPath: string, excludeId?: number): { conflict: 'child' | 'parent'; lib: Library } | null => {
  const newNorm = normalizePath(newPath);
  for (const lib of libraries.value) {
    if (excludeId && lib.id === excludeId) continue;
    const libNorm = normalizePath(lib.path);
    if (newNorm.startsWith(libNorm + '\\')) {
      return { conflict: 'child', lib };
    }
    if (libNorm.startsWith(newNorm + '\\')) {
      return { conflict: 'parent', lib };
    }
  }
  return null;
};
```

- [ ] **步骤 2：在 addLibrary 中添加校验**

修改 `addLibrary` 函数：

```ts
const addLibrary = async () => {
  if (!newLibName.value || !newLibPath.value) return;
  const nested = checkNestedLibrary(newLibPath.value);
  if (nested) {
    $q.notify({
      type: 'negative',
      message: nested.conflict === 'child'
        ? `Path is a subdirectory of library "${nested.lib.name}"`
        : `Path contains existing library "${nested.lib.name}"`,
    });
    return;
  }
  await api.post('/libraries', { name: newLibName.value, path: newLibPath.value });
  newLibName.value = '';
  newLibPath.value = '';
  showAddDialog.value = false;
  await fetchLibraries();
};
```

需要在顶部添加 `const $q = useQuasar();` 和 `import { useQuasar } from 'quasar';`（如果尚未导入）。

- [ ] **步骤 3：在 saveEditLibrary 中添加校验**

修改 `saveEditLibrary` 函数：

```ts
const saveEditLibrary = async () => {
  if (!editLibName.value || !editLibPath.value) return;
  const nested = checkNestedLibrary(editLibPath.value, editLibId.value);
  if (nested) {
    $q.notify({
      type: 'negative',
      message: nested.conflict === 'child'
        ? `Path is a subdirectory of library "${nested.lib.name}"`
        : `Path contains existing library "${nested.lib.name}"`,
    });
    return;
  }
  await api.put(`/libraries/${editLibId.value}`, {
    name: editLibName.value,
    path: editLibPath.value,
  });
  showEditDialog.value = false;
  await fetchLibraries();
};
```

- [ ] **步骤 4：手动验证**

1. 已有 library `D:\Games`
2. 尝试添加 `D:\Games\Sub` — 应弹出红色提示，不发请求
3. 尝试添加 `D:\` — 应弹出红色提示
4. 尝试添加 `D:\Other` — 应成功

- [ ] **步骤 5：Commit**

```bash
git add src/pages/SettingPage.vue
git commit -m "feat: add frontend nested library validation in settings"
```

---

### 任务 5：前端 — 拖拽时 library 匹配

**文件：**
- 修改：`src/pages/GameLibPage.vue`

- [ ] **步骤 1：添加路径归一化函数**

在 `<script setup>` 中添加：

```ts
const normalizePath = (p: string) => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');
```

- [ ] **步骤 2：重写 onDropAdopt 函数**

将现有的 `onDropAdopt` 替换为：

```ts
const onDropAdopt = async (data: DropAdoptData) => {
  try {
    const libsRes = await api.get('/libraries');
    const libs = libsRes.data || [];

    const dropNorm = normalizePath(dropFolderPath.value);
    const matchedLib = libs.find((lib: { id: number; name: string; path: string }) => {
      const libNorm = normalizePath(lib.path);
      return dropNorm.startsWith(libNorm + '\\');
    });

    let libraryId: number | undefined;
    let subPath: string;
    if (matchedLib) {
      libraryId = matchedLib.id;
      const libPrefix = matchedLib.path.replace(/\//g, '\\').replace(/\\+$/, '');
      subPath = dropFolderPath.value.replace(/\//g, '\\').substring(libPrefix.length + 1);
    } else {
      libraryId = undefined;
      subPath = dropFolderPath.value;
    }

    const gameRes = await api.post('/games', {
      name: dropFolderName.value,
      sub_path: subPath,
      ...(libraryId && { library_id: libraryId }),
    });
    const gameId = gameRes.data.id;
    await api.post('/scraper/adopt', {
      gameId,
      sourceType: data.source,
      sourceId: data.sourceId,
      sourceUrl: getSourceUrl(data.source, data.sourceId),
      name: data.detail.title,
      coverUrl: data.detail.coverURL,
      makers: data.detail.makers,
      genres: data.detail.genres,
      tags: data.detail.tags,
      description: data.detail.description,
    });
    await loadGames();
  } catch {
    // handled by error interceptor
  }
};
```

- [ ] **步骤 3：手动验证**

1. 有 library `D:\Games`
2. 拖拽 `D:\Games\SomeGame` — 创建的游戏应有 library_id，sub_path = `SomeGame`
3. 拖拽 `D:\Other\SomeGame` — 创建的游戏应无 library_id，sub_path = `D:\Other\SomeGame`
4. 无任何 library 时拖拽 — 应正常创建 dropped 游戏（不再阻断）

- [ ] **步骤 4：Commit**

```bash
git add src/pages/GameLibPage.vue
git commit -m "feat: match dropped game to library on drag-drop adopt"
```

---

### 任务 6：端到端验证

- [ ] **步骤 1：完整流程验证**

1. 创建 library `D:\Games`
2. 拖拽 `D:\Games\SubDir\SomeGame` → 验证游戏 library_id 指向该 library，sub_path = `SubDir\SomeGame`
3. 拖拽 `E:\OtherGame` → 验证游戏 library_id 为 null，sub_path = `E:\OtherGame`
4. 尝试添加嵌套 library `D:\Games\Nested` → 前端提示 + 后端拒绝
5. 删除 library → dropped 游戏不受影响（CASCADE 删除属于该 library 的游戏是已有行为）
6. 重新添加 library `D:\Games` → 之前 dropped 的游戏自动迁移回来

- [ ] **步骤 2：最终 Commit**

```bash
git add -A
git commit -m "feat: drag-drop library matching with nested validation and auto-migration"
```