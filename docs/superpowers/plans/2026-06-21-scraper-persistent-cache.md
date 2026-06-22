# Scraper Persistent Cache 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 Scrape All 的搜索结果添加持久缓存（search_cache 表），避免重复扫描同一库时重新获取所有搜索结果。detail_cache 仅保留内存层。

**架构：** search_cache 表作为 L2 持久层，内存 Map 作为 L1 缓存。ScannerDialog 打开时从 DB 预加载，搜索命中时写 Map + DB，Force Refresh 清除缓存重新爬取。

**技术栈：** Express + Knex（后端），Vue 3 + Quasar（前端），SQLite（数据库）

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `server/database/schema.js` | 新建数据库时创建 search_cache 表 |
| `server/database/init.js` | 已有数据库迁移时创建 search_cache 表 |
| `server/database/db.js` | search_cache 的 CRUD 函数 |
| `server/routes/cache.js` | search_cache 的 REST API 路由 |
| `server/routes/index.js` | 注册 cache 路由 |
| `src/components/ScannerDialog.vue` | 前端缓存集成（预加载、读写、Force Refresh） |

---

### 任务 1：数据库层 — search_cache 表定义

**文件：**
- 修改：`server/database/schema.js`
- 修改：`server/database/init.js`

- [ ] **步骤 1：在 schema.js 中添加 search_cache 表**

在 `createSchema` 链末尾 `.createTable('setting', ...)` 之后追加：

```javascript
.createTable('search_cache', (table) => {
  table.string('key').primary()
  table.string('source').notNullable()
  table.string('keyword').notNullable()
  table.text('results').notNullable()
  table.dateTime('created_at').defaultTo(knex.fn.now())
  table.dateTime('updated_at').defaultTo(knex.fn.now())
})
```

- [ ] **步骤 2：在 init.js 中注册 search_cache 到 ALL_TABLES 和 TABLE_DDL**

在 `ALL_TABLES` 数组末尾添加 `'search_cache'`。

在 `TABLE_DDL` 对象中添加：

```javascript
search_cache: (knex) => knex.schema.createTable('search_cache', (table) => {
  table.string('key').primary()
  table.string('source').notNullable()
  table.string('keyword').notNullable()
  table.text('results').notNullable()
  table.dateTime('created_at').defaultTo(knex.fn.now())
  table.dateTime('updated_at').defaultTo(knex.fn.now())
})
```

- [ ] **步骤 3：启动后端验证表创建**

运行：`cd d:\work\game-lib && npm run dev:server`

预期：控制台输出 `* Creating missing table: search_cache` 或 `* All tables exist.`，无报错。

- [ ] **步骤 4：Commit**

```bash
git add server/database/schema.js server/database/init.js
git commit -m "feat: add search_cache table to schema and migration"
```

---

### 任务 2：数据库层 — search_cache CRUD 函数

**文件：**
- 修改：`server/database/db.js`

- [ ] **步骤 1：添加 search_cache CRUD 函数**

在 `db.js` 末尾 export 之前添加：

```javascript
const getSearchCache = async (key) => {
  const row = await db('search_cache').where({ key }).first()
  if (!row) return null
  return { ...row, results: JSON.parse(row.results) }
}

const setSearchCache = async ({ key, source, keyword, results }) => {
  const data = {
    key,
    source,
    keyword,
    results: JSON.stringify(results),
    updated_at: db.fn.now()
  }
  await db('search_cache').insert(data).onConflict('key').merge()
}

const batchSetSearchCache = async (items) => {
  for (const item of items) {
    const data = {
      key: item.key,
      source: item.source,
      keyword: item.keyword,
      results: JSON.stringify(item.results),
      updated_at: db.fn.now()
    }
    await db('search_cache').insert(data).onConflict('key').merge()
  }
}

const deleteSearchCache = async (keys) => {
  if (keys.length === 0) return
  await db('search_cache').whereIn('key', keys).del()
}

const getSearchCacheByKeywords = async (keywords) => {
  if (keywords.length === 0) return []
  const rows = await db('search_cache').whereIn('keyword', keywords)
  return rows.map(r => ({ ...r, results: JSON.parse(r.results) }))
}
```

在 export 列表中添加：

```javascript
getSearchCache,
setSearchCache,
batchSetSearchCache,
deleteSearchCache,
getSearchCacheByKeywords
```

- [ ] **步骤 2：验证无语法错误**

运行：`cd d:\work\game-lib && node -e "import('./server/database/db.js').then(m => console.log(Object.keys(m)))"`

预期：输出包含 `getSearchCache`, `setSearchCache`, `batchSetSearchCache`, `deleteSearchCache`, `getSearchCacheByKeywords`。

- [ ] **步骤 3：Commit**

```bash
git add server/database/db.js
git commit -m "feat: add search_cache CRUD functions to db module"
```

---

### 任务 3：后端 API — cache 路由

**文件：**
- 创建：`server/routes/cache.js`
- 修改：`server/routes/index.js`

- [ ] **步骤 1：创建 cache.js 路由文件**

```javascript
import express from 'express'
import * as db from '../database/db.js'

const router = express.Router()

router.get('/search', async (req, res, next) => {
  try {
    const { key } = req.query
    if (!key) {
      return res.status(400).send({ error: 'key is required' })
    }
    const cached = await db.getSearchCache(key)
    if (!cached) {
      return res.send({ hit: false })
    }
    res.send({ hit: true, data: cached })
  } catch (err) {
    next(err)
  }
})

router.post('/search', async (req, res, next) => {
  try {
    const { key, source, keyword, results } = req.body
    if (!key || !source || !keyword || !results) {
      return res.status(400).send({ error: 'key, source, keyword, results are required' })
    }
    await db.setSearchCache({ key, source, keyword, results })
    res.send({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/search/batch', async (req, res, next) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).send({ error: 'items array is required' })
    }
    await db.batchSetSearchCache(items)
    res.send({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.delete('/search', async (req, res, next) => {
  try {
    const { keys } = req.query
    if (!keys) {
      return res.status(400).send({ error: 'keys is required' })
    }
    const keyArray = String(keys).split(',')
    await db.deleteSearchCache(keyArray)
    res.send({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/search/preload', async (req, res, next) => {
  try {
    const { keywords } = req.body
    if (!Array.isArray(keywords)) {
      return res.status(400).send({ error: 'keywords array is required' })
    }
    const entries = await db.getSearchCacheByKeywords(keywords)
    res.send({ entries })
  } catch (err) {
    next(err)
  }
})

export default router
```

- [ ] **步骤 2：在 index.js 中注册 cache 路由**

在 `server/routes/index.js` 中添加 import 和注册：

```javascript
import cacheRoutes from './cache.js'
```

在路由注册区域添加：

```javascript
router.use('/cache', cacheRoutes)
```

- [ ] **步骤 3：验证 API 可访问**

运行后端：`cd d:\work\game-lib && npm run dev:server`

测试：

```bash
curl http://127.0.0.1:19700/api/cache/search?key=auto:test
```

预期：`{"hit":false}`

- [ ] **步骤 4：Commit**

```bash
git add server/routes/cache.js server/routes/index.js
git commit -m "feat: add search_cache REST API routes"
```

---

### 任务 4：前端 — ScannerDialog 集成缓存预加载

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：添加 preloadCache 函数**

在 `batchScrape` 函数之前添加：

```typescript
const preloadCache = async () => {
  if (scanResults.value.length === 0) return
  const keywords = scanResults.value.map(r => r.searchKeyword || r.name)
  try {
    const res = await api.post('/cache/search/preload', { keywords })
    const entries = res.data.entries || []
    for (const entry of entries) {
      searchCache.set(entry.key, entry.results)
    }
  } catch {
    // preload failure is non-critical
  }
}
```

- [ ] **步骤 2：在 loadUnscraped 末尾调用 preloadCache**

在 `loadUnscraped` 函数末尾，`segmentsCache.set` 循环之后添加：

```typescript
await preloadCache()
```

- [ ] **步骤 3：验证预加载工作**

启动前后端，打开 Scan & Scrape 对话框，选择一个库。

预期：网络请求中出现 `POST /api/cache/search/preload`，首次无缓存返回空 entries，无报错。

- [ ] **步骤 4：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: preload search_cache from DB on ScannerDialog open"
```

---

### 任务 5：前端 — batchScrape 集成 DB 缓存读写

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：修改 batchScrape 中的缓存逻辑**

在 `batchScrape` 函数中，将原来的内存缓存命中逻辑改为 L1→L2 两级查找，API 获取后同时写 DB。

替换 `batchScrape` 函数中 `const cached = searchCache.get(autoKey)` 及其后续分支为：

```typescript
let cached = searchCache.get(autoKey)
if (!cached) {
  try {
    const dbRes = await api.get('/cache/search', { params: { key: autoKey } })
    if (dbRes.data.hit) {
      cached = dbRes.data.data.results
      searchCache.set(autoKey, cached)
    }
  } catch {
    // DB lookup failure is non-critical
  }
}
if (cached) {
  if (cached.length > 0) {
    row.searchResult = cached[0] ?? null
    if (row.searchResult && row.searchResult.name === row.name) {
      row.status = 'searched'
      await quickAdopt(row)
    } else {
      row.status = 'searched'
    }
  } else {
    row.status = 'error'
  }
} else {
  const searchRes = await api.post('/scraper/auto/search', { keyword, name: row.name })
  const data = searchRes.data
  const results: SearchResult[] = data.results ?? []
  row.source = data.source || null
  searchCache.set(autoKey, results)
  if (data.source) {
    searchCache.set(`${data.source}:${keyword}`, results)
  }
  try {
    await api.post('/cache/search', {
      key: autoKey,
      source: data.source || 'auto',
      keyword,
      results
    })
    if (data.source) {
      await api.post('/cache/search', {
        key: `${data.source}:${keyword}`,
        source: data.source,
        keyword,
        results
      })
    }
  } catch {
    // cache write failure is non-critical
  }
  if (results.length > 0) {
    row.searchResult = results[0] ?? null
    if (row.searchResult && row.searchResult.name === row.name) {
      row.status = 'searched'
      await quickAdopt(row)
    } else {
      row.status = 'searched'
    }
  } else {
    row.status = 'error'
  }
}
```

- [ ] **步骤 2：验证 Scrape All 使用缓存**

1. 首次 Scrape All：观察网络请求，每个游戏先查 `GET /cache/search`，miss 后调 `/scraper/auto/search`，然后 `POST /cache/search` 写入。
2. 关闭对话框重新打开，再次 Scrape All：这次 `GET /cache/search` 应该 hit，不再调用 `/scraper/auto/search`。

- [ ] **步骤 3：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: integrate DB cache read/write in batchScrape"
```

---

### 任务 6：前端 — onSearched 写入 DB 缓存

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：修改 onSearched 回调，同时写 DB**

将 `onSearched` 函数改为：

```typescript
const onSearched = (source: SourceType, keyword: string, results: SearchResult[]) => {
  const key = `${source}:${keyword}`
  searchCache.set(key, results)
  api.post('/cache/search', { key, source, keyword, results }).catch(() => {})
}
```

- [ ] **步骤 2：验证手动搜索也写缓存**

打开 Scan & Scrape，点击某行的 Scrape/Reselect，在 ScrapeDialog 中搜索，关闭后观察网络请求中有 `POST /cache/search`。

- [ ] **步骤 3：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: persist search results to DB on manual search"
```

---

### 任务 7：前端 — Force Refresh 按钮

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：在模板中添加 Force Refresh 按钮**

在 `Scrape All` 按钮之后添加：

```html
<q-btn color="warning" label="Force Refresh" @click="forceRefresh" :disable="scanResults.length === 0" />
```

- [ ] **步骤 2：添加 forceRefresh 函数**

在 `batchScrape` 函数之后添加：

```typescript
const forceRefresh = async () => {
  const keys = scanResults.value.map(r => `auto:${r.searchKeyword || r.name}`)
  searchCache.clear()
  detailCache.clear()
  try {
    if (keys.length > 0) {
      await api.delete('/cache/search', { params: { keys: keys.join(',') } })
    }
  } catch {
    // cache delete failure is non-critical
  }
  for (const row of scanResults.value) {
    if (row.status === 'searched' || row.status === 'error') {
      row.status = 'pending'
      row.searchResult = null
      row.source = null
    }
  }
}
```

- [ ] **步骤 3：验证 Force Refresh**

1. Scrape All 完成后，点击 Force Refresh。
2. 观察网络请求中有 `DELETE /cache/search?keys=...`。
3. 所有 searched/error 行回到 pending 状态。
4. 再次 Scrape All，应该重新从 API 获取（不再命中缓存）。

- [ ] **步骤 4：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: add Force Refresh button to clear cache and re-scrape"
```

---

### 任务 8：前端 — 对话框关闭时保留 DB 缓存

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：修改 watch 中的关闭逻辑**

当前 `watch(modelValue, ...)` 关闭时清空了 `searchCache`。由于 DB 是 source of truth，关闭时只需清空 Map（释放内存），不需要清 DB。当前代码已经是 `searchCache.clear()`，这是正确的——Map 清空但 DB 保留，下次打开会通过 `preloadCache` 重新加载。

确认当前代码无需修改，只需验证行为正确。

- [ ] **步骤 2：验证关闭重开缓存持久化**

1. Scrape All 完成后关闭对话框。
2. 重新打开 Scan & Scrape，选择同一库。
3. 观察 `POST /cache/search/preload` 返回了之前缓存的 entries。
4. Scrape All 应该直接命中缓存，不再调用 `/scraper/auto/search`。

- [ ] **步骤 3：Commit（如有修改）**

如果步骤 1 中确认无需修改代码，跳过此步骤。

---

## 自检

**1. 规格覆盖度：**
- ✅ search_cache 表结构 → 任务 1
- ✅ detail_cache 仅内存 → 当前代码已满足，无需修改
- ✅ L1 Map + L2 DB 两级缓存 → 任务 4、5
- ✅ 预加载缓存 → 任务 4
- ✅ batchScrape 缓存读写 → 任务 5
- ✅ 手动搜索写缓存 → 任务 6
- ✅ Force Refresh → 任务 7
- ✅ 对话框关闭保留 DB → 任务 8
- ✅ API: GET/POST/DELETE search cache → 任务 3
- ✅ API: POST search/batch → 任务 3（预留，未在前端使用，后续可优化批量写入）
- ✅ API: POST search/preload → 任务 3
- ✅ 无 TTL → 设计文档已确认

**2. 占位符扫描：** 无 TODO/TBD/待定。

**3. 类型一致性：**
- `SearchResult` 接口在 ScannerDialog 中定义，与缓存存储的 JSON 结构一致
- `cacheKey` 格式 `source:keyword` 与 DB 的 `key` 字段一致
- `autoKey` 格式 `auto:keyword` 与设计文档一致