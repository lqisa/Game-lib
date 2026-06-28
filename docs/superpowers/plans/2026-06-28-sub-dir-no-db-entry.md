# 子目录扫描不入库 + adopt 缓存统一 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 子目录展开扫描结果不入游戏库（gameId=0），但搜索缓存和 adopt 缓存与顶层目录行为一致；提交时先入库再 adopt。

**架构：** 后端 `adopt_cache` 表主键从 `game_id` 改为 `(library_id, sub_path)`，API 支持 `gameIds` + `libraryId/subPaths` 混合查询/删除。前端去掉 `isTempId/nextTempId` 机制，子目录行 `gameId=0`，所有缓存操作统一传 `libraryId + subPath`。

**技术栈：** Vue 3 + Quasar（前端）、Express + Knex + SQLite（后端）

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `server/database/schema.js` | 建表 DDL | 修改：adopt_cache 主键改为 (library_id, sub_path)，加 library_id + sub_path 列 |
| `server/database/init.js` | 迁移逻辑 | 修改：加迁移 v5 重建 adopt_cache 表 |
| `server/database/db.js` | 数据访问层 | 修改：adopt_cache 函数支持 sub_path 查询/删除/迁移 |
| `server/routes/cache.js` | 缓存 API 路由 | 修改：adopt 端点支持混合查询/删除，新增 /adopt/migrate 端点 |
| `src/components/ScannerDialog.vue` | 扫描对话框 | 修改：去掉临时 ID，统一用 libraryId+subPath 做缓存 |

---

### 任务 1：后端 — 修改 adopt_cache 表结构

**文件：**
- 修改：`server/database/schema.js:80-93`
- 修改：`server/database/init.js`（在 v4 迁移之前添加 v5）

- [ ] **步骤 1：修改 schema.js 中 adopt_cache 表定义**

将 `server/database/schema.js` 中 adopt_cache 的 createTable 回调替换为：

```js
    .createTable('adopt_cache', (table) => {
      table.integer('game_id').notNullable().defaultTo(0);
      table.integer('library_id').notNullable().defaultTo(0);
      table.string('sub_path').notNullable().defaultTo('');
      table.string('source_type').notNullable();
      table.string('source_id').notNullable();
      table.text('source_url');
      table.text('name');
      table.text('cover_url');
      table.text('makers').notNullable().defaultTo('[]');
      table.text('genres').notNullable().defaultTo('[]');
      table.text('tags').notNullable().defaultTo('[]');
      table.text('description');
      table.dateTime('created_at').defaultTo(knex.fn.now());
      table.dateTime('updated_at').defaultTo(knex.fn.now());
      table.primary(['library_id', 'sub_path']);
    });
```

- [ ] **步骤 2：在 init.js 中添加迁移 v5**

在 `server/database/init.js` 中，找到 `const v4 = await knex('setting').where({ key: 'migration_v4' }).first();` 这一行，在其**前面**插入：

```js
  const v5 = await knex('setting').where({ key: 'migration_v5' }).first();
  if (!v5) {
    console.log(' * Running migration v5: rebuild adopt_cache with library_id + sub_path...');
    await knex.raw('PRAGMA foreign_keys = OFF');
    await knex.raw(`
      CREATE TABLE adopt_cache_new (
        game_id INTEGER NOT NULL DEFAULT 0,
        library_id INTEGER NOT NULL DEFAULT 0,
        sub_path TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_url TEXT,
        name TEXT,
        cover_url TEXT,
        makers TEXT NOT NULL DEFAULT '[]',
        genres TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (library_id, sub_path)
      )
    `);
    await knex.raw('INSERT INTO adopt_cache_new (game_id, source_type, source_id, source_url, name, cover_url, makers, genres, tags, description, created_at, updated_at) SELECT game_id, source_type, source_id, source_url, name, cover_url, makers, genres, tags, description, created_at, updated_at FROM adopt_cache');
    await knex.raw('DROP TABLE adopt_cache');
    await knex.raw('ALTER TABLE adopt_cache_new RENAME TO adopt_cache');
    await knex.raw('PRAGMA foreign_keys = ON');
    await knex('setting').insert({ key: 'migration_v5', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v5 done.');
  }

```

同时，在 `init.js` 的 `TABLE_DDL` 对象中，将 adopt_cache 的 DDL 替换为与 schema.js 一致的新结构：

```js
  adopt_cache: (knex) =>
    knex.schema.createTable('adopt_cache', (table) => {
      table.integer('game_id').notNullable().defaultTo(0);
      table.integer('library_id').notNullable().defaultTo(0);
      table.string('sub_path').notNullable().defaultTo('');
      table.string('source_type').notNullable();
      table.string('source_id').notNullable();
      table.text('source_url');
      table.text('name');
      table.text('cover_url');
      table.text('makers').notNullable().defaultTo('[]');
      table.text('genres').notNullable().defaultTo('[]');
      table.text('tags').notNullable().defaultTo('[]');
      table.text('description');
      table.dateTime('created_at').defaultTo(knex.fn.now());
      table.dateTime('updated_at').defaultTo(knex.fn.now());
      table.primary(['library_id', 'sub_path']);
    }),
```

- [ ] **步骤 3：启动应用验证迁移成功**

运行应用，检查控制台输出 `Migration v5 done.`，确认 adopt_cache 表结构正确。

- [ ] **步骤 4：Commit**

```bash
git add server/database/schema.js server/database/init.js
git commit -m "feat: adopt_cache table uses (library_id, sub_path) as primary key"
```

---

### 任务 2：后端 — 修改 db.js adopt_cache 函数

**文件：**
- 修改：`server/database/db.js:331-368`（adopt_cache 相关函数）
- 修改：`server/database/db.js:404-439`（export 列表）

- [ ] **步骤 1：替换 getAdoptCache 函数并在其后新增 3 个函数**

将 `server/database/db.js` 中的 `getAdoptCache` 函数替换为：

```js
const getAdoptCache = async (gameIds) => {
  if (gameIds.length === 0) return [];
  const rows = await db('adopt_cache').whereIn('game_id', gameIds);
  return rows.map((r) => ({
    ...r,
    makers: JSON.parse(r.makers),
    genres: JSON.parse(r.genres),
    tags: JSON.parse(r.tags),
  }));
};

const getAdoptCacheBySubPaths = async (libraryId, subPaths) => {
  if (!libraryId || subPaths.length === 0) return [];
  const rows = await db('adopt_cache').where({ library_id: libraryId }).whereIn('sub_path', subPaths);
  return rows.map((r) => ({
    ...r,
    makers: JSON.parse(r.makers),
    genres: JSON.parse(r.genres),
    tags: JSON.parse(r.tags),
  }));
};

const getAdoptCacheMixed = async (gameIds, subPathEntries) => {
  const results = [];
  if (gameIds.length > 0) {
    results.push(...(await getAdoptCache(gameIds)));
  }
  const byLibrary = new Map();
  for (const { libraryId, subPath } of subPathEntries) {
    if (!byLibrary.has(libraryId)) byLibrary.set(libraryId, []);
    byLibrary.get(libraryId).push(subPath);
  }
  for (const [libraryId, subPaths] of byLibrary) {
    results.push(...(await getAdoptCacheBySubPaths(libraryId, subPaths)));
  }
  return results;
};
```

- [ ] **步骤 2：替换 setAdoptCache 函数**

将 `setAdoptCache` 函数替换为：

```js
const setAdoptCache = async ({ gameId, libraryId, subPath, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description }) => {
  const data = {
    game_id: gameId || 0,
    library_id: libraryId || 0,
    sub_path: subPath || '',
    source_type: sourceType,
    source_id: sourceId,
    source_url: sourceUrl || null,
    name: name || null,
    cover_url: coverUrl || null,
    makers: JSON.stringify(makers || []),
    genres: JSON.stringify(genres || []),
    tags: JSON.stringify(tags || []),
    description: description || null,
    updated_at: db.fn.now(),
  };
  await db('adopt_cache').insert(data).onConflict(['library_id', 'sub_path']).merge();
};
```

- [ ] **步骤 3：替换 deleteAdoptCache 函数并在其后新增 3 个函数**

将 `deleteAdoptCache` 函数替换为：

```js
const deleteAdoptCache = async (gameIds) => {
  if (gameIds.length === 0) return;
  await db('adopt_cache').whereIn('game_id', gameIds).del();
};

const deleteAdoptCacheBySubPaths = async (libraryId, subPaths) => {
  if (!libraryId || subPaths.length === 0) return;
  await db('adopt_cache').where({ library_id: libraryId }).whereIn('sub_path', subPaths).del();
};

const deleteAdoptCacheMixed = async (gameIds, subPathEntries) => {
  if (gameIds.length > 0) {
    await deleteAdoptCache(gameIds);
  }
  const byLibrary = new Map();
  for (const { libraryId, subPath } of subPathEntries) {
    if (!byLibrary.has(libraryId)) byLibrary.set(libraryId, []);
    byLibrary.get(libraryId).push(subPath);
  }
  for (const [libraryId, subPaths] of byLibrary) {
    await deleteAdoptCacheBySubPaths(libraryId, subPaths);
  }
};

const migrateAdoptCacheGameId = async (libraryId, subPathToGameId) => {
  for (const [subPath, gameId] of Object.entries(subPathToGameId)) {
    await db('adopt_cache').where({ library_id: libraryId, sub_path: subPath }).update({ game_id: gameId });
  }
};
```

- [ ] **步骤 4：更新 export 列表**

将 export 中的：

```js
  getAdoptCache,
  setAdoptCache,
  batchSetAdoptCache,
  deleteAdoptCache,
```

替换为：

```js
  getAdoptCache,
  getAdoptCacheBySubPaths,
  getAdoptCacheMixed,
  setAdoptCache,
  batchSetAdoptCache,
  deleteAdoptCache,
  deleteAdoptCacheBySubPaths,
  deleteAdoptCacheMixed,
  migrateAdoptCacheGameId,
```

- [ ] **步骤 5：Commit**

```bash
git add server/database/db.js
git commit -m "feat: adopt_cache db functions support sub_path queries"
```

---

### 任务 3：后端 — 修改 cache.js API 端点

**文件：**
- 修改：`server/routes/cache.js`（GET/POST/DELETE /adopt + 新增 POST /adopt/migrate）

- [ ] **步骤 1：替换 GET /adopt 端点**

将 `router.get('/adopt', ...)` 替换为：

```js
router.get('/adopt', async (req, res, next) => {
  try {
    const { gameIds, libraryId, subPaths } = req.query;
    const gameIdList = gameIds ? String(gameIds).split(',').map(Number).filter((n) => !isNaN(n) && n > 0) : [];
    const subPathList = subPaths ? String(subPaths).split(',') : [];
    const libId = libraryId ? Number(libraryId) : 0;

    if (gameIdList.length === 0 && subPathList.length === 0) {
      return res.send({ entries: [] });
    }

    const subPathEntries = libId > 0 ? subPathList.map((sp) => ({ libraryId: libId, subPath: sp })) : [];
    const entries = await db.getAdoptCacheMixed(gameIdList, subPathEntries);
    res.send({ entries });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 2：替换 POST /adopt 端点**

将 `router.post('/adopt', ...)` 替换为：

```js
router.post('/adopt', async (req, res, next) => {
  try {
    const { gameId, libraryId, subPath, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description } = req.body;
    if (!sourceType || !sourceId) {
      return res.status(400).send({ error: 'sourceType, sourceId are required' });
    }
    if (!gameId && !libraryId && !subPath) {
      return res.status(400).send({ error: 'gameId or libraryId + subPath is required' });
    }
    await db.setAdoptCache({ gameId, libraryId, subPath, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description });
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 3：新增 POST /adopt/migrate 端点**

在 `router.delete('/adopt', ...)` 之前添加：

```js
router.post('/adopt/migrate', async (req, res, next) => {
  try {
    const { libraryId, subPathToGameId } = req.body;
    if (!libraryId || !subPathToGameId || typeof subPathToGameId !== 'object') {
      return res.status(400).send({ error: 'libraryId and subPathToGameId are required' });
    }
    await db.migrateAdoptCacheGameId(libraryId, subPathToGameId);
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 4：替换 DELETE /adopt 端点**

将 `router.delete('/adopt', ...)` 替换为：

```js
router.delete('/adopt', async (req, res, next) => {
  try {
    const { gameIds, libraryId, subPaths } = req.query;
    const gameIdList = gameIds ? String(gameIds).split(',').map(Number).filter((n) => !isNaN(n) && n > 0) : [];
    const subPathList = subPaths ? String(subPaths).split(',') : [];
    const libId = libraryId ? Number(libraryId) : 0;

    if (gameIdList.length === 0 && subPathList.length === 0) {
      return res.send({ ok: true });
    }

    const subPathEntries = libId > 0 ? subPathList.map((sp) => ({ libraryId: libId, subPath: sp })) : [];
    await db.deleteAdoptCacheMixed(gameIdList, subPathEntries);
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 5：Commit**

```bash
git add server/routes/cache.js
git commit -m "feat: adopt cache API supports libraryId+subPath queries"
```

---

### 任务 4：前端 — 去掉临时 ID 机制，统一缓存操作

**文件：**
- 修改：`src/components/ScannerDialog.vue`

这是最大的任务，按修改位置分为多个步骤。

- [ ] **步骤 1：修改接口定义**

将 `AdoptCacheEntry` 接口（约第 402 行）替换为：

```typescript
interface AdoptCacheEntry {
  game_id: number;
  library_id: number;
  sub_path: string;
  source_type: string;
  source_id: string;
  source_url: string | null;
  name: string | null;
  cover_url: string | null;
  makers: string[];
  genres: string[];
  tags: string[];
  description: string | null;
}
```

将 `SubmitGame` 接口（约第 432 行）替换为：

```typescript
interface SubmitGame {
  gameId: number;
  subPath: string;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
  name: string;
  coverUrl: string;
  makers: string[];
  genres: string[];
  tags: string[];
  description: string;
}
```

- [ ] **步骤 2：去掉临时 ID 变量**

将（约第 472-475 行）：

```typescript
let tempIdSeq = 0;
const nextTempId = () => --tempIdSeq;
const isTempId = (id: number) => id <= 0;
```

删除这三行。

- [ ] **步骤 3：修改 preloadAdoptCache 函数**

将整个 `preloadAdoptCache` 函数替换为：

```typescript
const preloadAdoptCache = async () => {
  const allRows = flattenAllRows(scanResults.value);
  if (allRows.length === 0) return;
  const realIdRows = allRows.filter((r) => r.gameId > 0);
  const tempIdRows = allRows.filter((r) => r.gameId === 0);
  const gameIds = realIdRows.map((r) => r.gameId);
  const subPaths = tempIdRows.map((r) => r.subPath);
  try {
    const params: Record<string, string> = {};
    if (gameIds.length > 0) params.gameIds = gameIds.join(',');
    if (subPaths.length > 0 && selectedLibrary.value) {
      params.libraryId = String(selectedLibrary.value);
      params.subPaths = subPaths.join(',');
    }
    if (!params.gameIds && !params.subPaths) return;
    const res = await api.get('/cache/adopt', { params });
    const entries: AdoptCacheEntry[] = res.data.entries || [];
    const adoptByGameId = new Map(entries.filter((e) => e.game_id > 0).map((e): [number, AdoptCacheEntry] => [e.game_id, e]));
    const adoptBySubPath = new Map(entries.filter((e) => e.sub_path).map((e): [string, AdoptCacheEntry] => [e.sub_path, e]));
    for (const row of allRows) {
      const cached = row.gameId > 0 ? adoptByGameId.get(row.gameId) : adoptBySubPath.get(row.subPath);
      if (cached) {
        row.source = cached.source_type as SourceType;
        row.searchResult = {
          id: cached.source_id,
          name: cached.name || row.name,
          makerName: '',
          coverUrl: cached.cover_url || '',
        };
        row.adoptData = {
          source: cached.source_type as SourceType,
          sourceId: cached.source_id,
          name: cached.name || row.name,
          makerName: '',
          coverUrl: cached.cover_url || '',
          detail: {
            id: cached.source_id,
            title: cached.name || row.name,
            coverURL: cached.cover_url || '',
            makers: cached.makers || [],
            genres: cached.genres || [],
            tags: cached.tags || [],
            description: cached.description || '',
          },
        };
        row.status = 'adopted';
      }
    }
  } catch {
    // preload failure is non-critical
  }
};
```

- [ ] **步骤 4：修改 expandRow 函数**

在 `expandRow` 中，将 `gameId: nextTempId(),` 替换为 `gameId: 0,`。

在 `expandRow` 末尾，搜索缓存预加载之后，添加 adopt 缓存预加载。将：

```typescript
    const newRows = row.children;
    if (newRows.length > 0) {
      const keywords = newRows.map((r) => r.searchKeyword || r.name);
      try {
        const cacheRes = await api.post('/cache/search/preload', { keywords });
        const entries = cacheRes.data.entries || [];
        for (const entry of entries) {
          searchCache.set(entry.key, { source: entry.source, results: entry.results });
        }
      } catch {
        // preload failure is non-critical
      }
    }
```

替换为：

```typescript
    const newRows = row.children;
    if (newRows.length > 0) {
      const keywords = newRows.map((r) => r.searchKeyword || r.name);
      try {
        const cacheRes = await api.post('/cache/search/preload', { keywords });
        const entries = cacheRes.data.entries || [];
        for (const entry of entries) {
          searchCache.set(entry.key, { source: entry.source, results: entry.results });
        }
      } catch {
        // preload failure is non-critical
      }
      if (selectedLibrary.value) {
        try {
          const subPathList = newRows.map((r) => r.subPath);
          const adoptRes = await api.get('/cache/adopt', {
            params: { libraryId: selectedLibrary.value, subPaths: subPathList.join(',') },
          });
          const adoptEntries: AdoptCacheEntry[] = adoptRes.data.entries || [];
          const adoptBySubPath = new Map(adoptEntries.map((e): [string, AdoptCacheEntry] => [e.sub_path, e]));
          for (const child of newRows) {
            const cached = adoptBySubPath.get(child.subPath);
            if (cached) {
              child.source = cached.source_type as SourceType;
              child.searchResult = {
                id: cached.source_id,
                name: cached.name || child.name,
                makerName: '',
                coverUrl: cached.cover_url || '',
              };
              child.adoptData = {
                source: cached.source_type as SourceType,
                sourceId: cached.source_id,
                name: cached.name || child.name,
                makerName: '',
                coverUrl: cached.cover_url || '',
                detail: {
                  id: cached.source_id,
                  title: cached.name || child.name,
                  coverURL: cached.cover_url || '',
                  makers: cached.makers || [],
                  genres: cached.genres || [],
                  tags: cached.tags || [],
                  description: cached.description || '',
                },
              };
              child.status = 'adopted';
            }
          }
        } catch {
          // adopt cache preload failure is non-critical
        }
      }
    }
```

- [ ] **步骤 5：修改 onAdopted 函数**

将 `onAdopted` 中的：

```typescript
  scrapingRow.value.source = data.source;
  scrapingRow.value.status = 'adopted';
  if (!isTempId(scrapingRow.value.gameId)) {
    api.post('/cache/adopt', {
      gameId: scrapingRow.value.gameId,
      sourceType: data.source,
      sourceId: data.sourceId,
      sourceUrl: getSourceUrl(data.source, data.sourceId),
      name: data.detail.title,
      coverUrl: data.detail.coverURL,
      makers: data.detail.makers,
      genres: data.detail.genres,
      tags: data.detail.tags,
      description: data.detail.description,
    }).catch(() => {});
  }
};
```

替换为：

```typescript
  scrapingRow.value.source = data.source;
  scrapingRow.value.status = 'adopted';
  saveAdoptCache(scrapingRow.value);
};
```

- [ ] **步骤 6：修改 saveAdoptCache 函数**

将 `saveAdoptCache` 函数替换为：

```typescript
const saveAdoptCache = (row: ScanRow) => {
  if (!row.adoptData) return;
  const d = row.adoptData;
  api.post('/cache/adopt', {
    gameId: row.gameId || undefined,
    libraryId: selectedLibrary.value || undefined,
    subPath: row.subPath,
    sourceType: d.source,
    sourceId: d.sourceId,
    sourceUrl: getSourceUrl(d.source, d.sourceId),
    name: d.detail.title,
    coverUrl: d.detail.coverURL,
    makers: d.detail.makers,
    genres: d.detail.genres,
    tags: d.detail.tags,
    description: d.detail.description,
  }).catch(() => {});
};
```

- [ ] **步骤 7：修改 discardRow 函数**

将 `discardRow` 函数中的：

```typescript
  row.adoptData = null;
  if (!isTempId(row.gameId)) {
    api.delete('/cache/adopt', { params: { gameIds: row.gameId } }).catch(() => {});
  }
```

替换为：

```typescript
  row.adoptData = null;
  const params: Record<string, string> = {};
  if (row.gameId > 0) {
    params.gameIds = String(row.gameId);
  } else if (selectedLibrary.value) {
    params.libraryId = String(selectedLibrary.value);
    params.subPaths = row.subPath;
  }
  if (params.gameIds || params.subPaths) {
    api.delete('/cache/adopt', { params }).catch(() => {});
  }
```

- [ ] **步骤 8：修改 forceRefresh 函数**

将 `forceRefresh` 中的：

```typescript
    const realGameIds = allRows.filter((r) => !isTempId(r.gameId)).map((r) => r.gameId);
    if (realGameIds.length > 0) {
      await api.delete('/cache/adopt', { params: { gameIds: realGameIds.join(',') } });
    }
```

替换为：

```typescript
    const realIdRows = allRows.filter((r) => r.gameId > 0);
    const tempIdRows = allRows.filter((r) => r.gameId === 0);
    const params: Record<string, string> = {};
    if (realIdRows.length > 0) params.gameIds = realIdRows.map((r) => r.gameId).join(',');
    if (tempIdRows.length > 0 && selectedLibrary.value) {
      params.libraryId = String(selectedLibrary.value);
      params.subPaths = tempIdRows.map((r) => r.subPath).join(',');
    }
    if (params.gameIds || params.subPaths) {
      await api.delete('/cache/adopt', { params });
    }
```

- [ ] **步骤 9：修改 doSubmit 函数**

将 `doSubmit` 中的：

```typescript
    const adoptedGameIds = games.map((g) => g.gameId);
    if (adoptedGameIds.length > 0) {
      try {
        await api.delete('/cache/adopt', { params: { gameIds: adoptedGameIds.join(',') } });
      } catch {
        // adopt cache delete failure is non-critical
      }
    }
```

替换为：

```typescript
    const adoptedGameIds = games.map((g) => g.gameId);
    const adoptedSubPaths = games.map((g) => g.subPath).filter(Boolean);
    const delParams: Record<string, string> = {};
    if (adoptedGameIds.length > 0) delParams.gameIds = adoptedGameIds.join(',');
    if (adoptedSubPaths.length > 0 && selectedLibrary.value) {
      delParams.libraryId = String(selectedLibrary.value);
      delParams.subPaths = adoptedSubPaths.join(',');
    }
    if (delParams.gameIds || delParams.subPaths) {
      try {
        await api.delete('/cache/adopt', { params: delParams });
      } catch {
        // adopt cache delete failure is non-critical
      }
    }
```

- [ ] **步骤 10：修改 submitAdopted 函数**

将 `submitAdopted` 中的：

```typescript
  const staleRows = flattenAllRows(scanResults.value).filter((r) => r.status === 'stale' && !isTempId(r.gameId));
```

替换为：

```typescript
  const staleRows = flattenAllRows(scanResults.value).filter((r) => r.status === 'stale' && r.gameId > 0);
```

将 `submitAdopted` 中的：

```typescript
    const tempRows = adoptedRows.filter((r) => isTempId(r.gameId));
    if (tempRows.length > 0 && selectedLibrary.value) {
      const addRes = await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: tempRows.map((r) => r.subPath),
      });
      const inserted: { id: number; sub_path: string }[] = addRes.data.games || [];
      const idMap = new Map(inserted.map((g) => [g.sub_path, g.id]));
      for (const row of tempRows) {
        const realId = idMap.get(row.subPath);
        if (realId !== undefined) {
          row.gameId = realId;
        }
      }
    }
```

替换为：

```typescript
    const tempRows = adoptedRows.filter((r) => r.gameId === 0);
    if (tempRows.length > 0 && selectedLibrary.value) {
      const addRes = await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: tempRows.map((r) => r.subPath),
      });
      const inserted: { id: number; sub_path: string }[] = addRes.data.games || [];
      const idMap = new Map(inserted.map((g) => [g.sub_path, g.id]));
      for (const row of tempRows) {
        const realId = idMap.get(row.subPath);
        if (realId !== undefined) {
          row.gameId = realId;
        }
      }
      const subPathToGameId: Record<string, number> = {};
      for (const row of tempRows) {
        if (row.gameId > 0) subPathToGameId[row.subPath] = row.gameId;
      }
      if (Object.keys(subPathToGameId).length > 0) {
        try {
          await api.post('/cache/adopt/migrate', { libraryId: selectedLibrary.value, subPathToGameId });
        } catch {
          // migration failure is non-critical
        }
      }
    }
```

将 `submitAdopted` 中构建 `SubmitGame` 的 `return {` 块里，在 `gameId: row.gameId,` 后面添加一行：

```typescript
          subPath: row.subPath,
```

- [ ] **步骤 11：验证无残留 isTempId/nextTempId 引用**

搜索 `ScannerDialog.vue` 中是否还有 `isTempId` 或 `nextTempId` 的引用。如果有，按上述规则替换：
- `isTempId(r.gameId)` → `r.gameId === 0`（判断子目录行）
- `!isTempId(r.gameId)` → `r.gameId > 0`（判断已入库行）
- `nextTempId()` → `0`

- [ ] **步骤 12：运行类型检查**

运行：`cd d:\work\game-lib && npx vue-tsc --noEmit`
预期：无错误

- [ ] **步骤 13：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: sub-dir scan uses gameId=0, unified adopt cache with libraryId+subPath"
```

---

### 任务 5：端到端验证

- [ ] **步骤 1：启动应用**

运行：`cd d:\work\game-lib && npx quasar dev -m electron`

- [ ] **步骤 2：测试子目录展开不入库**

1. 打开 Scan & Scrape 对话框
2. 选择一个库，点 Scan
3. 展开一个有子目录的目录
4. 检查数据库 game 表，确认子目录项没有入库（gameId=0 的行不在 DB 中）

- [ ] **步骤 3：测试 adopt 缓存对子目录生效**

1. 对子目录中的行点 Scrape
2. 选择结果后点 Adopt
3. 关闭对话框再打开
4. 确认子目录行的 adopted 状态恢复（adopt 缓存通过 subPath 查回）

- [ ] **步骤 4：测试提交时入库**

1. 对子目录中已 adopt 的行点 Submit
2. 检查数据库，确认子目录行已入库且有真实 gameId
3. 确认 adopt_cache 中对应记录已清理

- [ ] **步骤 5：测试 discard 和 forceRefresh**

1. 对子目录行 adopt 后 discard，确认 adopt 缓存被清除
2. forceRefresh 后确认所有缓存被清除