# Game Lib - Agent 开发指南

## 平台信息

- **操作系统**: Windows
- **包管理器**: pnpm (v11+)
- **Node.js**: ESM (`"type": "module"`)
- **框架**: Quasar v2 + Vue 3 + TypeScript + Pinia
- **桌面端**: Electron
- **数据库**: SQLite3 (via knex)
- **构建工具**: Vite (via Quasar CLI)

## 命令行规则

### 绝对禁止使用的 Linux 命令

以下命令在 Windows 上**不存在**，禁止使用：

- `head` / `tail` / `less` / `more` / `cat` → 用 PowerShell 的 `Select-Object -First N` 或直接运行命令不过滤
- `grep` / `rg` / `sed` / `awk` → 用 Grep/SearchCodebase 工具，不要在命令行里调用
- `xargs` → 用 PowerShell 管道或 `ForEach-Object`
- `&&` 链接命令 → PowerShell 中 `&&` 可用 (PS 7+)，但优先拆分为独立命令
- `|` 管道 → PowerShell 管道可用，但注意语义差异
- `curl` → 用 PowerShell 的 `Invoke-WebRequest` 或直接用工具调用 API
- `rm -rf` → 用 PowerShell `Remove-Item -Recurse -Force`
- `chmod` / `chown` → Windows 无此概念
- `export` → 用 `$env:VAR = "value"`
- `source` / `.` → 用 `. ` 或直接运行脚本

### 正确的命令格式

```powershell
# 安装依赖
pnpm install

# 开发
pnpm dev              # Electron 全栈开发
pnpm dev:server       # 仅后端 (node --watch)
pnpm dev:frontend     # 仅前端

# 代码质量
pnpm lint             # 格式化 + lint 修复
pnpm lint:check       # 仅检查不修复
pnpm typecheck        # vue-tsc 类型检查

# 测试
pnpm test             # Node.js 内置测试运行器

# 构建
pnpm build            # Electron 生产构建
```

### 环境变量

```powershell
# PowerShell 方式
$env:GAME_LIB_DATA_DIR = "D:\work\game-lib\test-data"
$env:GAME_LIB_PROD = "1"

# 或使用 cross-env (已配置在 scripts 中)
cross-env VITE_API_PORT=19700 node server/dev.js
```

## 项目结构

```
d:\work\game-lib\
├── server/              # Express 后端 (ESM)
│   ├── app.js           # Express app + 中间件
│   ├── dev.js           # 开发服务器入口
│   ├── config.js        # 数据目录配置
│   ├── r18.js           # R18 检测逻辑
│   ├── similar.js       # 跨 vendor 相似度检测
│   ├── database/        # Knex + SQLite3
│   │   ├── db.js        # knex 实例 + 查询函数
│   │   ├── schema.js    # 表定义
│   │   └── init.js      # 迁移
│   ├── routes/          # API 路由
│   └── scraper/         # 各 vendor 爬虫
├── src/                 # Quasar/Vue 前端
│   ├── boot/            # Quasar boot 文件
│   ├── components/      # Vue 组件
│   ├── composables/     # Vue composables
│   ├── layouts/         # 布局
│   ├── pages/           # 页面
│   └── stores/          # Pinia stores
├── src-electron/        # Electron 主进程
├── test-data/           # 开发数据目录 (db.sqlite3 + covers/)
└── config/              # 端口等配置
```

## 数据目录

- **默认**: `test-data/` (项目根目录下)
- **PROD**: `%APPDATA%/Game Lib/` (通过 `GAME_LIB_PROD=1` 环境变量)
- **自定义**: `GAME_LIB_DATA_DIR` 环境变量
- 包含: `db.sqlite3` + `covers/` + `settings.json`

## 数据库导入约定

`server/database/db.js` 默认导出 `knex` 实例。其他文件导入时：

```javascript
// ✅ 正确
import { knex } from './database/db.js';
await knex('game').where(...)

// ✅ 命名空间导入也正确
import * as db from './database/db.js';
await db.knex('game').where(...)

// ❌ 错误 - db 不是函数
import * as db from './database/db.js';
await db('game').where(...)  // TypeError: db is not a function
```

## ESLint + TypeScript 规则

- `@typescript-eslint/consistent-type-imports`: 禁止 `import()` 类型注解，使用 `import type { X } from 'y'`
- `@typescript-eslint/no-unnecessary-type-assertion`: 禁止不必要的类型断言
- `@typescript-eslint/no-misused-promises`: `setTimeout` 等不接受 async 回调
- `@typescript-eslint/no-redundant-type-constituents`: 禁止冗余联合类型 (如 `any | T`)
- 隐式 `any` 参数必须显式标注类型

## 已知坑点

### nsfwjs WebGL 崩溃

nsfwjs 使用 TensorFlow.js 的 WebGL 后端。连续分类大量图片时，中间 tensor 不清理会导致 WebGL 资源泄漏 → context lost。

**必须**：
1. 每轮用 `tf.tidy()` 包裹，自动清理中间 tensor
2. 批次大小不超过 50（原 500 会导致 WebGL 崩溃）
3. 每张图之间节流 50ms
4. 有待分类数据时 2s 间隔连续跑，无数据时 60s 间隔轮询

```typescript
const tf = await import('@tensorflow/tfjs');
await tf.setBackend('webgl');
await tf.ready();
const tidy = tf.tidy.bind(tf);
// 每轮: tidy(() => { classify... })
```

性能：WebGL 单张 ~10-30ms，50 张一轮 ~1-3s，1428 张约 30 轮 × 3s ≈ **2 分钟**

### 数据库 `db is not a function`

见上文"数据库导入约定"。`r18.js` 和 `similar.js` 使用命名空间导入 `import * as db`，必须用 `db.knex('game')` 而非 `db('game')`。

## 关键端口

- 后端 API: `19700`
- 前端 dev: `9000`
- Electron debug: `5858`