# Game Lib - Agent 开发指南

## 平台信息

- **操作系统**: Windows
- **包管理器**: pnpm (v12+，`packageManager` 字段已锁定)
- **Node.js**: ESM (`"type": "module"`)
- **框架**: Vue 3 + TypeScript + Pinia + shadcn-vue (Reka UI) + Tailwind CSS v4
  - **已完全移除 Quasar**：禁止使用任何 `q-*` 组件、`useQuasar`、`$q.*`、`--m3-*` 变量
- **桌面端**: Electron
- **数据库**: SQLite3 (via knex)
- **构建工具**: electron-vite + electron-builder

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
pnpm dev              # Electron 全栈开发 (electron-vite dev --watch，主进程/preload 改动自动重建+重启)
pnpm dev:server       # 仅后端 (node --watch)
pnpm dev:frontend     # 仅前端 Vite dev (代理 /api + /covers 到 19700)

# 独立部署 (无 Electron，可供局域网多设备浏览器访问)
pnpm standalone       # 默认 0.0.0.0:19770，服务 API + out/renderer 的 SPA

# 代码质量
pnpm lint             # 格式化 + lint 修复
pnpm lint:check       # 仅检查不修复
pnpm typecheck        # vue-tsc 类型检查

# 测试
pnpm test             # Node.js 内置测试运行器 (server/__tests__)

# 构建
pnpm build            # electron-vite build + 打包后端 + electron-builder --dir
                      # 产物: release/win-unpacked
```

### 环境变量

```powershell
# PowerShell 方式
$env:GAME_LIB_DATA_DIR = "D:\work\game-lib\test-data"
$env:GAME_LIB_PROD = "1"

# standalone 部署
$env:GAME_LIB_HOST = "0.0.0.0"   # 监听地址
$env:GAME_LIB_PORT = "19770"     # 监听端口 (回退 $PORT)
$env:GAME_LIB_FRONTEND_DIR = "E:\path\to\out\renderer"  # 自定义 SPA 目录
```

## 项目结构

```
E:\work\game-lib\
├── server/              # Express 后端 (ESM) — 可独立运行
│   ├── app.js           # Express app + 中间件 (可挂载 SPA)
│   ├── dev.js           # 开发服务器入口
│   ├── standalone.js    # 独立部署入口 (0.0.0.0:19770，服务 SPA)
│   ├── ports.js         # 端口常量 + GAME_LIB_PORT/GAME_LIB_HOST 解析
│   ├── port-policy.js   # EADDRINUSE 重试策略 (dev 固定端口报错)
│   ├── config.js        # 数据目录配置
│   ├── r18.js           # R18 检测逻辑
│   ├── similar.js       # 跨 vendor 相似度检测
│   ├── database/        # Knex + SQLite3
│   │   ├── db.js        # knex 实例 + 查询函数
│   │   ├── schema.js    # 表定义
│   │   └── init.js      # 迁移
│   ├── routes/          # API 路由
│   └── scraper/         # 各 vendor 爬虫
├── src/                 # 前端 SPA (Vue 3 + shadcn-vue + Tailwind v4)
│   ├── components/      # 业务组件
│   │   └── ui/          # shadcn-vue 复制进来的原语 (CLI 管理，勿手改，见下)
│   ├── composables/     # useApi / useTheme / useConfirm / useExpressUrl …
│   ├── css/app.css      # Tailwind v4 入口 + 设计 token
│   ├── layouts/         # MainLayout (自绘侧栏 + 顶栏)
│   ├── pages/           # 页面
│   └── stores/          # Pinia stores
├── src-electron/        # Electron 主进程 + preload
│   └── electron-assets/ # 图标等运行时资源 (打包时映射到 asar 内 electron-assets)
├── config/              # vite.renderer.ts (前端共享 Vite 配置) / ports.ts
├── scripts/             # prepare-packaged-server.mjs (打包后端 payload)
├── test-data/           # 开发数据目录 (db.sqlite3 + covers/)
├── electron.vite.config.ts / vite.config.ts / electron-builder.yml
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

## UI 约定 (shadcn-vue)

- **图标**: `import { Loader2 } from '@lucide/vue'`（注意不是 `lucide-vue-next`）
- **类名合并**: `import { cn } from 'cn'`
- **Toast**: `import { toast } from 'vue-sonner'`；`toast.success / error / warning / info`
- **确认框**: `import { confirm } from '@/composables/useConfirm'` →
  `const ok = await confirm({ title, message, okLabel, destructive })`（全局 ConfirmDialog 已挂载）
- **主题**: `import { useTheme } from '@/composables/useTheme'`（`isDark` / `setMode` / `toggle`）；
  存储键 `game-lib-theme`，`<html>` 上的 `.dark` 类为唯一事实来源
- **桌面能力**: 一律 `window.electronAPI?.…` 可选链；纯浏览器下退化为隐藏/提示
- **颜色/密度**: 只用 token (`bg-card` / `text-muted-foreground` / `border-border` /
  `text-success` …)，表单控件高 `h-8` + `text-[13px]`，图标按钮 `size="icon-sm"`
- **`src/components/ui/**` 是 vendored 代码**: 由 CLI 生成/刷新，禁止手改；
  新增原语用 `pnpm dlx shadcn-vue@latest add -y -o <name>`（已在 eslint/prettier 忽略）

### 虚拟滚动

- `src/components/VirtualGrid.vue`: 网格虚拟滚动 (游戏列表用)
- `src/components/VirtualList.vue`: 单列固定行高虚拟滚动（扫描对话框用）

## 构建 / 打包约定

- `pnpm build` = `electron-vite build` → `scripts/prepare-packaged-server.mjs` → `electron-builder --dir`
- 产物布局: 应用 (main/preload/renderer) 在 `app.asar` 内（~2MB，**不含** node_modules）；
  Express 后端 + 其 node_modules 在 asar 外的 `resources/server`（由 `.packaging/server`
  复制，依赖扁平化 + 去掉无用文件 + 混淆）
- **node_modules 的搬运是显式的**（两个 electron-builder 钩子，缺一不可）：
  - `scripts/before-build.js`（`beforeBuild` 返回 `false`）= node_modules 由外部处理 →
    跳过原生依赖重建，且不把生产 node_modules 打进 `app.asar`（app bundle 由 electron-vite
    完整打包，运行时一个 npm 依赖都不需要）
  - `scripts/after-pack.js`（`afterPack`）把 `.packaging/server/node_modules` 直接拷进
    `resources/server/node_modules`——extraResources 的拷贝会**无条件丢弃拷贝源的根级
    `node_modules`**（`app-builder-lib/out/util/filter.js` 的 "filter the root
    node_modules"），走 extraResources 会静默丢失后端依赖
- 验证打包版必须**拷到仓库外**运行（如 `E:\work\prodcopy`）：Node 会沿父目录向上找
  node_modules，留在仓库内启动会"借用" dev 仓库的依赖，掩盖打包缺失
- 主进程运行时通过 `process.resourcesPath/server` 加载后端；开发时用仓库内 `server/`
- 所有前端 API URL 同源（`useExpressUrl.ts`）：dev 由 Vite 代理，生产由 Express 直接服务 SPA
- 路由使用 hash history，任何部署路径/端口都能直接工作
- 打包版以 prod 端口 `19770` 自服务 SPA；`server/standalone.js` 亦同（局域网多设备访问入口，无鉴权，仅限可信网络）

## ESLint + TypeScript 规则

- `@typescript-eslint/consistent-type-imports`: 禁止 `import()` 类型注解，使用 `import type { X } from 'y'`
- `@typescript-eslint/no-unnecessary-type-assertion`: 禁止不必要的类型断言
- `@typescript-eslint/no-misused-promises`: `setTimeout` 等不接受 async 回调
- `@typescript-eslint/no-redundant-type-constituents`: 禁止冗余联合类型 (如 `any | T`)
- 隐式 `any` 参数必须显式标注类型
- `.mjs` 脚本是纯 JS，不能写 TS 语法（`allowJs` 开启后会被检查）

## 已知坑点

### NSFW 分类（服务端 worker + wasm 后端）

R18 分类现在跑在**后端**：`server/nsfw-classifier.js`（轮询调度）+ `server/nsfw-worker.js`
（`worker_threads` 内推理，`@tensorflow/tfjs-backend-wasm` + `tf.setBackend('wasm')`，
MobileNetV2 模型）。渲染进程不再加载 tfjs，旧的 WebGL 崩溃坑已随迁移消除。

**必须**：

1. 每张图的 tensor 变换用 `tf.tidy()` 包裹，避免内存泄漏
2. 批次 `BATCH_SIZE = 50`（原 500 会爆内存）
3. 每张图之间节流 30ms
4. 有待分类数据时 2s 间隔连续跑，无数据时 60s 间隔轮询

### 数据库 `db is not a function`

见上文"数据库导入约定"。`r18.js` 和 `similar.js` 使用命名空间导入 `import * as db`，必须用 `db.knex('game')` 而非 `db('game')`。

### 测试

`pnpm test` 应为 333/334 通过；`server/__tests__/snapshot-api.test.js` 的一个用例依赖本机
环境（sevenzip-zstd 工具探测），在部分机器上失败属已知情况。

### electron-vite 主进程 watch 需要 --watch

electron-vite 6 的 `dev` **默认不监听**主进程/preload（`cli.js`: `options.w || options.watch ?
{ watch: {} } : null`）。`package.json` 的 `dev` 脚本必须带 `--watch`，否则改 `src-electron/**`
后不重建、不重启（渲染端 HMR 不受影响，容易误判为正常）。已配置：`electron-vite dev --watch`。

### dev 服务器重启挂死 & SSE 僵尸连接

- dev 下 `src-electron/electron-main.ts` 监听 `server/` 变化并 `restartServer()`；
  **重启前必须 `server.closeAllConnections()`**：`server.close()` 只停止接受新连接、等所有已建
  socket 结束，而渲染进程的 SSE 是永不结束的长连接 → 重启永久挂死且无日志。
- dev 下 renderer 的 SSE 走 Vite 代理：后端强断上游时**代理不把关闭传给客户端**（EventSource 保持
  OPEN、不触发 `onerror` = 僵尸连接）。对策：服务端每 15s 发 `data: {"type":"ping"}` 真实消息
  （`server/routes/task.js`）+ `src/stores/taskStore.ts` 40s 无活动看门狗强制重连（每 10s 检查）。
  prod/standalone 无代理，靠 `onerror` + 3s 重连即可。
- 由 Electron 宿主启动的服务器会设置 `SSE_TOKEN`，此时非 Electron 渲染进程（如浏览器直开
  `/api/tasks/events`）会 401 `Token mismatch`，属设计行为；standalone 不设置该变量、不校验。

### E 盘目录树 Low 完整性标签 → Electron 启动即崩

现象：Electron 在 E 盘物理位置的目录树内启动即崩且无 JS 日志（退出码 int3 `0x80000003` /
ud2 `C000001D`）；C/D/Q 盘或 junction 到 C 盘的同一目录均正常。

根因（已验证）：目录树带 **Low Mandatory Level** 完整性标签 → 进程以低完整性运行（RID=0x1000）→
Chromium sandbox `CreateWindowStationW` 失败（`SBOX_ERROR_CANNOT_CREATE_WINSTATION (12)`，
err=5）→ `CHECK` trap。

修复（管理员 PowerShell）：

```powershell
icacls "E:\work\game-lib" /setintegritylevel M /T /C /Q
icacls "E:\work\game-lib" /setintegritylevel "(OI)(CI)M"
```

验证 root 与 `.pnpm\electron…\dist\electron.exe` 显示 "Medium Mandatory Level"。若目录树再次从
备份/同步源整体复制可能复发，重跑即可。

## 关键端口

- 后端 API：dev `19700` ｜ test `19701` ｜ 打包版 (prod) `19770`（`server/ports.js` 三档刻意分离，dev 与打包版可并存）
- 前端 dev: `9000`（Vite 代理 `/api` + `/covers` → 127.0.0.1:19700）
- 独立部署 (standalone): `19770`（`GAME_LIB_PORT` / `$PORT` 可覆盖；与打包版同端口，不同时运行）
- Electron debug (dev-only CDP): `5858`
