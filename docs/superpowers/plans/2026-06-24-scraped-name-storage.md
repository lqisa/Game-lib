# 存储爬取名称 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 `game_source` 表存储爬取名称，搜索时优先使用，UI 用爬取名替换文件夹名作为主显示，存量数据批量回填。

**架构：** 在 `game_source` 表新增 `name` 列，Adopt 时写入，查询时返回，前端从 `sources` 数组中取第一个有值的 `name` 作为主显示名，无值时 fallback 到文件夹名。

**技术栈：** SQLite/Knex (迁移), Express (API), Vue 3 + Quasar (前端)

---

### 任务 1：数据库迁移 — 新增 `name` 列

**文件：**
- 修改：`server/database/schema.js:65-73`
- 修改：`server/database/init.js:148-157`

- [ ] **步骤 1：在 schema 中添加 `name` 列**

```js
// server/database/schema.js，在 source_url 后添加
.createTable('game_source', (table) => {
  table.increments();
  table.integer('game_id').notNullable();
  table.string('source_type').notNullable();
  table.string('source_id').notNullable();
  table.text('source_url');
  table.text('name');          // 新增
  table.text('raw_data');
  table.unique(['game_id', 'source_type', 'source_id']);
  table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
})
```

- [ ] **步骤 2：同步更新 `init.js` 中的 `TABLE_DDL`**

```js
// server/database/init.js，在 game_source 的 TABLE_DDL 中添加
game_source: (knex) =>
  knex.schema.createTable('game_source', (table) => {
    table.increments();
    table.integer('game_id').notNullable();
    table.string('source_type').notNullable();
    table.string('source_id').notNullable();
    table.text('source_url');
    table.text('name');          // 新增
    table.text('raw_data');
    table.unique(['game_id', 'source_type', 'source_id']);
    table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
  }),
```

- [ ] **步骤 3：添加迁移 v3**

在 `init.js` 的 `initDatabase` 函数末尾（v2 迁移之后）添加：

```js
// server/database/init.js，在 v2 迁移之后
const v3 = await knex('setting').where({ key: 'migration_v3' }).first();
if (!v3) {
  console.log(' * Running migration v3: add name column to game_source...');
  const hasName = await knex.raw("PRAGMA table_info('game_source')").then(
    (r) => r.some((col) => col.name === 'name')
  );
  if (!hasName) {
    await knex.raw('ALTER TABLE game_source ADD COLUMN name TEXT');
  }
  await knex('setting').insert({ key: 'migration_v3', value: '1' }).onConflict('key').ignore();
  console.log(' * Migration v3 done.');
}
```

- [ ] **步骤 4：运行 `npm run dev` 验证迁移**

```bash
npm run dev
```

预期：日志输出 `* Migration v3 done.`，无错误。

- [ ] **步骤 5：Commit**

---

### 任务 2：Adopt 时写入 `name`

**文件：**
- 修改：`server/routes/scraper.js:212-220`

- [ ] **步骤 1：修改 `adoptOne` 的 insert 和 merge**

将 `adoptOne` 中的 `game_source` insert 改为：

```js
await d('game_source')
  .insert({
    game_id: gameId,
    source_type: sourceType,
    source_id: sourceId,
    source_url: sourceUrl || null,
    name: name || null,
    raw_data: null,
  })
  .onConflict(['game_id', 'source_type', 'source_id'])
  .merge(['source_url', 'name', 'raw_data']);
```

- [ ] **步骤 2：运行 typecheck 验证**

```bash
npm run typecheck
```

- [ ] **步骤 3：Commit**

---

### 任务 3：`getGameDetail` 和 `getGames` 返回 `name`

**文件：**
- 修改：`server/database/db.js:46-48`

- [ ] **步骤 1：`getGameDetail` 的 sources 查询加上 `name`**

```js
// 将 select 改为包含 name
const sources = await db('game_source')
  .where('game_id', id)
  .select('id', 'source_type', 'source_id', 'source_url', 'name');
```

- [ ] **步骤 2：`getGames` 联表查询加上 `name`**

找到 `getGames` 中 `game_source` 的联表查询，在 select 中添加 `name`。需要先确认是否有联表查询。

```bash
# 先检查 getGames 中是否有 game_source 联表
grep -n "game_source" server/database/db.js
```

如果有联表，添加 `gs.name as source_name`；如果没有，后续在任务 7 中前端单独处理。

- [ ] **步骤 3：运行 typecheck**

```bash
npm run typecheck
```

- [ ] **步骤 4：Commit**

---

### 任务 4：`getGameDetail` 返回完整的 `game_source` 用于前端搜索

**文件：**
- 修改：`server/database/db.js:24-70`

- [ ] **步骤 1：确认 `getGameDetail` 已返回 sources 含 name**

已验证任务 3 中已修改。

- [ ] **步骤 2：新增 API 端点 `GET /games/:id/sources`**

在 `server/routes/game.js` 中添加：

```js
router.get('/:id/sources', async (req, res, next) => {
  try {
    const sources = await db.knex('game_source')
      .where('game_id', req.params.id)
      .select('id', 'source_type', 'source_id', 'source_url', 'name');
    res.send(sources);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 3：运行 typecheck**

```bash
npm run typecheck
```

- [ ] **步骤 4：Commit**

---

### 任务 5：ScrapeDialog 搜索时优先用爬取名

**文件：**
- 修改：`src/components/ScrapeDialog.vue`

- [ ] **步骤 1：添加 props 接收已有 sources**

```ts
// 在 props 中添加
sourceName: {
  type: String as PropType<string | null>,
  default: null,
},
```

- [ ] **步骤 2：修改 `onDialogShow` 优先使用爬取名**

```ts
const onDialogShow = async () => {
  results.value = [];
  selectedIdx.value = -1;
  detail.value = null;
  searched.value = false;

  // 优先使用爬取名
  const searchName = props.sourceName || props.gameName;
  const rawKeyword =
    props.defaultKeyword || searchName.match(/RJ\d+/)?.[0] || searchName;
  keyword.value = getCleanedName(rawKeyword);

  // ... 其余不变
};
```

- [ ] **步骤 3：ScannerDialog 传给 ScrapeDialog 时带上 `sourceName`**

在 `ScannerDialog.vue` 中，`ScrapeDialog` 组件调用处添加 prop：

```vue
<ScrapeDialog
  ...
  :source-name="scrapingRow?.sourceName ?? null"
/>
```

同时 `ScanRow` 接口中新增 `sourceName: string | null`。

- [ ] **步骤 4：运行 typecheck**

```bash
npm run typecheck
```

- [ ] **步骤 5：Commit**

---

### 任务 6：ScannerDialog 批量搜索时优先用爬取名

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：`loadUnscraped` 时获取已有 source name**

在 `loadUnscraped` 中，获取 unscraped 游戏后，查询每个游戏的 `game_source` 获取 name：

```ts
const loadUnscraped = async () => {
  // ... 现有逻辑 ...

  // 获取已有 source name 用于搜索
  const gameIds = scanResults.value.map((r) => r.gameId);
  if (gameIds.length > 0) {
    const sourcesRes = await api.get('/games/sources/batch', { params: { ids: gameIds.join(',') } });
    const sourceMap = new Map<string, string | null>();
    for (const s of sourcesRes.data || []) {
      // 每个 game 取第一个有 name 的 source
      if (!sourceMap.has(String(s.game_id)) && s.name) {
        sourceMap.set(String(s.game_id), s.name);
      }
    }
    for (const row of scanResults.value) {
      const sourceName = sourceMap.get(String(row.gameId)) || null;
      row.sourceName = sourceName;
      if (sourceName) {
        const { keyword } = splitKeyword(sourceName);
        row.searchKeyword = keyword;
      }
    }
  }
  // ... 其余不变 ...
};
```

- [ ] **步骤 2：`ScanRow` 接口添加 `sourceName`**

```ts
interface ScanRow {
  // ... 现有字段 ...
  sourceName: string | null;
}
```

- [ ] **步骤 3：新增 API 端点 `GET /games/sources/batch`**

在 `server/routes/game.js` 添加：

```js
router.get('/sources/batch', async (req, res, next) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.send([]);
    const sources = await db.knex('game_source')
      .whereIn('game_id', ids)
      .select('game_id', 'name')
      .orderBy('id');
    res.send(sources);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 4：运行 typecheck**

```bash
npm run typecheck
```

- [ ] **步骤 5：Commit**

---

### 任务 7：GameCard 显示爬取名

**文件：**
- 修改：`src/components/GameCard.vue`

- [ ] **步骤 1：扩展 Game 接口添加 `sourceName`**

```ts
interface Game {
  id: number;
  name: string;
  cover_path: string | null;
  library_name: string;
  library_path: string;
  sub_path: string;
  sourceName?: string | null;
}
```

- [ ] **步骤 2：卡片名称显示爬取名，文件夹名作为 tooltip**

```vue
<template>
  <div class="game-cover__title">
    <div class="text-subtitle2 ellipsis game-cover__name">
      {{ game.sourceName || game.name }}
      <q-tooltip v-if="game.sourceName" anchor="bottom middle" self="top middle">
        {{ game.name }}
      </q-tooltip>
    </div>
  </div>
</template>
```

- [ ] **步骤 3：`getGames` API 返回时附加 `sourceName`**

在 `server/database/db.js` 的 `getGames` 中，联表查询或后处理添加 `sourceName`：

```js
// 在 getGames 返回前，为每个 game 附加 sourceName
const gameIds = games.map((g) => g.id);
if (gameIds.length > 0) {
  const sources = await db('game_source')
    .whereIn('game_id', gameIds)
    .select('game_id', 'name')
    .whereNotNull('name')
    .orderBy('id');
  const sourceMap = {};
  for (const s of sources) {
    if (!sourceMap[s.game_id]) sourceMap[s.game_id] = s.name;
  }
  for (const g of games) {
    g.sourceName = sourceMap[g.id] || null;
  }
}
```

- [ ] **步骤 4：运行 typecheck**

```bash
npm run typecheck
```

- [ ] **步骤 5：Commit**

---

### 任务 8：GameDetailPage 详情页显示爬取名

**文件：**
- 修改：`src/pages/GameDetailPage.vue`

- [ ] **步骤 1：获取 sources 中的 name**

从 `getGameDetail` 返回的 `sources` 数组中取第一个有 `name` 的：

```ts
const displayName = computed(() => {
  const source = game.value?.sources?.find((s) => s.name);
  return source?.name || game.value?.name || '';
});
```

- [ ] **步骤 2：模板中用 `displayName` 替换 `game.name`**

```vue
<!-- 主标题改为 displayName，文件夹名作为副标题 -->
<div class="text-h5">{{ displayName }}</div>
<div v-if="displayName !== game.name" class="text-caption text-grey">
  <q-icon name="folder" size="xs" class="q-mr-xs" />
  {{ game.name }}
</div>
```

- [ ] **步骤 3：运行 typecheck**

```bash
npm run typecheck
```

- [ ] **步骤 4：Commit**

---

### 任务 9：存量数据回填脚本

**文件：**
- 创建：`server/scripts/backfill-source-names.js`

- [ ] **步骤 1：创建回填脚本**

```js
// server/scripts/backfill-source-names.js
import { knex } from '../database/db.js';
import { fetchDLSiteDetail } from '../scraper/dlsite.js';
import { fetchBangumiDetail } from '../scraper/bangumi.js';
import { fetchVNDBDetail } from '../scraper/vndb.js';

const CONCURRENCY = 3;

const pLimit = (concurrency) => {
  let running = 0;
  const queue = [];
  const next = () => {
    if (queue.length === 0 || running >= concurrency) return;
    running++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        running--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

const main = async () => {
  const sources = await knex('game_source')
    .whereNull('name')
    .select('id', 'source_type', 'source_id');

  console.log(`Found ${sources.length} sources without name`);

  if (sources.length === 0) {
    console.log('Nothing to backfill.');
    await knex.destroy();
    return;
  }

  const limit = pLimit(CONCURRENCY);
  let done = 0;
  let errors = 0;

  await Promise.all(
    sources.map((s) =>
      limit(async () => {
        try {
          let name = null;
          if (s.source_type === 'dlsite') {
            const detail = await fetchDLSiteDetail(s.source_id);
            name = detail?.title || null;
          } else if (s.source_type === 'bangumi') {
            const detail = await fetchBangumiDetail(s.source_id, '');
            name = detail?.title || null;
          } else if (s.source_type === 'vndb') {
            const detail = await fetchVNDBDetail(s.source_id);
            name = detail?.title || null;
          }
          if (name) {
            await knex('game_source').where({ id: s.id }).update({ name });
          }
          done++;
          if (done % 10 === 0) console.log(`Progress: ${done}/${sources.length}`);
        } catch (err) {
          errors++;
          console.error(`Failed for ${s.source_type}:${s.source_id}: ${err.message}`);
        }
      }),
    ),
  );

  console.log(`Done. ${done} updated, ${errors} errors.`);
  await knex.destroy();
};

main().catch((err) => {
  console.error(err);
  knex.destroy().then(() => process.exit(1));
});
```

- [ ] **步骤 2：运行脚本**

```bash
node server/scripts/backfill-source-names.js
```

- [ ] **步骤 3：验证回填结果**

```bash
# 检查还有多少没有 name 的 source
npx knex query "SELECT COUNT(*) FROM game_source WHERE name IS NULL" --client sqlite3 --connection data/db.sqlite3
```

- [ ] **步骤 4：Commit**

---

### 任务 10：类型检查与最终验证

- [ ] **步骤 1：运行完整 typecheck**

```bash
npm run typecheck
```

- [ ] **步骤 2：手动测试**

1. 启动 dev server
2. 打开 Scan & Scrape，扫描新库
3. 确认 Adopt 后数据库中有 `name`
4. 确认卡片显示爬取名
5. 确认详情页显示爬取名
6. 再次扫描，确认搜索时用了爬取名

- [ ] **步骤 3：Commit**

---