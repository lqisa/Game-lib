# Game-Lib MVP 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 构建本地游戏管理桌面应用 MVP，支持游戏库管理、目录扫描、DLSite 采集和基本浏览。

**架构：** Quasar Electron 模式，主进程内嵌 Express + SQLite，渲染进程通过 HTTP API 通信。

**技术栈：** Quasar 2.x / Vue 3 / TypeScript / Pinia / Express / Knex.js / SQLite3 / cheerio

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src-electron/main.js` | Electron 主进程入口，启动 Express + 创建窗口 |
| `src-electron/preload.js` | contextBridge |
| `server/app.js` | Express 应用配置 |
| `server/database/db.js` | Knex 实例 + 数据访问层 |
| `server/database/schema.js` | 建表 SQL |
| `server/database/init.js` | 数据库初始化 |
| `server/routes/index.js` | 路由汇总 |
| `server/routes/library.js` | 游戏库 CRUD |
| `server/routes/game.js` | 游戏 CRUD + 扫描 |
| `server/routes/scraper.js` | 采集 API |
| `server/routes/setting.js` | 设置 API |
| `server/routes/cover.js` | 封面服务 |
| `server/scraper/axios.js` | HTTP 客户端 |
| `server/scraper/dlsite.js` | DLSite 爬虫 |
| `server/scanner.js` | 目录扫描 |
| `src/layouts/MainLayout.vue` | 主布局 |
| `src/pages/GameLibPage.vue` | 游戏库主页 |
| `src/pages/GameDetailPage.vue` | 游戏详情 |
| `src/pages/SettingPage.vue` | 设置页 |
| `src/components/GameCard.vue` | 游戏卡片 |
| `src/components/ScannerDialog.vue` | 扫描采集弹窗 |
| `src/composables/useApi.ts` | Axios 封装 |
| `src/stores/game.ts` | Pinia 状态 |
| `src/router/routes.ts` | 路由 |

---

## 任务 1：Quasar Electron 项目初始化

**文件：**
- 修改：`package.json`
- 创建：`quasar.config.ts`
- 创建：`src-electron/main.js`
- 创建：`src-electron/preload.js`
- 创建：`src/App.vue`
- 创建：`src/router/routes.ts`

- [ ] **步骤 1：安装后端依赖**

```bash
cd d:\work\game-lib
npm install express knex sqlite3 cheerio
npm install --save-dev nodemon
```

- [ ] **步骤 2：添加 Electron 模式**

```bash
cd d:\work\game-lib
npx quasar mode add electron
```

- [ ] **步骤 3：验证项目能启动**

```bash
cd d:\work\game-lib
npx quasar dev -m electron
```

预期：Electron 窗口打开，显示 Quasar 默认页面。

- [ ] **步骤 4：Commit**

```bash
cd d:\work\game-lib
git add -A
git commit -m "feat: init quasar electron project with dependencies"
```

---

## 任务 2：数据库层

**文件：**
- 创建：`server/database/schema.js`
- 创建：`server/database/db.js`
- 创建：`server/database/init.js`

- [ ] **步骤 1：创建 schema.js**

```javascript
// server/database/schema.js
const { knex } = require('./db')

const createSchema = () => knex.schema
  .createTable('library', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.string('path').notNullable()
  })
  .createTable('maker', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.text('description')
  })
  .createTable('genre', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.text('description')
  })
  .createTable('tag', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.text('description')
  })
  .createTable('game', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.text('cover_path')
    table.text('description')
    table.integer('library_id').notNullable()
    table.string('sub_path').notNullable()
    table.dateTime('created_at').defaultTo(knex.fn.now())
    table.dateTime('updated_at').defaultTo(knex.fn.now())
    table.foreign('library_id').references('id').inTable('library').onDelete('CASCADE')
  })
  .createTable('game_maker', (table) => {
    table.integer('game_id').notNullable()
    table.integer('maker_id').notNullable()
    table.primary(['game_id', 'maker_id'])
    table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE')
    table.foreign('maker_id').references('id').inTable('maker').onDelete('CASCADE')
  })
  .createTable('game_genre', (table) => {
    table.integer('game_id').notNullable()
    table.integer('genre_id').notNullable()
    table.primary(['game_id', 'genre_id'])
    table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE')
    table.foreign('genre_id').references('id').inTable('genre').onDelete('CASCADE')
  })
  .createTable('game_tag', (table) => {
    table.integer('game_id').notNullable()
    table.integer('tag_id').notNullable()
    table.primary(['game_id', 'tag_id'])
    table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE')
    table.foreign('tag_id').references('id').inTable('tag').onDelete('CASCADE')
  })
  .createTable('game_source', (table) => {
    table.increments()
    table.integer('game_id').notNullable()
    table.string('source_type').notNullable()
    table.string('source_id').notNullable()
    table.text('source_url')
    table.text('raw_data')
    table.unique(['source_type', 'source_id'])
    table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE')
  })
  .createTable('setting', (table) => {
    table.string('key').primary()
    table.text('value').notNullable()
  })

module.exports = { createSchema }
```

- [ ] **步骤 2：创建 db.js**

```javascript
// server/database/db.js
const path = require('path')
const fs = require('fs')
const knex = require('knex')

const DB_DIR = path.join(__dirname, '..', '..', 'data')
const DB_PATH = path.join(DB_DIR, 'db.sqlite3')

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

const db = knex({
  client: 'sqlite3',
  connection: { filename: DB_PATH },
  useNullAsDefault: true
})

const getGameDetail = async (id) => {
  const game = await db('game').where({ id }).first()
  if (!game) return null

  const makers = await db('game_maker')
    .join('maker', 'game_maker.maker_id', 'maker.id')
    .where('game_maker.game_id', id)
    .select('maker.id', 'maker.name')

  const genres = await db('game_genre')
    .join('genre', 'game_genre.genre_id', 'genre.id')
    .where('game_genre.game_id', id)
    .select('genre.id', 'genre.name')

  const tags = await db('game_tag')
    .join('tag', 'game_tag.tag_id', 'tag.id')
    .where('game_tag.game_id', id)
    .select('tag.id', 'tag.name')

  const sources = await db('game_source')
    .where('game_id', id)
    .select('id', 'source_type', 'source_id', 'source_url')

  const library = await db('library').where({ id: game.library_id }).first()

  return { ...game, makers, genres, tags, sources, library }
}

const getGames = async ({ page = 1, pageSize = 50, keyword = '' }) => {
  let query = db('game')
    .leftJoin('library', 'game.library_id', 'library.id')
    .select('game.*', 'library.name as library_name', 'library.path as library_path')
    .orderBy('game.updated_at', 'desc')

  if (keyword) {
    query = query.where('game.name', 'like', `%${keyword}%`)
  }

  const total = await query.clone().count('* as count').first()
  const offset = (page - 1) * pageSize
  const games = await query.offset(offset).limit(pageSize)

  return { games, total: total.count, page, pageSize }
}

const insertGame = async (data) => db('game').insert(data)
const updateGame = async (id, data) => db('game').where({ id }).update({ ...data, updated_at: db.fn.now() })
const deleteGame = async (id) => db('game').where({ id }).del()
const batchDeleteGames = async (ids) => db('game').whereIn('id', ids).del()
const insertLibrary = async (data) => db('library').insert(data)
const getLibraries = async () => db('library').select('*')
const updateLibrary = async (id, data) => db('library').where({ id }).update(data)
const deleteLibrary = async (id) => db('library').where({ id }).del()

const getSetting = async (key) => {
  const row = await db('setting').where({ key }).first()
  return row ? row.value : null
}

const setSetting = async (key, value) => {
  return db('setting').insert({ key, value }).onConflict('key').merge()
}

const getAllSettings = async () => {
  const rows = await db('setting').select('*')
  const settings = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }
  return settings
}

const insertGameSource = async (data) => {
  return db('game_source').insert(data).onConflict(['source_type', 'source_id']).merge()
}

const insertMakers = async (names) => {
  const results = []
  for (const name of names) {
    const existing = await db('maker').where({ name }).first()
    if (existing) {
      results.push(existing.id)
    } else {
      const [id] = await db('maker').insert({ name })
      results.push(id)
    }
  }
  return results
}

const insertGenres = async (names) => {
  const results = []
  for (const name of names) {
    const existing = await db('genre').where({ name }).first()
    if (existing) {
      results.push(existing.id)
    } else {
      const [id] = await db('genre').insert({ name })
      results.push(id)
    }
  }
  return results
}

const insertTags = async (names) => {
  const results = []
  for (const name of names) {
    const existing = await db('tag').where({ name }).first()
    if (existing) {
      results.push(existing.id)
    } else {
      const [id] = await db('tag').insert({ name })
      results.push(id)
    }
  }
  return results
}

const syncGameMakers = async (gameId, makerIds) => {
  await db('game_maker').where({ game_id: gameId }).del()
  if (makerIds.length > 0) {
    await db('game_maker').insert(makerIds.map(m => ({ game_id: gameId, maker_id: m })))
  }
}

const syncGameGenres = async (gameId, genreIds) => {
  await db('game_genre').where({ game_id: gameId }).del()
  if (genreIds.length > 0) {
    await db('game_genre').insert(genreIds.map(g => ({ game_id: gameId, genre_id: g })))
  }
}

const syncGameTags = async (gameId, tagIds) => {
  await db('game_tag').where({ game_id: gameId }).del()
  if (tagIds.length > 0) {
    await db('game_tag').insert(tagIds.map(t => ({ game_id: gameId, tag_id: t })))
  }
}

module.exports = {
  knex: db,
  getGameDetail,
  getGames,
  insertGame,
  updateGame,
  deleteGame,
  batchDeleteGames,
  insertLibrary,
  getLibraries,
  updateLibrary,
  deleteLibrary,
  getSetting,
  setSetting,
  getAllSettings,
  insertGameSource,
  insertMakers,
  insertGenres,
  insertTags,
  syncGameMakers,
  syncGameGenres,
  syncGameTags
}
```

- [ ] **步骤 3：创建 init.js**

```javascript
// server/database/init.js
const fs = require('fs')
const path = require('path')
const { knex } = require('./db')
const { createSchema } = require('./schema')

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'db.sqlite3')

const initDatabase = async () => {
  const dbExists = fs.existsSync(DB_PATH)

  if (!dbExists) {
    console.log(' * 数据库不存在，正在创建...')
    await createSchema()
    console.log(' * 数据库创建完成.')
  } else {
    console.log(' * 数据库已存在.')
  }
}

module.exports = { initDatabase }
```

- [ ] **步骤 4：验证数据库初始化**

```bash
cd d:\work\game-lib
node -e "const { initDatabase } = require('./server/database/init'); initDatabase().then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```

预期：输出 `数据库不存在，正在创建...` 和 `数据库创建完成.`，`data/db.sqlite3` 文件生成。

- [ ] **步骤 5：验证表结构**

```bash
cd d:\work\game-lib
node -e "const { knex } = require('./server/database/db'); knex.raw('SELECT name FROM sqlite_master WHERE type=\"table\"').then(r => { console.log(r); knex.destroy(); })"
```

预期：输出包含 library, maker, genre, tag, game, game_maker, game_genre, game_tag, game_source, setting 表。

- [ ] **步骤 6：更新 .gitignore 并 Commit**

```bash
cd d:\work\game-lib
echo "data/" >> .gitignore
git add server/database/ .gitignore
git commit -m "feat: add database layer with schema, db access and init"
```

---

## 任务 3：Express 服务器 + 主进程集成

**文件：**
- 创建：`server/app.js`
- 创建：`server/routes/index.js`
- 创建：`server/routes/library.js`（占位）
- 创建：`server/routes/game.js`（占位）
- 创建：`server/routes/scraper.js`（占位）
- 创建：`server/routes/setting.js`（占位）
- 创建：`server/routes/cover.js`（占位）
- 修改：`src-electron/main.js`

- [ ] **步骤 1：创建 Express 应用**

```javascript
// server/app.js
const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')
const routes = require('./routes')

const createApp = () => {
  const app = express()

  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: true }))

  app.use('/api', routes)

  const coversDir = path.join(__dirname, '..', 'data', 'covers')
  if (!require('fs').existsSync(coversDir)) {
    require('fs').mkdirSync(coversDir, { recursive: true })
  }
  app.use('/covers', express.static(coversDir))

  return app
}

module.exports = { createApp }
```

- [ ] **步骤 2：创建路由汇总**

```javascript
// server/routes/index.js
const express = require('express')
const router = express.Router()

router.use('/libraries', require('./library'))
router.use('/games', require('./game'))
router.use('/scraper', require('./scraper'))
router.use('/settings', require('./setting'))
router.use('/cover', require('./cover'))

router.get('/health', (req, res) => {
  res.send({ status: 'ok' })
})

module.exports = router
```

- [ ] **步骤 3：创建占位路由文件（5 个）**

每个都是：
```javascript
// server/routes/library.js  (同样模式用于 game.js, scraper.js, setting.js, cover.js)
const express = require('express')
const router = express.Router()
module.exports = router
```

- [ ] **步骤 4：修改 Electron 主进程**

```javascript
// src-electron/main.js
import { app, BrowserWindow } from 'electron'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

let mainWindow

async function createWindow() {
  const { createApp } = await import(path.resolve(__dirname, '..', '..', 'server', 'app.js'))
  const { initDatabase } = await import(path.resolve(__dirname, '..', '..', 'server', 'database', 'init.js'))

  await initDatabase()

  const expressApp = createApp()
  const server = expressApp.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    console.log(`Express server running on http://127.0.0.1:${port}`)

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.resolve(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    mainWindow.loadURL(`http://127.0.0.1:${port}`)
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  })
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
```

> 注意：Quasar Electron 的 main.js 是 ESM 格式。如果 `require()` 报错，改用 `import()` 动态导入。

- [ ] **步骤 5：验证 Electron 启动**

```bash
cd d:\work\game-lib
npx quasar dev -m electron
```

预期：Electron 窗口打开，浏览器控制台访问 `http://127.0.0.1:{port}/api/health` 返回 `{"status":"ok"}`。

- [ ] **步骤 6：Commit**

```bash
cd d:\work\game-lib
git add server/ src-electron/
git commit -m "feat: add express server and electron main process integration"
```

---

## 任务 4：游戏库 CRUD API

**文件：**
- 修改：`server/routes/library.js`

- [ ] **步骤 1：实现游戏库路由**

```javascript
// server/routes/library.js
const express = require('express')
const router = express.Router()
const db = require('../database/db')

router.get('/', async (req, res, next) => {
  try {
    const libraries = await db.getLibraries()
    res.send(libraries)
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { name, path } = req.body
    if (!name || !path) {
      return res.status(400).send({ error: 'name 和 path 为必填项' })
    }
    const [id] = await db.insertLibrary({ name, path })
    const library = await db.knex('library').where({ id }).first()
    res.send(library)
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { name, path } = req.body
    await db.updateLibrary(req.params.id, { name, path })
    const library = await db.knex('library').where({ id: req.params.id }).first()
    res.send(library)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await db.deleteLibrary(req.params.id)
    res.send({ message: '删除成功' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
```

- [ ] **步骤 2：手动测试 API**

```bash
curl http://127.0.0.1:{port}/api/libraries
curl -X POST http://127.0.0.1:{port}/api/libraries -H "Content-Type: application/json" -d "{\"name\":\"test\",\"path\":\"D:\\\\games\"}"
```

预期：GET 返回空数组，POST 返回新建的库对象。

- [ ] **步骤 3：Commit**

```bash
cd d:\work\game-lib
git add server/routes/library.js
git commit -m "feat: add library CRUD API"
```

---

## 任务 5：目录扫描 + 游戏 CRUD API

**文件：**
- 创建：`server/scanner.js`
- 修改：`server/routes/game.js`

- [ ] **步骤 1：创建目录扫描器**

```javascript
// server/scanner.js
const fs = require('fs')

const scanLibrary = (libraryPath) => {
  if (!fs.existsSync(libraryPath)) {
    return []
  }
  const entries = fs.readdirSync(libraryPath, { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

module.exports = { scanLibrary }
```

- [ ] **步骤 2：实现游戏路由**

```javascript
// server/routes/game.js
const express = require('express')
const router = express.Router()
const db = require('../database/db')
const { scanLibrary } = require('../scanner')

router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 50
    const keyword = req.query.keyword || ''
    const result = await db.getGames({ page, pageSize, keyword })
    res.send(result)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const game = await db.getGameDetail(req.params.id)
    if (!game) {
      return res.status(404).send({ error: '游戏不存在' })
    }
    res.send(game)
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { name, description, cover_path } = req.body
    await db.updateGame(req.params.id, { name, description, cover_path })
    const game = await db.getGameDetail(req.params.id)
    res.send(game)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await db.deleteGame(req.params.id)
    res.send({ message: '删除成功' })
  } catch (err) {
    next(err)
  }
})

router.post('/batch-delete', async (req, res, next) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).send({ error: 'ids 为必填数组' })
    }
    await db.batchDeleteGames(ids)
    res.send({ message: '批量删除成功' })
  } catch (err) {
    next(err)
  }
})

router.post('/scan', async (req, res, next) => {
  try {
    const { libraryId } = req.body
    if (!libraryId) {
      return res.status(400).send({ error: 'libraryId 为必填项' })
    }
    const library = await db.knex('library').where({ id: libraryId }).first()
    if (!library) {
      return res.status(404).send({ error: '游戏库不存在' })
    }
    const dirs = scanLibrary(library.path)
    const existing = await db.knex('game')
      .where({ library_id: libraryId })
      .select('sub_path')
    const existingPaths = new Set(existing.map(g => g.sub_path))
    const newDirs = dirs.filter(d => !existingPaths.has(d))
    res.send({ library, dirs, newDirs })
  } catch (err) {
    next(err)
  }
})

router.post('/scan/add', async (req, res, next) => {
  try {
    const { libraryId, dirs } = req.body
    if (!libraryId || !Array.isArray(dirs)) {
      return res.status(400).send({ error: 'libraryId 和 dirs 为必填项' })
    }
    const games = dirs.map(dir => ({
      name: dir,
      library_id: libraryId,
      sub_path: dir
    }))
    await db.knex('game').insert(games)
    res.send({ message: `成功添加 ${games.length} 个游戏` })
  } catch (err) {
    next(err)
  }
})

module.exports = router
```

- [ ] **步骤 3：手动测试扫描和游戏 API**

```bash
curl -X POST http://127.0.0.1:{port}/api/games/scan -H "Content-Type: application/json" -d "{\"libraryId\":1}"
```

预期：返回该库目录下的子目录列表。

- [ ] **步骤 4：Commit**

```bash
cd d:\work\game-lib
git add server/scanner.js server/routes/game.js
git commit -m "feat: add scanner and game CRUD API"
```

---

## 任务 6：设置 API + 封面服务

**文件：**
- 修改：`server/routes/setting.js`
- 修改：`server/routes/cover.js`
- 创建：`server/static/no-cover.png`

- [ ] **步骤 1：实现设置路由**

```javascript
// server/routes/setting.js
const express = require('express')
const router = express.Router()
const db = require('../database/db')

router.get('/', async (req, res, next) => {
  try {
    const settings = await db.getAllSettings()
    res.send(settings)
  } catch (err) {
    next(err)
  }
})

router.put('/', async (req, res, next) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await db.setSetting(key, String(value))
    }
    const settings = await db.getAllSettings()
    res.send(settings)
  } catch (err) {
    next(err)
  }
})

module.exports = router
```

- [ ] **步骤 2：实现封面路由**

```javascript
// server/routes/cover.js
const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const db = require('../database/db')

const COVERS_DIR = path.join(__dirname, '..', '..', 'data', 'covers')

if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true })
}

router.get('/:id', async (req, res) => {
  const game = await db.knex('game').where({ id: req.params.id }).first()
  if (!game || !game.cover_path) {
    return res.sendFile(path.join(__dirname, '..', 'static', 'no-cover.png'))
  }

  const coverPath = path.isAbsolute(game.cover_path)
    ? game.cover_path
    : path.join(COVERS_DIR, game.cover_path)

  if (fs.existsSync(coverPath)) {
    res.sendFile(coverPath)
  } else {
    res.sendFile(path.join(__dirname, '..', 'static', 'no-cover.png'))
  }
})

module.exports = router
```

- [ ] **步骤 3：创建默认封面占位图**

```bash
cd d:\work\game-lib
mkdir -p server\static
node -e "const fs=require('fs');const buf=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAEXRFWHRTb2Z0d2FyZQBTbmlwYXN0ZV0Xzt0AAAAJaVRYdENyZWF0aW9uIFRpbWUAAAAAADIwMjQwMjAyMTY0NDA0JiF3GQAAABxJREFUeJztwQEBAAAAgqD+r26cQAQAAAAAAAAAAAAAAIcN9CkAAAX9h1sAAAAASUVORK5CYII=','base64');fs.writeFileSync('server/static/no-cover.png',buf)"
```

- [ ] **步骤 4：Commit**

```bash
cd d:\work\game-lib
git add server/routes/setting.js server/routes/cover.js server/static/
git commit -m "feat: add settings API and cover serving"
```

---

## 任务 7：DLSite 爬虫

**文件：**
- 创建：`server/scraper/axios.js`
- 创建：`server/scraper/dlsite.js`

- [ ] **步骤 1：创建带重试的 HTTP 客户端**

```javascript
// server/scraper/axios.js
const axios = require('axios')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const retryGet = async (url, options = {}, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        ...options
      })
      return response
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(1000 * (i + 1))
    }
  }
}

module.exports = { retryGet }
```

- [ ] **步骤 2：创建 DLSite 爬虫**

```javascript
// server/scraper/dlsite.js
const cheerio = require('cheerio')
const { retryGet } = require('./axios')

const searchDLSite = async (keyword) => {
  const url = `https://www.dlsite.com/maniax/fsr/=/keyword/${encodeURIComponent(keyword)}/work_category%5B0%5D/%E5%90%8C%E4%BA%BA%E3%82%B2%E3%83%BC%E3%83%A0/order%5B%5D/trend`
  const response = await retryGet(url, {
    headers: { cookie: 'locale=zh-cn' }
  })
  const $ = cheerio.load(response.data)
  const results = []

  $('table.work_1col tr').each((_, el) => {
    const titleEl = $(el).find('.work_name a')
    const name = titleEl.text().trim()
    const href = titleEl.attr('href') || ''
    const rjMatch = href.match(/RJ(\d+)/)
    if (name && rjMatch) {
      const rjcode = rjMatch[1]
      const makerEl = $(el).find('.maker_name a')
      const makerName = makerEl.text().trim()
      results.push({ rjcode, name, makerName })
    }
  })

  return results
}

const fetchDLSiteDetail = async (rjcode) => {
  const url = `https://www.dlsite.com/maniax/work/=/product_id/RJ${rjcode}.html`
  const response = await retryGet(url, {
    headers: { cookie: 'locale=zh-cn' }
  })
  const $ = cheerio.load(response.data)

  const work = { id: rjcode, tags: [], genres: [], makers: [] }

  const title = $('meta[property="og:title"]').attr('content')
  work.title = title ? title.replace(/ \[.+\] \| DLsite$/, '') : ''

  const candidateStr = $('.work_slider_container .slider_item.active img-with-fallback').attr(':candidates')
  const imgList = candidateStr
    ? candidateStr.replace(/[['\\]\\s]/g, '').split(',').filter(Boolean)
    : []
  const fallbackImg = $("meta[itemprop='image']").attr('content') || ''
  let coverURL = ''
  if (imgList.length > 0) {
    coverURL = imgList[0].startsWith('//') ? `https:${imgList[0]}` : imgList[0]
  } else if (fallbackImg) {
    coverURL = fallbackImg.startsWith('//') ? `https:${fallbackImg}` : fallbackImg
  }
  work.coverURL = coverURL

  const circleEl = $('span[class="maker_name"]').children('a')
  const circleName = circleEl.text().trim()
  if (circleName) {
    work.makers.push(circleName)
  }

  $('th').each((_, el) => {
    const label = $(el).text().trim()
    if (label === '分类') {
      $(el).next('td').find('a').each((_, a) => {
        work.genres.push($(a).text().trim())
      })
    }
    if (label === '标签') {
      $(el).next('td').find('a').each((_, a) => {
        work.tags.push($(a).text().trim())
      })
    }
  })

  work.description = $('.work_parts_container .work_parts .work_text').text().trim()

  return work
}

module.exports = { searchDLSite, fetchDLSiteDetail }
```

- [ ] **步骤 3：手动测试爬虫**

```bash
cd d:\work\game-lib
node -e "const {searchDLSite} = require('./server/scraper/dlsite'); searchDLSite('RJ01386399').then(r => console.log(JSON.stringify(r, null, 2))).catch(e => console.error(e))"
```

预期：返回搜索结果数组。

- [ ] **步骤 4：Commit**

```bash
cd d:\work\game-lib
git add server/scraper/
git commit -m "feat: add DLSite scraper with search and detail fetch"
```

---

## 任务 8：采集 API

**文件：**
- 修改：`server/routes/scraper.js`

- [ ] **步骤 1：实现采集路由**

```javascript
// server/routes/scraper.js
const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const db = require('../database/db')
const { searchDLSite, fetchDLSiteDetail } = require('../scraper/dlsite')

const COVERS_DIR = path.join(__dirname, '..', '..', 'data', 'covers')

if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true })
}

router.post('/dlsite/search', async (req, res, next) => {
  try {
    const { keyword } = req.body
    if (!keyword) {
      return res.status(400).send({ error: 'keyword 为必填项' })
    }
    const results = await searchDLSite(keyword)
    res.send(results)
  } catch (err) {
    next(err)
  }
})

router.post('/dlsite/fetch', async (req, res, next) => {
  try {
    const { rjcode } = req.body
    if (!rjcode) {
      return res.status(400).send({ error: 'rjcode 为必填项' })
    }
    const detail = await fetchDLSiteDetail(rjcode)
    res.send(detail)
  } catch (err) {
    next(err)
  }
})

router.post('/dlsite/batch', async (req, res, next) => {
  try {
    const { games } = req.body
    if (!Array.isArray(games)) {
      return res.status(400).send({ error: 'games 为必填数组' })
    }
    const results = []
    for (const game of games) {
      try {
        const keyword = game.keyword || game.name
        const searchResults = await searchDLSite(keyword)
        if (searchResults.length > 0) {
          const detail = await fetchDLSiteDetail(searchResults[0].rjcode)
          results.push({ gameId: game.id, success: true, data: detail })
        } else {
          results.push({ gameId: game.id, success: false, error: '未找到结果' })
        }
      } catch (err) {
        results.push({ gameId: game.id, success: false, error: err.message })
      }
    }
    res.send(results)
  } catch (err) {
    next(err)
  }
})

router.post('/adopt', async (req, res, next) => {
  try {
    const {
      gameId, sourceType, sourceId, sourceUrl,
      name, coverUrl, makers, genres, tags, description
    } = req.body

    if (!gameId || !sourceType || !sourceId) {
      return res.status(400).send({ error: 'gameId, sourceType, sourceId 为必填项' })
    }

    let coverPath = null
    if (coverUrl) {
      try {
        const ext = coverUrl.match(/\.(jpg|jpeg|png|webp)/)?.[1] || 'jpg'
        const filename = `${sourceType}_${sourceId}.${ext}`
        const filePath = path.join(COVERS_DIR, filename)
        const response = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 15000 })
        fs.writeFileSync(filePath, response.data)
        coverPath = filename
      } catch (err) {
        console.error('封面下载失败:', err.message)
      }
    }

    await db.updateGame(gameId, { name, description, cover_path: coverPath })

    await db.insertGameSource({
      game_id: gameId,
      source_type: sourceType,
      source_id: sourceId,
      source_url: sourceUrl || null,
      raw_data: null
    })

    if (Array.isArray(makers) && makers.length > 0) {
      const makerIds = await db.insertMakers(makers)
      await db.syncGameMakers(gameId, makerIds)
    }

    if (Array.isArray(genres) && genres.length > 0) {
      const genreIds = await db.insertGenres(genres)
      await db.syncGameGenres(gameId, genreIds)
    }

    if (Array.isArray(tags) && tags.length > 0) {
      const tagIds = await db.insertTags(tags)
      await db.syncGameTags(gameId, tagIds)
    }

    const game = await db.getGameDetail(gameId)
    res.send(game)
  } catch (err) {
    next(err)
  }
})

module.exports = router
```

- [ ] **步骤 2：手动测试采集流程**

```bash
curl -X POST http://127.0.0.1:{port}/api/scraper/dlsite/search -H "Content-Type: application/json" -d "{\"keyword\":\"RJ01386399\"}"
```

预期：返回搜索结果。

- [ ] **步骤 3：Commit**

```bash
cd d:\work\game-lib
git add server/routes/scraper.js
git commit -m "feat: add scraper API with DLSite search, fetch, batch and adopt"
```

---

## 任务 9：前端主布局 + 路由

**文件：**
- 修改：`src/layouts/MainLayout.vue`
- 修改：`src/router/routes.ts`
- 创建：`src/composables/useApi.ts`
- 创建：`src/pages/GameLibPage.vue`（占位）
- 创建：`src/pages/GameDetailPage.vue`（占位）
- 创建：`src/pages/SettingPage.vue`（占位）

- [ ] **步骤 1：配置路由**

```typescript
// src/router/routes.ts
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'GameLib',
        component: () => import('pages/GameLibPage.vue')
      },
      {
        path: 'game/:id',
        name: 'GameDetail',
        component: () => import('pages/GameDetailPage.vue')
      },
      {
        path: 'settings',
        name: 'Setting',
        component: () => import('pages/SettingPage.vue')
      }
    ]
  }
]

export default routes
```

- [ ] **步骤 2：创建 useApi composable**

```typescript
// src/composables/useApi.ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const useApi = () => api

export default api
```

- [ ] **步骤 3：实现 MainLayout**

```vue
<!-- src/layouts/MainLayout.vue -->
<template>
  <q-layout view="hHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="leftDrawerOpen = !leftDrawerOpen" />
        <q-toolbar-title>Game Lib</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered>
      <q-list>
        <q-item clickable v-ripple to="/" exact>
          <q-item-section avatar>
            <q-icon name="videogame_asset" />
          </q-item-section>
          <q-item-section>Game Lib</q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/settings">
          <q-item-section avatar>
            <q-icon name="settings" />
          </q-item-section>
          <q-item-section>Setting</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const leftDrawerOpen = ref(false)
</script>
```

- [ ] **步骤 4：创建占位页面（3 个）**

```vue
<!-- src/pages/GameLibPage.vue -->
<template>
  <q-page>
    <div class="q-pa-md text-h6">Game Lib</div>
  </q-page>
</template>

<script setup lang="ts">
</script>
```

GameDetailPage.vue 和 SettingPage.vue 同理，替换文字。

- [ ] **步骤 5：验证布局和路由**

```bash
cd d:\work\game-lib
npx quasar dev -m electron
```

预期：左侧边栏显示 Game Lib / Setting，点击切换页面。

- [ ] **步骤 6：Commit**

```bash
cd d:\work\game-lib
git add src/layouts/ src/router/ src/composables/ src/pages/
git commit -m "feat: add main layout, routing and placeholder pages"
```

---

## 任务 10：设置页面

**文件：**
- 修改：`src/pages/SettingPage.vue`

- [ ] **步骤 1：实现设置页面**

```vue
<!-- src/pages/SettingPage.vue -->
<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">游戏库管理</div>

    <q-card v-for="lib in libraries" :key="lib.id" class="q-mb-sm">
      <q-card-section class="row items-center">
        <div class="col">
          <div class="text-subtitle1">{{ lib.name }}</div>
          <div class="text-caption text-grey">{{ lib.path }}</div>
        </div>
        <q-btn flat color="negative" icon="delete" @click="deleteLibrary(lib.id)" />
      </q-card-section>
    </q-card>

    <q-card class="q-mb-lg">
      <q-card-section>
        <div class="text-subtitle1 q-mb-sm">添加游戏库</div>
        <q-input v-model="newLib.name" label="库名称" dense class="q-mb-sm" />
        <q-input v-model="newLib.path" label="库路径" dense class="q-mb-sm" />
        <q-btn color="primary" label="添加" @click="addLibrary" :disable="!newLib.name || !newLib.path" />
      </q-card-section>
    </q-card>

    <div class="text-h5 q-mb-md">API Token</div>

    <q-card>
      <q-card-section>
        <q-input v-model="bangumiToken" label="Bangumi Token" type="password" dense class="q-mb-sm" />
        <q-btn color="primary" label="保存" @click="saveSettings" />
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../composables/useApi'

interface Library {
  id: number
  name: string
  path: string
}

const libraries = ref<Library[]>([])
const newLib = ref({ name: '', path: '' })
const bangumiToken = ref('')

const fetchLibraries = async () => {
  const res = await api.get('/libraries')
  libraries.value = res.data
}

const addLibrary = async () => {
  await api.post('/libraries', newLib.value)
  newLib.value = { name: '', path: '' }
  await fetchLibraries()
}

const deleteLibrary = async (id: number) => {
  await api.delete(`/libraries/${id}`)
  await fetchLibraries()
}

const fetchSettings = async () => {
  const res = await api.get('/settings')
  bangumiToken.value = res.data.bangumi_token || ''
}

const saveSettings = async () => {
  await api.put('/settings', { bangumi_token: bangumiToken.value })
}

onMounted(() => {
  fetchLibraries()
  fetchSettings()
})
</script>
```

- [ ] **步骤 2：验证设置页面**

```bash
npx quasar dev -m electron
```

预期：设置页可添加/删除游戏库，可保存 Bangumi Token。

- [ ] **步骤 3：Commit**

```bash
cd d:\work\game-lib
git add src/pages/SettingPage.vue
git commit -m "feat: add setting page with library management and token config"
```

---

## 任务 11：游戏库主页 + 卡片组件

**文件：**
- 创建：`src/components/GameCard.vue`
- 修改：`src/pages/GameLibPage.vue`
- 创建：`src/stores/game.ts`

- [ ] **步骤 1：创建 Pinia store**

```typescript
// src/stores/game.ts
import { defineStore } from 'pinia'
import api from '../composables/useApi'

interface Game {
  id: number
  name: string
  cover_path: string | null
  description: string | null
  library_id: number
  sub_path: string
  library_name: string
  library_path: string
  makers?: { id: number; name: string }[]
  genres?: { id: number; name: string }[]
  tags?: { id: number; name: string }[]
}

export const useGameStore = defineStore('game', {
  state: () => ({
    games: [] as Game[],
    page: 1,
    pageSize: 50,
    total: 0,
    keyword: '',
    stopLoad: false
  }),
  actions: {
    async fetchGames(reset = false) {
      if (reset) {
        this.games = []
        this.page = 1
        this.stopLoad = false
      }
      const res = await api.get('/games', {
        params: { page: this.page, pageSize: this.pageSize, keyword: this.keyword }
      })
      this.games = this.page === 1 ? res.data.games : this.games.concat(res.data.games)
      this.total = res.data.total
      this.page++
      if (this.games.length >= this.total) {
        this.stopLoad = true
      }
    },
    async deleteGame(id: number) {
      await api.delete(`/games/${id}`)
      this.games = this.games.filter(g => g.id !== id)
    }
  }
})
```

- [ ] **步骤 2：创建 GameCard 组件**

```vue
<!-- src/components/GameCard.vue -->
<template>
  <q-card class="game-card cursor-pointer" @click="$emit('click')">
    <q-img
      :src="`/api/cover/${game.id}`"
      :ratio="3/4"
      fit="cover"
      no-native-menu
    >
      <template v-slot:error>
        <div class="full-width full-height row items-center justify-center bg-grey-3">
          <q-icon name="videogame_asset" size="48px" color="grey-5" />
        </div>
      </template>
    </q-img>
    <q-card-section>
      <div class="text-subtitle2 ellipsis">{{ game.name }}</div>
      <div v-if="game.makers?.length" class="text-caption text-grey ellipsis">
        {{ game.makers.map(m => m.name).join(', ') }}
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
interface Game {
  id: number
  name: string
  cover_path: string | null
  makers?: { id: number; name: string }[]
}

defineProps<{ game: Game }>()
defineEmits<{ click: [] }>()
</script>

<style scoped>
.game-card {
  width: 180px;
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
```

- [ ] **步骤 3：实现 GameLibPage**

```vue
<!-- src/pages/GameLibPage.vue -->
<template>
  <q-page>
    <div class="q-pa-md">
      <div class="row q-mb-md items-center">
        <q-input
          v-model="searchKeyword"
          dense
          rounded
          outlined
          placeholder="搜索游戏..."
          debounce="500"
          class="col"
          @update:model-value="onSearch"
        >
          <template v-slot:append>
            <q-icon name="search" />
          </template>
        </q-input>
        <q-btn color="primary" label="扫描采集" class="q-ml-sm" @click="showScanner = true" />
      </div>

      <q-infinite-scroll @load="onLoad" :offset="250" :disable="gameStore.stopLoad">
        <div class="row q-col-gutter-md">
          <div v-for="game in gameStore.games" :key="game.id" class="col-auto">
            <GameCard :game="game" @click="goToDetail(game.id)" />
          </div>
        </div>
        <template v-slot:loading>
          <div class="row justify-center q-my-md">
            <q-spinner-dots color="primary" size="40px" />
          </div>
        </template>
        <div v-if="gameStore.stopLoad && gameStore.games.length > 0" class="q-mt-lg q-mb-xl text-h6 text-bold text-center">END</div>
      </q-infinite-scroll>

      <div v-if="gameStore.games.length === 0 && !gameStore.stopLoad" class="text-center q-mt-xl text-grey">
        <q-icon name="videogame_asset" size="64px" class="q-mb-md" />
        <div class="text-h6">暂无游戏</div>
        <div class="text-subtitle2">请先在设置中添加游戏库，然后扫描采集</div>
      </div>
    </div>

    <ScannerDialog v-model="showScanner" @done="onScanDone" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import GameCard from '../components/GameCard.vue'
import ScannerDialog from '../components/ScannerDialog.vue'

const router = useRouter()
const gameStore = useGameStore()
const searchKeyword = ref('')
const showScanner = ref(false)

const onLoad = async (_index: number, done: (stop: boolean) => void) => {
  await gameStore.fetchGames()
  done(gameStore.stopLoad)
}

const onSearch = () => {
  gameStore.keyword = searchKeyword.value
  gameStore.fetchGames(true)
}

const goToDetail = (id: number) => {
  router.push(`/game/${id}`)
}

const onScanDone = () => {
  gameStore.fetchGames(true)
}

onMounted(() => {
  gameStore.fetchGames(true)
})
</script>
```

- [ ] **步骤 4：验证游戏库主页**

```bash
npx quasar dev -m electron
```

预期：添加游戏库 → 扫描 → 卡片显示游戏列表。

- [ ] **步骤 5：Commit**

```bash
cd d:\work\game-lib
git add src/stores/ src/components/GameCard.vue src/pages/GameLibPage.vue
git commit -m "feat: add game lib page with card grid and infinite scroll"
```

---

## 任务 12：扫描采集弹窗

**文件：**
- 创建：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：实现 ScannerDialog**

```vue
<!-- src/components/ScannerDialog.vue -->
<template>
  <q-dialog v-model="modelValue" persistent maximized>
    <q-card>
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle1">扫描采集</div>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section class="q-pa-md">
        <div class="row q-mb-md items-center q-gutter-sm">
          <q-select
            v-model="selectedLibrary"
            :options="libraries"
            option-label="name"
            option-value="id"
            emit-value
            map-options
            label="选择游戏库"
            outlined
            dense
            style="min-width: 200px"
          />
          <q-btn color="primary" label="扫描目录" @click="scanDir" :disable="!selectedLibrary" />
          <q-btn color="secondary" label="一键采集" @click="batchScrape" :disable="scanResults.length === 0" />
        </div>

        <q-table
          :rows="scanResults"
          :columns="columns"
          row-key="name"
          flat
          bordered
          virtual-scroll
          :rows-per-page-options="[0]"
          style="max-height: 70vh"
        >
          <template v-slot:body-cell-dlsite="props">
            <q-td :props="props">
              <q-btn
                size="sm"
                color="primary"
                label="采集"
                @click="scrapeSingle(props.row)"
                :loading="props.row.loading"
                :disable="props.row.status === 'done'"
              />
            </q-td>
          </template>
          <template v-slot:body-cell-status="props">
            <q-td :props="props">
              <q-badge v-if="props.row.status === 'done'" color="positive">已采集</q-badge>
              <q-badge v-else-if="props.row.status === 'loading'" color="warning">采集中</q-badge>
              <q-badge v-else-if="props.row.status === 'error'" color="negative">失败</q-badge>
              <q-badge v-else color="grey">未采集</q-badge>
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import api from '../composables/useApi'

interface ScanRow {
  name: string
  status: 'pending' | 'loading' | 'done' | 'error'
  loading: boolean
  gameId?: number
}

const modelValue = defineModel<boolean>()
const emit = defineEmits<{ done: [] }>()

const libraries = ref<{ id: number; name: string; path: string }[]>([])
const selectedLibrary = ref<number | null>(null)
const scanResults = ref<ScanRow[]>([])

const columns = [
  { name: 'name', label: '游戏名', field: 'name', align: 'left' as const, sortable: true },
  { name: 'dlsite', label: 'DLSite', field: 'dlsite', align: 'center' as const },
  { name: 'status', label: '状态', field: 'status', align: 'center' as const }
]

const fetchLibraries = async () => {
  const res = await api.get('/libraries')
  libraries.value = res.data
}

const scanDir = async () => {
  if (!selectedLibrary.value) return
  const res = await api.post('/games/scan', { libraryId: selectedLibrary.value })
  const newDirs: string[] = res.data.newDirs
  if (newDirs.length === 0) {
    scanResults.value = []
    return
  }
  await api.post('/games/scan/add', {
    libraryId: selectedLibrary.value,
    dirs: newDirs
  })
  const gamesRes = await api.get('/games', { params: { pageSize: 9999 } })
  const addedGames = gamesRes.data.games.filter(
    (g: any) => g.library_id === selectedLibrary.value && newDirs.includes(g.sub_path)
  )
  scanResults.value = addedGames.map((g: any) => ({
    name: g.name,
    status: 'pending' as const,
    loading: false,
    gameId: g.id
  }))
}

const scrapeSingle = async (row: ScanRow) => {
  row.status = 'loading'
  row.loading = true
  try {
    const keyword = row.name.match(/RJ\d+/)?.[0] || row.name
    const searchRes = await api.post('/scraper/dlsite/search', { keyword })
    const results = searchRes.data
    if (results.length === 0) {
      row.status = 'error'
      return
    }
    const detailRes = await api.post('/scraper/dlsite/fetch', { rjcode: results[0].rjcode })
    const detail = detailRes.data
    await api.post('/scraper/adopt', {
      gameId: row.gameId,
      sourceType: 'dlsite',
      sourceId: results[0].rjcode,
      sourceUrl: `https://www.dlsite.com/maniax/work/=/product_id/RJ${results[0].rjcode}.html`,
      name: detail.title,
      coverUrl: detail.coverURL,
      makers: detail.makers,
      genres: detail.genres,
      tags: detail.tags,
      description: detail.description
    })
    row.status = 'done'
  } catch {
    row.status = 'error'
  } finally {
    row.loading = false
  }
}

const batchScrape = async () => {
  for (const row of scanResults.value) {
    if (row.status !== 'pending') continue
    await scrapeSingle(row)
  }
  emit('done')
}

watch(modelValue, (val) => {
  if (val) {
    fetchLibraries()
    scanResults.value = []
  }
})
</script>
```

- [ ] **步骤 2：验证扫描采集流程**

```bash
npx quasar dev -m electron
```

预期：设置页添加游戏库 → 主页点"扫描采集" → 选择库 → 扫描目录 → 逐个/一键采集。

- [ ] **步骤 3：Commit**

```bash
cd d:\work\game-lib
git add src/components/ScannerDialog.vue
git commit -m "feat: add scanner dialog with DLSite scraping"
```

---

## 任务 13：游戏详情页

**文件：**
- 修改：`src/pages/GameDetailPage.vue`

- [ ] **步骤 1：实现游戏详情页**

```vue
<!-- src/pages/GameDetailPage.vue -->
<template>
  <q-page class="q-pa-md">
    <q-btn flat icon="arrow_back" label="返回" @click="router.back()" class="q-mb-md" />

    <div v-if="game" class="row q-col-gutter-md">
      <div class="col-auto">
        <q-img
          :src="`/api/cover/${game.id}`"
          style="width: 300px; height: 400px"
          fit="cover"
        >
          <template v-slot:error>
            <div class="full-width full-height row items-center justify-center bg-grey-3">
              <q-icon name="videogame_asset" size="64px" color="grey-5" />
            </div>
          </template>
        </q-img>
      </div>

      <div class="col">
        <div class="text-h5 q-mb-sm">{{ game.name }}</div>

        <div v-if="game.makers?.length" class="q-mb-sm">
          <span class="text-grey">厂商:</span>
          <q-chip v-for="m in game.makers" :key="m.id" dense size="sm">{{ m.name }}</q-chip>
        </div>

        <div v-if="game.genres?.length" class="q-mb-sm">
          <span class="text-grey">类型:</span>
          <q-chip v-for="g in game.genres" :key="g.id" dense size="sm" color="blue" text-color="white">{{ g.name }}</q-chip>
        </div>

        <div v-if="game.tags?.length" class="q-mb-sm">
          <span class="text-grey">TAG:</span>
          <q-chip v-for="t in game.tags" :key="t.id" dense size="sm" color="teal" text-color="white">{{ t.name }}</q-chip>
        </div>

        <div v-if="game.description" class="q-mb-sm">
          <span class="text-grey">描述:</span>
          <div class="text-body2 q-mt-xs" style="white-space: pre-wrap">{{ game.description }}</div>
        </div>

        <q-separator class="q-my-md" />

        <div class="text-caption text-grey">
          安装路径: {{ game.library?.path }}\{{ game.sub_path }}
        </div>

        <div v-if="game.sources?.length" class="text-caption text-grey q-mt-xs">
          <span v-for="s in game.sources" :key="s.id" class="q-mr-md">
            {{ s.source_type }}: {{ s.source_id }}
            <a v-if="s.source_url" :href="s.source_url" target="_blank" class="text-blue">链接</a>
          </span>
        </div>
      </div>
    </div>

    <div v-else class="text-center text-grey q-mt-xl">
      <q-spinner-dots size="40px" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../composables/useApi'

const route = useRoute()
const router = useRouter()
const game = ref<any>(null)

onMounted(async () => {
  const res = await api.get(`/games/${route.params.id}`)
  game.value = res.data
})
</script>
```

- [ ] **步骤 2：验证详情页**

```bash
npx quasar dev -m electron
```

预期：点击游戏卡片 → 进入详情页，显示封面、名称、厂商、类型、TAG、描述、路径、来源。

- [ ] **步骤 3：Commit**

```bash
cd d:\work\game-lib
git add src/pages/GameDetailPage.vue
git commit -m "feat: add game detail page"
```

---

## 任务 14：端到端验证 + 收尾

- [ ] **步骤 1：完整流程验证**

1. 启动应用：`npx quasar dev -m electron`
2. 进入设置页 → 添加游戏库（指向一个有子目录的测试目录）
3. 回到主页 → 点击"扫描采集"
4. 选择游戏库 → 扫描目录 → 确认子目录被发现
5. 点击单个"采集"按钮 → 验证 DLSite 搜索和采集
6. 采纳结果 → 验证封面下载和信息保存
7. 点击游戏卡片 → 验证详情页显示

- [ ] **步骤 2：确保 .gitignore 完整**

```
data/
node_modules/
dist/
.quasar/
src-electron/Unpackaged/
```

- [ ] **步骤 3：最终 Commit**

```bash
cd d:\work\game-lib
git add -A
git commit -m "feat: complete game-lib MVP"
```