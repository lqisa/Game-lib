# Batch Operations & Virtual Scroll 实现计划

## 任务 1: 后端 Batch Segments & Adopt API

**文件**: `server/routes/scraper.js`

**1a. `POST /scraper/dlsite/segments/batch`**
- 接收 `{ names: string[] }`
- 对每个 name 调用 `splitKeyword` 生成 `{ name, keyword, segments }`
- 返回 `{ results: [...] }`

**1b. `POST /scraper/adopt/batch`**
- 接收 `{ games: [...] }`，每个 game 包含 `{ gameId, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description }`
- 提取现有的 adopt 核心逻辑为 `adoptOne(game)` 函数
- 循环处理每个 game，用 try/catch 包裹，收集成功/失败结果
- 返回 `{ results: [{ gameId, success, error?, game? }, ...] }`

**验收**: 类型检查通过，单个 game 失败不影响其他 game

## 任务 2: 后端 Scrape Concurrency Setting

**文件**: `server/database/init.js`, `server/routes/setting.js`

**2a. init.js** — 添加默认值 `scrape_concurrency`: `4`

**2b. setting.js** — 确保 `GET/PUT /settings/scrape_concurrency` 正常工作（已有通用设置路由，检查是否自动覆盖）

**验收**: 类型检查通过，默认值为 4

## 任务 3: 前端 Virtual Scroll 菜单 + Batch APIs

**文件**: `src/components/ScannerDialog.vue`

**3a. 替换 q-table 为 q-virtual-scroll**
- 移除 `q-table` 和 `columns` 定义
- 使用 `q-virtual-scroll` 渲染自定义列表
- 每行：封面缩略图(40px) | 目录名 + 路径 | 匹配结果(名称/"Not found") | 状态 | 操作按钮
- 容器固定高度 `max-height: 70vh`

**3b. 替换为批量 API 调用**
- `loadUnscraped`: 收集所有 names → 一次 `POST /scraper/dlsite/segments/batch` → 设置 searchKeyword 和 segmentsCache
- `submitAdopted`: 收集所有 adoptedRows → 一次 `POST /scraper/adopt/batch` → 根据结果更新状态

**3c. 添加并发限制**
- `batchScrape` 中从 settings 读取 `scrape_concurrency`
- 按 chunk 并发处理

**验收**: 类型检查通过，列表渲染正常，批量请求正常

## 任务 4: 前端 SettingPage 添加并发设置

**文件**: `src/pages/SettingPage.vue`

- 添加 `q-input type="number" min="1" max="10"` 的并发数输入
- 绑定到 `scrapeConcurrency` 状态
- 加载时从 server 获取，变更时保存

**验收**: 类型检查通过，设置页显示并发数输入，可修改

## 任务顺序

1 → 2 → 3 → 4（后端先行，前端依赖后端）