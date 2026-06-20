# Game-Lib MVP 设计文档

## 概述

本地游戏管理桌面应用，MVP 实现游戏库管理 + DLSite 单源采集 + 基本浏览功能。

## 架构决策

- **方案：** Quasar Electron 模式，主进程内嵌 Express + SQLite
- **理由：** 纯本地桌面应用，用户双击打开即可使用，无需手动启动后端
- **通信：** 渲染进程通过 HTTP localhost 调用主进程内 Express API

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Quasar 2.x Electron 模式 |
| 前端 | Vue 3 + TypeScript + Pinia |
| 后端 | Express + Knex.js |
| 数据库 | SQLite3 |
| 爬虫 | cheerio + axios（从 kikoeru 改造） |

## 数据库设计

```sql
CREATE TABLE library (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  path        TEXT NOT NULL
);

CREATE TABLE maker (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE genre (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE tag (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE game (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  cover_path  TEXT,
  description TEXT,
  library_id  INTEGER NOT NULL,
  sub_path    TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (library_id) REFERENCES library(id) ON DELETE CASCADE
);

CREATE TABLE game_maker (
  game_id  INTEGER NOT NULL,
  maker_id INTEGER NOT NULL,
  PRIMARY KEY (game_id, maker_id),
  FOREIGN KEY (game_id) REFERENCES game(id) ON DELETE CASCADE,
  FOREIGN KEY (maker_id) REFERENCES maker(id) ON DELETE CASCADE
);

CREATE TABLE game_genre (
  game_id  INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (game_id, genre_id),
  FOREIGN KEY (game_id) REFERENCES game(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genre(id) ON DELETE CASCADE
);

CREATE TABLE game_tag (
  game_id INTEGER NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (game_id, tag_id),
  FOREIGN KEY (game_id) REFERENCES game(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
);

CREATE TABLE game_source (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  source_url  TEXT,
  raw_data    TEXT,
  UNIQUE(source_type, source_id),
  FOREIGN KEY (game_id) REFERENCES game(id) ON DELETE CASCADE
);

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

关键设计：
- 厂商/类型/TAG 与游戏均为 M2M 关系，通过中间表关联
- `game_source` 记录采集来源和外部 ID，为 Bangumi/VNDB 扩展预留
- `setting` 表存储 Token 等配置
- `library.path + game.sub_path = 游戏安装路径`

## 项目结构

```
game-lib/
├── src/                          # Quasar 前端
│   ├── pages/
│   │   ├── GameLibPage.vue
│   │   ├── GameDetailPage.vue
│   │   └── SettingPage.vue
│   ├── components/
│   │   ├── GameCard.vue
│   │   ├── ScannerDialog.vue
│   │   └── SearchResultDialog.vue
│   ├── composables/
│   │   └── useApi.ts
│   ├── stores/
│   │   └── game.ts
│   ├── layouts/
│   │   └── MainLayout.vue
│   └── router/
│       └── routes.ts
├── src-electron/
│   ├── main.js
│   └── preload.js
├── server/
│   ├── app.js
│   ├── routes/
│   │   ├── index.js
│   │   ├── library.js
│   │   ├── game.js
│   │   ├── scraper.js
│   │   └── setting.js
│   ├── database/
│   │   ├── db.js
│   │   ├── schema.js
│   │   └── init.js
│   ├── scraper/
│   │   ├── dlsite.js
│   │   └── axios.js
│   └── scanner.js
├── quasar.config.ts
└── package.json
```

## API 设计

### 游戏库

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/libraries` | 获取所有游戏库 |
| POST | `/api/libraries` | 新增游戏库 |
| PUT | `/api/libraries/:id` | 修改游戏库 |
| DELETE | `/api/libraries/:id` | 删除游戏库 |

### 游戏

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/games?page=&pageSize=50&keyword=` | 分页查询所有游戏 |
| GET | `/api/games/:id` | 游戏详情 |
| PUT | `/api/games/:id` | 修改游戏信息 |
| DELETE | `/api/games/:id` | 删除游戏 |
| POST | `/api/games/batch-delete` | 批量删除 |

### 目录扫描

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/scanner/scan` | 扫描游戏库目录 |
| POST | `/api/scanner/add` | 将扫描结果添加为游戏 |

### 采集

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/scraper/dlsite/search` | DLSite 关键字搜索 |
| POST | `/api/scraper/dlsite/fetch` | DLSite 采集详情 |
| POST | `/api/scraper/dlsite/batch` | 一键批量采集 |
| POST | `/api/scraper/adopt` | 采纳采集结果 |

### 设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取所有设置 |
| PUT | `/api/settings` | 更新设置 |

### 封面

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cover/:id` | 获取游戏封面 |

## 前端页面

### MainLayout
- 左侧边栏：Game Lib / Setting
- 顶栏：搜索框
- 主区域：内容区

### GameLibPage
- 展示所有库的游戏合集（无库切换器）
- 卡片流式布局，默认 50 条，滚动加载
- 卡片显示：封面 + 名称 + 厂商

### GameDetailPage
- 封面 + 游戏固有信息 + 安装路径 + 采集来源
- 重新采集 / 编辑按钮

### ScannerDialog
- 表格：游戏名 | DLSite 采集按钮 | 状态
- 一键采集按钮，并发控制

### SearchResultDialog
- 展示采集结果，采纳/取消

### SettingPage
- 游戏库管理（增删改）
- API Token 管理

## MVP 采集流程

```
添加游戏库 → 扫描目录 → 发现子目录 → 添加为游戏(无采集信息)
                                         ↓
                           点击"采集"按钮
                                         ↓
                           DLSite 关键字搜索 → 返回列表
                                         ↓
                           选择结果 → 采集详情 → 弹窗展示
                                         ↓
                           采纳 → 保存到数据库 + 下载封面
```

## MVP 范围

| 包含 | 不包含（后续迭代） |
|------|------------------|
| 游戏库增删改查 | Bangumi / VNDB 采集 |
| DLSite 单源采集 | 全局搜索弹窗 (Ctrl+Shift+F) |
| 目录扫描 + 添加游戏 | 批量修改路径 |
| 卡片浏览 + 分页加载 | 匹配算法自动采纳 |
| 采集结果二次确认弹窗 | |
| 设置页（Token + 游戏库管理）| |