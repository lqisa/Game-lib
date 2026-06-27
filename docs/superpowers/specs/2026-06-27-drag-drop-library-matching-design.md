# Drag-Drop Library Matching & Nested Library Prohibition

## 背景

当前拖拽文件夹添加游戏时，始终创建无 `library_id`、`sub_path` 为绝对路径的游戏（dropped 类别）。需要调整：

1. 拖拽后判断游戏所在父目录是否属于某个 library
2. 属于：数据结构与 SCRAPE ALL 的 adopt 一致（有 `library_id`，`sub_path` 为相对路径）
3. 不属于：保持 dropped 处理（`library_id = null`，`sub_path` 为绝对路径）
4. 禁止嵌套 library（一个 library 路径不能是另一个的子目录）
5. 新增/修改 library 时自动迁移 dropped 游戏

## 设计

### 1. 拖拽时 library 匹配

**文件：** `src/pages/GameLibPage.vue` — `onDropAdopt`

- 获取所有 libraries，检查 `dropFolderPath` 是否以某个 `library.path` 开头
- 路径归一化：统一斜杠为 `\`、小写、去尾斜杠
- 匹配条件：`normalize(dropPath).startsWith(normalize(lib.path) + '\\')`
- 匹配到：`library_id = lib.id`，`sub_path = dropPath 截取 lib.path 之后的部分`
- 未匹配：`library_id = null`，`sub_path = 绝对路径`
- 移除 `libs.length === 0` 的阻断逻辑（dropped 游戏也允许添加）

### 2. 嵌套 library 禁止

**后端：** `server/routes/library.js`

- `POST /` 和 `PUT /:id` 中添加 `checkNestedLibrary(newPath, excludeId)` 校验
- 新路径不能是已有 library 的子目录，已有 library 也不能是新路径的子目录
- 冲突时返回 400 + 描述性错误信息

**前端：** `src/pages/SettingPage.vue`

- 添加/编辑 library 时，先获取已有 libraries 本地校验
- 不通过则 `$q.notify` 提示，不发请求

### 3. 新增 library 时自动迁移 dropped 游戏

**后端：** `server/routes/library.js` — `POST /`

创建成功后执行 `migrateDroppedGames(libraryId, libraryPath)`：

- 查询所有 `library_id IS NULL` 的游戏
- 检查每个 `sub_path`（绝对路径）是否以新 library 路径开头
- 匹配的：更新 `library_id`，将 `sub_path` 转为相对路径
- 在事务中批量执行

### 4. 修改 library 路径时的迁移

**后端：** `server/routes/library.js` — `PUT /:id`

分两步：

**步骤 1：** 当前属于该 library 的游戏重新评估
- 用旧路径重建绝对路径：`absPath = oldLib.path + '\' + game.sub_path`
- 仍在新路径下 → 更新 `sub_path` 为新的相对路径
- 不在新路径下 → 转为 dropped：`library_id = null`，`sub_path = absPath`

**步骤 2：** 吸纳 dropped 游戏
- 与 `POST /` 相同的 `migrateDroppedGames` 逻辑

**不处理的场景：** 用户物理移动目录后修改 library 路径 — 匹配到的自动迁移，匹配不到的保留原数据。

## 路径归一化规则

```js
const normalize = (p) => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');
```

- 统一正斜杠为反斜杠
- 转小写（Windows 大小写不敏感）
- 去除末尾斜杠

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `src/pages/GameLibPage.vue` | `onDropAdopt` 添加 library 匹配逻辑，移除无 library 阻断 |
| `src/pages/SettingPage.vue` | 添加/编辑 library 时前端嵌套校验 |
| `server/routes/library.js` | 嵌套校验 + dropped 迁移 + PUT 迁移 |