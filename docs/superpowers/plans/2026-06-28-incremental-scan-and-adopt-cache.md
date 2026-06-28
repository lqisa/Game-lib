# Incremental Scan Merge & Adopt Cache 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** Scan 后增量合并 scanResults（保留已有状态），adopt 决定持久化到 DB，缓存跨 Library 共享。

**架构：** 新增 adopt_cache 表存储用户采纳决定；修改 scanDir() 为增量合并而非全量替换；修改 scan/add 端点返回新游戏 ID；前端在 adopt/discard/submit 时同步读写 adopt_cache。

**技术栈：** SQLite (knex)、Express、Vue 3 (Composition API)

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `server/database/schema.js` | 建表 DDL | 修改：加 adopt_cache 表 |
| `server/database/init.js` | 迁移逻辑 | 修改：加 adopt_cache 到 ALL_TABLES + TABLE_DDL |
| `server/database/db.js` | 数据访问层 | 修改：加 adopt_cache CRUD 函数 |
| `server/routes/cache.js` | 缓存 API 路由 | 修改：加 adopt_cache 4 个端点 |
| `server/routes/game.js` | 游戏 API 路由 | 修改：scan/add 返回新游戏列表 |
| `src/components/ScannerDialog.vue` | 扫描对话框 | 修改：增量合并 + adopt 缓存 + 缓存共享 |

---

### 任务 1：数据库 — adopt_cache 表 + 迁移

**文件：**
- 修改：`server/database/schema.js`
- 修改：`server/database/init.js`
- 修改：`server/database/db.js`

- [ ] **步骤 1：在 schema.js 中添加 adopt_cache 表定义**

在 `search_cache` 表定义之后追加：

```js
    .createTable('adopt_cache', (table) => {
      table.integer('game_id').primary();
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
    })
```

- [ ] **步骤 2：在 init.js 的 ALL_TABLES 数组中添加 'adopt_cache'**

在 `'search_cache'` 之后追加 `'adopt_cache'`：

```js
const ALL_TABLES = [
  'library',
  'maker',
  'genre',
  'tag',
  'game',
  'game_maker',
  'game_genre',
  'game_tag',
  'game_source',
  'setting',
  'search_cache',
  'adopt_cache',
];
```

- [ ] **步骤 3：在 init.js 的 TABLE_DDL 中添加 adopt_cache 定义**

在 `search_cache` 条目之后追加：

```js
  adopt_cache: (knex) =>
    knex.schema.createTable('adopt_cache', (table) => {
      table.integer('game_id').primary();
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
    }),
```

- [ ] **步骤 4：在 db.js 中添加 adopt_cache CRUD 函数**

在 `getSearchCacheByKeywords` 函数之后、`getDuplicateSources` 函数之前添加：

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

const setAdoptCache = async ({ gameId, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description }) => {
  const data = {
    game_id: gameId,
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
  await db('adopt_cache').insert(data).onConflict('game_id').merge();
};

const batchSetAdoptCache = async (items) => {
  for (const item of items) {
    await setAdoptCache(item);
  }
};

const deleteAdoptCache = async (gameIds) => {
  if (gameIds.length === 0) return;
  await db('adopt_cache').whereIn('game_id', gameIds).del();
};
```

- [ ] **步骤 5：在 db.js 的 export 中添加新函数**

在 `getSearchCacheByKeywords` 之后追加：

```js
  getAdoptCache,
  setAdoptCache,
  batchSetAdoptCache,
  deleteAdoptCache,
```

- [ ] **步骤 6：启动应用验证表创建**

运行：`cd d:\work\game-lib && npx quasar dev -m electron`

预期：控制台输出 `Creating missing table: adopt_cache`（首次）或 `All tables exist.`（后续），无报错。

- [ ] **步骤 7：Commit**

```bash
git add server/database/schema.js server/database/init.js server/database/db.js
git commit -m "feat: add adopt_cache table and CRUD functions"
```

---

### 任务 2：后端 — adopt_cache API 端点

**文件：**
- 修改：`server/routes/cache.js`

- [ ] **步骤 1：添加 import**

在 cache.js 顶部的 import 区域，确认 `* as db` 已从 `'../database/db.js'` 导入（已有）。

- [ ] **步骤 2：添加 GET /adopt 端点**

在 `router.post('/search/preload', ...)` 之后、`export default router` 之前添加：

```js
router.get('/adopt', async (req, res, next) => {
  try {
    const { gameIds } = req.query;
    if (!gameIds) {
      return res.status(400).send({ error: 'gameIds is required' });
    }
    const ids = String(gameIds).split(',').map(Number).filter((n) => !isNaN(n));
    const entries = await db.getAdoptCache(ids);
    res.send({ entries });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 3：添加 POST /adopt 端点**

```js
router.post('/adopt', async (req, res, next) => {
  try {
    const { gameId, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description } = req.body;
    if (!gameId || !sourceType || !sourceId) {
      return res.status(400).send({ error: 'gameId, sourceType, sourceId are required' });
    }
    await db.setAdoptCache({ gameId, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description });
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 4：添加 POST /adopt/batch 端点**

```js
router.post('/adopt/batch', async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).send({ error: 'items array is required' });
    }
    await db.batchSetAdoptCache(items);
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 5：添加 DELETE /adopt 端点**

```js
router.delete('/adopt', async (req, res, next) => {
  try {
    const { gameIds } = req.query;
    if (!gameIds) {
      return res.status(400).send({ error: 'gameIds is required' });
    }
    const ids = String(gameIds).split(',').map(Number).filter((n) => !isNaN(n));
    await db.deleteAdoptCache(ids);
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 6：启动应用验证端点可用**

运行：`cd d:\work\game-lib && npx quasar dev -m electron`

用浏览器或 curl 测试 `GET /api/cache/adopt?gameIds=1`，预期返回 `{ entries: [] }`。

- [ ] **步骤 7：Commit**

```bash
git add server/routes/cache.js
git commit -m "feat: add adopt_cache API endpoints"
```

---

### 任务 3：后端 — 修改 scan/add 返回新游戏列表

**文件：**
- 修改：`server/routes/game.js`

- [ ] **步骤 1：修改 POST /scan/add 端点**

将当前的：

```js
router.post('/scan/add', async (req, res, next) => {
  try {
    const { libraryId, dirs } = req.body;
    if (!libraryId || !Array.isArray(dirs)) {
      return res.status(400).send({ error: 'libraryId and dirs are required' });
    }

    const rows = dirs.map((d) => ({
      name: d,
      library_id: libraryId,
      sub_path: d,
    }));

    if (rows.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await db.knex('game').insert(rows.slice(i, i + BATCH_SIZE));
      }
    }

    res.status(201).send({ added: rows.length });
  } catch (err) {
    next(err);
  }
});
```

替换为：

```js
router.post('/scan/add', async (req, res, next) => {
  try {
    const { libraryId, dirs } = req.body;
    if (!libraryId || !Array.isArray(dirs)) {
      return res.status(400).send({ error: 'libraryId and dirs are required' });
    }

    const rows = dirs.map((d) => ({
      name: d,
      library_id: libraryId,
      sub_path: d,
    }));

    const inserted = [];
    if (rows.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const ids = await db.knex('game').insert(rows.slice(i, i + BATCH_SIZE), ['id', 'name', 'sub_path']);
        inserted.push(...ids);
      }
    }

    res.status(201).send({ added: rows.length, games: inserted });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 2：启动应用验证返回格式**

运行：`cd d:\work\game-lib && npx quasar dev -m electron`

Scan 一个有新目录的库，确认 scan/add 响应包含 `games` 数组。

- [ ] **步骤 3：Commit**

```bash
git add server/routes/game.js
git commit -m "feat: scan/add returns inserted game list"
```

---

### 任务 4：前端 — 增量 Scan 合并 + adopt 缓存 + 缓存共享

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：添加 preloadAdoptCache 函数**

在 `preloadCache` 函数之后添加：

```ts
const preloadAdoptCache = async () => {
  if (scanResults.value.length === 0) return;
  const gameIds = scanResults.value.map((r) => r.gameId);
  try {
    const res = await api.get('/cache/adopt', { params: { gameIds: gameIds.join(',') } });
    const entries = res.data.entries || [];
    const adoptMap = new Map(entries.map((e) => [e.game_id, e]));
    for (const row of scanResults.value) {
      const cached = adoptMap.get(row.gameId);
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

- [ ] **步骤 2：修改 loadUnscraped，在末尾调用 preloadAdoptCache**

将 `loadUnscraped` 函数末尾的 `await preloadCache();` 改为：

```ts
  await preloadCache();
  await preloadAdoptCache();
```

- [ ] **步骤 3：修改 onLibraryChange — 不再清空缓存**

将当前的：

```ts
const onLibraryChange = () => {
  searchCache.clear();
  segmentsCache.clear();
  detailCache.clear();
  void loadUnscraped();
};
```

替换为：

```ts
const onLibraryChange = () => {
  void loadUnscraped();
};
```

- [ ] **步骤 4：修改 scanDir — 增量合并**

将当前的 `scanDir` 函数：

```ts
const scanDir = async () => {
  if (!selectedLibrary.value) return;
  scanning.value = true;
  try {
    const res = await api.post('/games/scan', { libraryId: selectedLibrary.value });
    const newDirs: string[] = res.data.newDirs;
    const removedGames: { id: number; name: string; sub_path: string }[] =
      res.data.removedGames || [];

    if (newDirs.length > 0) {
      await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: newDirs,
      });
    }

    await loadUnscraped();

    const removedIds = new Set(removedGames.map((g) => g.id));
    for (const row of scanResults.value) {
      if (removedIds.has(row.gameId)) {
        row.status = 'stale';
      }
    }
  } finally {
    scanning.value = false;
  }
};
```

替换为：

```ts
const scanDir = async () => {
  if (!selectedLibrary.value) return;
  scanning.value = true;
  try {
    const res = await api.post('/games/scan', { libraryId: selectedLibrary.value });
    const newDirs: string[] = res.data.newDirs;
    const removedGames: { id: number; name: string; sub_path: string }[] =
      res.data.removedGames || [];

    const removedPaths = new Set(removedGames.map((g) => g.sub_path));
    for (const row of scanResults.value) {
      if (removedPaths.has(row.subPath)) {
        row.status = 'stale';
      }
    }

    if (newDirs.length > 0) {
      const addRes = await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: newDirs,
      });
      const addedGames: { id: number; name: string; sub_path: string }[] = addRes.data.games || [];
      const existingPaths = new Set(scanResults.value.map((r) => r.subPath));
      for (const g of addedGames) {
        if (!existingPaths.has(g.sub_path)) {
          const { keyword, segments } = splitKeyword(g.name);
          segmentsCache.set(g.name, [keyword, ...segments.filter((s) => s !== keyword)]);
          scanResults.value.push({
            gameId: g.id,
            name: g.name,
            subPath: g.sub_path,
            status: 'pending',
            searchResult: null,
            adoptData: null,
            searchKeyword: g.name,
            source: null,
            loading: false,
          });
        }
      }
      const newRows = scanResults.value.filter(
        (r) => addedGames.some((g) => g.id === r.gameId),
      );
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
        const newGameIds = newRows.map((r) => r.gameId);
        try {
          const adoptRes = await api.get('/cache/adopt', { params: { gameIds: newGameIds.join(',') } });
          const entries = adoptRes.data.entries || [];
          const adoptMap = new Map(entries.map((e) => [e.game_id, e]));
          for (const row of newRows) {
            const cached = adoptMap.get(row.gameId);
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
      }
    }
  } finally {
    scanning.value = false;
  }
};
```

- [ ] **步骤 5：修改 onAdopted — 写入 adopt_cache**

将当前的：

```ts
const onAdopted = (data: AdoptData) => {
  if (!scrapingRow.value) return;
  detailCache.set(`${data.source}:${data.sourceId}`, data.detail);
  scrapingRow.value.searchResult = {
    id: data.sourceId,
    name: data.name,
    makerName: data.makerName,
    coverUrl: data.coverUrl,
  };
  scrapingRow.value.adoptData = data;
  scrapingRow.value.source = data.source;
  scrapingRow.value.status = 'adopted';
};
```

替换为：

```ts
const onAdopted = (data: AdoptData) => {
  if (!scrapingRow.value) return;
  detailCache.set(`${data.source}:${data.sourceId}`, data.detail);
  scrapingRow.value.searchResult = {
    id: data.sourceId,
    name: data.name,
    makerName: data.makerName,
    coverUrl: data.coverUrl,
  };
  scrapingRow.value.adoptData = data;
  scrapingRow.value.source = data.source;
  scrapingRow.value.status = 'adopted';
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
};
```

- [ ] **步骤 6：修改 quickAdopt — 写入 adopt_cache**

在 `quickAdopt` 函数中，找到第一个 `row.status = 'adopted';`（缓存命中分支），在其后添加：

```ts
    api.post('/cache/adopt', {
      gameId: row.gameId,
      sourceType: row.source || 'dlsite',
      sourceId: row.searchResult!.id,
      sourceUrl: getSourceUrl(row.source || 'dlsite', row.searchResult!.id),
      name: cached.title,
      coverUrl: cached.coverURL,
      makers: cached.makers,
      genres: cached.genres,
      tags: cached.tags,
      description: cached.description,
    }).catch(() => {});
```

找到第二个 `row.status = 'adopted';`（API 获取分支，try 块内），在其后添加：

```ts
    api.post('/cache/adopt', {
      gameId: row.gameId,
      sourceType: row.source || 'dlsite',
      sourceId: row.searchResult!.id,
      sourceUrl: getSourceUrl(row.source || 'dlsite', row.searchResult!.id),
      name: detail.title,
      coverUrl: detail.coverURL,
      makers: detail.makers,
      genres: detail.genres,
      tags: detail.tags,
      description: detail.description,
    }).catch(() => {});
```

找到第三个 `row.status = 'adopted';`（catch 块内，fallback 分支），在其后添加：

```ts
    api.post('/cache/adopt', {
      gameId: row.gameId,
      sourceType: row.source || 'dlsite',
      sourceId: sr.id,
      sourceUrl: getSourceUrl(row.source || 'dlsite', sr.id),
      name: fallback.title,
      coverUrl: fallback.coverURL,
      makers: fallback.makers,
      genres: fallback.genres,
      tags: fallback.tags,
      description: fallback.description,
    }).catch(() => {});
```

- [ ] **步骤 7：修改 discardRow — 删除 adopt_cache**

将当前的：

```ts
const discardRow = (row: ScanRow) => {
  row.adoptData = null;
  if (row.status === 'adopted') {
    row.status = row.searchResult ? 'searched' : 'pending';
  } else {
    row.status = 'pending';
    row.searchResult = null;
    row.source = null;
    row.searchKeyword = row.name.match(/RJ\d+/)?.[0] || row.name;
  }
};
```

替换为：

```ts
const discardRow = (row: ScanRow) => {
  row.adoptData = null;
  api.delete('/cache/adopt', { params: { gameIds: row.gameId } }).catch(() => {});
  if (row.status === 'adopted') {
    row.status = row.searchResult ? 'searched' : 'pending';
  } else {
    row.status = 'pending';
    row.searchResult = null;
    row.source = null;
    row.searchKeyword = row.name.match(/RJ\d+/)?.[0] || row.name;
  }
};
```

- [ ] **步骤 8：修改 doSubmit — 提交后删除 adopt_cache**

在 `doSubmit` 函数中，找到 `if (staleRows.length > 0) {` 之前，添加 adopt_cache 删除逻辑：

```ts
  const adoptedGameIds = games.map((g) => g.gameId);
  if (adoptedGameIds.length > 0) {
    try {
      await api.delete('/cache/adopt', { params: { gameIds: adoptedGameIds.join(',') } });
    } catch {
      // adopt cache delete failure is non-critical
    }
  }
```

完整的 `doSubmit` 函数变为：

```ts
const doSubmit = async (games: SubmitGame[], staleRows: ScanRow[]) => {
  const failedIds = new Set<number>();
  if (games.length > 0) {
    const batchRes = await api.post('/scraper/adopt/batch', { games });
    const results: { gameId: number; success: boolean; error?: string }[] =
      batchRes.data.results || [];
    for (const r of results) {
      if (!r.success) {
        failedIds.add(r.gameId);
        const row = scanResults.value.find((ar) => ar.gameId === r.gameId);
        if (row) row.status = row.searchResult ? 'searched' : 'pending';
      }
    }
    const adoptedGameIds = games.map((g) => g.gameId);
    if (adoptedGameIds.length > 0) {
      try {
        await api.delete('/cache/adopt', { params: { gameIds: adoptedGameIds.join(',') } });
      } catch {
        // adopt cache delete failure is non-critical
      }
    }
  }
  if (staleRows.length > 0) {
    await api.post('/games/batch-delete', { ids: staleRows.map((r) => r.gameId) });
  }
  scanResults.value = scanResults.value.filter((r) => {
    if (r.status === 'stale') return false;
    if (r.status === 'adopted') return failedIds.has(r.gameId);
    return true;
  });
  emit('done');
};
```

- [ ] **步骤 9：修改 forceRefresh — 清空 adopt_cache**

将当前的：

```ts
const forceRefresh = async () => {
  const keys = scanResults.value.map((r) => `auto:${r.searchKeyword || r.name}`);
  searchCache.clear();
  detailCache.clear();
  try {
    if (keys.length > 0) {
      await api.delete('/cache/search', { params: { keys: keys.join(',') } });
    }
  } catch {
    // cache delete failure is non-critical
  }
  for (const row of scanResults.value) {
    if (row.status === 'searched' || row.status === 'error') {
      row.status = 'pending';
      row.searchResult = null;
      row.source = null;
    }
  }
};
```

替换为：

```ts
const forceRefresh = async () => {
  const keys = scanResults.value.map((r) => `auto:${r.searchKeyword || r.name}`);
  searchCache.clear();
  detailCache.clear();
  try {
    if (keys.length > 0) {
      await api.delete('/cache/search', { params: { keys: keys.join(',') } });
    }
    const allGameIds = scanResults.value.map((r) => r.gameId);
    if (allGameIds.length > 0) {
      await api.delete('/cache/adopt', { params: { gameIds: allGameIds.join(',') } });
    }
  } catch {
    // cache delete failure is non-critical
  }
  for (const row of scanResults.value) {
    if (row.status === 'searched' || row.status === 'error' || row.status === 'adopted') {
      row.status = 'pending';
      row.searchResult = null;
      row.source = null;
      row.adoptData = null;
    }
  }
};
```

- [ ] **步骤 10：修改 watch modelValue — 关闭时不清空缓存**

将当前的：

```ts
watch(modelValue, (val) => {
  if (val) {
    void fetchSettings()
      .then(() => fetchLibraries())
      .then(() => loadUnscraped());
  } else {
    searchCache.clear();
    segmentsCache.clear();
    detailCache.clear();
  }
});
```

替换为：

```ts
watch(modelValue, (val) => {
  if (val) {
    void fetchSettings()
      .then(() => fetchLibraries())
      .then(() => loadUnscraped());
  }
});
```

- [ ] **步骤 11：修改 batchScrape — 自动 adopt 时写入 adopt_cache**

在 `batchScrape` 函数中，找到缓存命中分支里的 `await quickAdopt(row);` 调用。`quickAdopt` 内部已经写了 adopt_cache，所以此处无需额外修改。

但需确认：`quickAdopt` 中写入 adopt_cache 的 API 调用是 fire-and-forget（`.catch(() => {})`），不会阻塞 batch 流程。✅ 已在步骤 6 中处理。

- [ ] **步骤 12：启动应用端到端测试**

运行：`cd d:\work\game-lib && npx quasar dev -m electron`

测试场景：
1. 打开 Scan & Scrape 对话框，选择一个库
2. 点 Scan → 确认游戏列表加载
3. 点 Scrape All → 等待完成
4. 手动 Adopt 几个游戏
5. 再次点 Scan → 确认已有状态保留，进度条只显示新增游戏
6. 关闭对话框再打开 → 确认 adopted 状态恢复
7. 点 Force Refresh → 确认所有状态重置

- [ ] **步骤 13：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: incremental scan merge, adopt cache persistence, cross-library cache sharing"
```