# Design: 存储爬取名称 (Scraped Name Storage)

**Date:** 2026-06-24
**Status:** Design approved

## 背景

目前 `game.name` 存的是扫描文件夹时的目录名，不一定是准确的官方名称。爬取（Adopt）时，从 DLsite/Bangumi/VNDB 拿到的官方名称虽然传入了 `adoptOne`，但被直接丢弃，没有存下来。这导致：

1. 后续重新搜索时只能用不准确的文件夹名去匹配，命中率低
2. 无法基于官方名称进行批量重命名
3. 存量数据丢失了爬取名字

## 目标

1. 在 `game_source` 表中存储每个来源的爬取名称
2. 后续搜索优先使用爬取名称
3. 前端用爬取名称替换文件夹名作为主显示
4. 存量数据批量回填爬取名称

## 设计

### 1. 数据库变更

`game_source` 表新增 `name` 列（`TEXT`）：

```sql
ALTER TABLE game_source ADD COLUMN name TEXT;
```

- 放在 `source_url` 之后，`raw_data` 之前
- 不设 NOT NULL，存量数据允许为空
- 迁移版本：v3

### 2. Adopt 写入

`adoptOne` 函数在写入 `game_source` 时带上 `name`：

```js
await d('game_source')
  .insert({
    game_id: gameId,
    source_type: sourceType,
    source_id: sourceId,
    source_url: sourceUrl || null,
    name: name || null,          // 新增
    raw_data: null,
  })
  .onConflict(['game_id', 'source_type', 'source_id'])
  .merge(['source_url', 'name', 'raw_data']);  // name 加入 merge
```

### 3. 搜索优先爬取名

ScrapeDialog / 批量搜索时，优先使用 `game_source.name`：

- 获取游戏已有的 `game_source` 记录
- 如果有 `name`，用它作为搜索关键词
- 如果没有，fallback 到文件夹名

### 4. UI 展示

- **有爬取名**：卡片/详情页主标题显示 `game_source.name`，文件夹名作为 tooltip 小字
- **无爬取名**：保持现有行为，显示文件夹名
- 多来源时取第一个有值的来源名称

### 5. 存量数据回填

编写一个脚本，遍历所有 `game_source` 记录，重新 fetch 详情并回填 `name`：

- 按 source_type 分组，调用对应的 fetch API
- 限制并发数，避免请求过快
- 跳过已有 name 的记录
- 错误处理：单个失败不影响其他继续

### 6. 影响范围

| 文件 | 变更 |
|------|------|
| `server/database/schema.js` | 新增 `name` 列 |
| `server/database/init.js` | 迁移 v3 |
| `server/routes/scraper.js` | `adoptOne` 写入 + merge name |
| `server/database/db.js` | `getGameDetail` 返回 sources 时包含 name |
| `src/components/ScrapeDialog.vue` | 搜索时优先用爬取名 |
| `src/components/ScannerDialog.vue` | 批量搜索时优先用爬取名 |
| `src/pages/GameLibPage.vue` | 卡片显示爬取名 |
| `src/pages/GameDetailPage.vue` | 详情页显示爬取名 |
| 新增脚本 | 存量数据回填 |

## 不做

- 不修改 `game.name`（文件夹名保留，作为备选）
- 不提供前端编辑爬取名（后续按需）
- 不自动重命名文件夹（后续按需）