# 会话总结：Quasar → shadcn-vue 迁移 + 后端独立部署 + Electron E 盘崩溃修复

> 日期：2026-10-17 ~ 10-18 · 分支：`feat/shadcn-migration`
> 状态：✅ 全部完成——DEV/PROD 双端验收通过，全部改动随本文件一并提交
> 仓库：`E:\work\game-lib`（Electron + Vue 3 + Node/Express + SQLite 游戏库管理）

---

## 1. 任务目标（用户原始需求）

1. **彻底移除 Quasar**：不允许共存，UI 全部迁到 shadcn-vue，自研组件保留。
2. **保持三端架构**：Electron 主进程 + Node 后端（Express）+ 前端 SPA，继续用 electron-vite 构建。
3. **后端可独立部署**：架构愿景"Electron 只是浏览的一种方式，本质是后端 NODE + 前端前后端分离"，后端要能独立运行，多设备（局域网）查看管理。
4. **不要 React、不要 Material 风格 UI**。
5. **DEV 和 PROD 双验收**。
6. 用户接受 2~4 周量级的迁移成本，换取零框架耦合。

---

## 2. 关键决策

| 领域          | 决策                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI 体系       | shadcn-vue（Reka UI + Tailwind CSS v4 + `cn` + `@lucide/vue` 图标），Tailwind v4 作为唯一全局 reset                                                                                   |
| 构建          | electron-vite 6：main `out/main/index.mjs`（ESM）、preload CJS、renderer `out/renderer`；electron-builder 26                                                                          |
| `pnpm build`  | = electron-vite build → `scripts/prepare-packaged-server.mjs` → electron-builder --dir → `release/win-unpacked`                                                                       |
| Renderer 配置 | 抽到 `config/vite.renderer.ts`（port 9000、代理 `/api` + `/covers` → 127.0.0.1:19700），hash router                                                                                   |
| 端口          | dev 19700 / test 19701 / prod+standalone 19770，三档刻意分离，dev 与打包版可并存                                                                                                      |
| API URL       | 保持相对同源（`useExpressUrl.ts`）：dev 走 Vite 代理，生产由 Express 直接服务 SPA                                                                                                     |
| SSE Token     | `SSE_TOKEN` 仅由 Electron 宿主设置；非 Electron 客户端直连 SSE 会 401 `Token mismatch`（设计行为）；standalone 不设置、不校验                                                         |
| 迁移约定      | Sonner toast、`useConfirm()` Promise API、`useTheme()`（键 `game-lib-theme`、`.dark` 类为唯一事实来源）、紧凑尺寸（控件 h-8 / text-[13px]）、`GameContextMenu.vue`、`VirtualList.vue` |
| dev 脚本      | `electron-vite dev --watch`（v6 默认不监听主进程，必须显式开启，否则改 `src-electron/**` 不重建不重启）                                                                               |

---

## 3. 已完成的工作（验收全绿）

### Phase A — 后端独立化

- `server/standalone.js`：独立入口，默认 `0.0.0.0:19770`，服务 API + `out/renderer` 的 SPA（`GAME_LIB_PORT`/`$PORT`/`GAME_LIB_FRONTEND_DIR` 可覆盖）。
- `server/app.js` 支持挂载 SPA；`server/dev.js`、`server/ports.js`、`server/port-policy.js`（EADDRINUSE 重试策略）改造完成。
- 前端 `useExpressUrl.ts` 全部同源 URL：dev 走 Vite 代理，生产由 Express 直接服务 SPA；hash 路由保证任意部署路径可用。

### Phase B — 构建体系切换

- 删除 `quasar.config.ts`、`postcss.config.js`；新增 `electron.vite.config.ts`、`vite.config.ts`、`config/vite.renderer.ts`、`electron-builder.yml`。
- `electron-builder.yml`：应用打 `app.asar`；后端 + 其 node_modules 放 asar 外的 `resources/server`（`.packaging/server` 复制、依赖扁平化、去无用文件、混淆）。
- `.github/workflows/release.yml`、README、AGENTS.md 已更新。
- Electron 二进制曾被误删，已从 `%LOCALAPPDATA%\electron\Cache` 缓存 zip 手工恢复（+ `path.txt`）。

### Phase C — UI 全量迁移

- 全部页面迁移完成：`GameLibPage`、`GameDetailPage`、`RecentlyPage`、`SettingPage`、`ErrorNotFound`。
- 组件：`FilterDialog`、`ScrapeDialog`、`ScannerDialog`、`TaskPanel`、`GameCard`、`MainLayout`（自绘侧栏 + 顶栏）。
- 新增：`ConfirmDialog.vue`（全局挂载）、`GameContextMenu.vue`、`VirtualList.vue`、`useConfirm.ts`、`useTheme.ts`、`src/main.ts`、`src/components/ui/`（CLI 管理的 vendored 原语）。
- 删除：`src/boot/*`、`src/stores/index.ts`、`example-store.ts`、旧 `ContextMenu.vue`。
- GameDetailPage 工具栏 9 个图标按钮补 `aria-label`。

### 运行时验证（DEV）

- GameContextMenu：打开 / 菜单项 / Escape 关闭 ✓
- Toast “Tools re-detected”（sonner 4s 自动消失，用页面内异步轮询捕获）✓
- ScannerDialog：结构 + 真实扫描（发现 1 个未刮削的 神様のゲーム；Pending 行带 Reselect/Scrape 按钮）✓
- TaskPanel SSE 端到端：浏览器触发 “Backup Now” → Electron 面板实时 “Backing up data” → “Backup completed: game-lib-data-backup-2026-10-17-17-08-18.rar (9.2 MB)” ✓

### 运行时验证（PROD）

- `pnpm build` 成功：`release\win-unpacked\Game Lib.exe`（223.5MB）+ `resources\server` + `app.asar`。
- 打包版启动：窗口 “Game Lib” + API 200（19770）+ SPA 200 ✓（初次“失败”实为探测端口写错）。
- `server/standalone.js`：`GAME_LIB_HOST=0.0.0.0` 监听 19770，API + SPA 经 127.0.0.1 与局域网 IP（`192.168.123.166:19770`）均 200 ✓（日志自带无鉴权警告，仅限可信网络）。

### 质量门

- `pnpm typecheck` exit 0；`pnpm lint:check` exit 0；`pnpm test` 333/334（唯一失败为 `snapshot-api.test.js` 的 sevenzip-zstd 工具探测，环境相关，已知）。

---

## 4. E 盘崩溃：根因与修复（已解决）

### 现象

- `pnpm dev` 时 Electron（v42.11.15，Chromium 148.0.7778.280）在 E 盘物理位置启动即崩，无 JS 日志。
- 退出码：无调试器时 int3 `0x80000003`；procdump 捕获 ud2 `C000001D`。

### 根因（已验证）

- 崩溃链：`Sandbox::Initialize → CreateAlternateDesktop(kAlternateWinstation)` 失败 → `CHECK(result == SBOX_ALL_OK)` 触发 trap；RAX = `0xC (12)` = `SBOX_ERROR_CANNOT_CREATE_WINSTATION`。
- 真正原因：**`E:\work\game-lib` 整个目录树带 Low Mandatory Level 完整性标签** → 进程以低完整性运行（RID=0x1000）→ `CreateWindowStationW` 失败（err=5）。
- 佐证：崩溃地址符号化在 `sandbox::policy::Sandbox::Initialize`；dump 模块列表 30 个全为系统 DLL + electron.exe，无第三方注入。

### 修复（管理员 PowerShell）

```powershell
icacls "E:\work\game-lib" /setintegritylevel M /T /C /Q
icacls "E:\work\game-lib" /setintegritylevel "(OI)(CI)M"
```

- 验证：root 与 `.pnpm\electron@…\dist\electron.exe` 均为 “Medium Mandatory Level”；修复脚本 pass1 0 fail；修复后 `pnpm dev` 与打包版均正常启动。
- 备注：目录树若再次从备份/同步源整体复制可能复发，重跑即可；诊断产物在 repo 外 `el-stage\`（可整体删除）。

### 实验矩阵（有效数据，备查）

| 场景                                            | 结果                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| E 盘物理 exe                                    | 💥 崩溃                                                                          |
| C: / D: / Q: 物理 exe                           | ✅ 正常                                                                          |
| E 盘 junction → C 盘物理                        | ✅ 正常（物理位置决定，非路径字符串）                                            |
| 同 app 路径移出 game-lib（E:\x1）               | 💥 仍崩                                                                          |
| 旧版应用原文（不同 Electron build）在 E 盘      | ✅ 正常                                                                          |
| 旧版应用逐字节复制品在 E 盘                     | 💥 崩溃                                                                          |
| `fileapp/main.js` CommonJS 弹窗（用户截图那个） | ⚠️ 假象：game-lib `"type":"module"` 导致 CJS 被当 ESM 报错弹窗，**不是真实崩溃** |

### Electron 启动诊断的方法论坑

- GUI 子系统程序无 stdout/stderr → 必须用 `.cmd` 包装器把 `echo EXIT=%errorlevel%` 重定向到文件。
- 脱离终端检测必须用 WMI `[wmiclass]'Win32_Process'.Create`（detached）。
- 截图不可用 → 用 DOM 探针 + CDP（dev 端口 5858）+ console/network 检查验证 UI。
- 网络：GitHub raw 直连不稳，用本地代理 `http://127.0.0.1:7890` 或 npmmirror。

---

## 5. 本会话修复的其他关键问题

1. **dev 服务器重启永久挂死**：`server.close()` 需等所有已建 socket 结束，而渲染进程的 SSE 永不结束 → 重启永久挂死且无日志。修复：`closeAllConnections()` 强制断开 + 重启日志 + watcher 错误捕获。验证：touch `server/config.js` → `change detected → Server restarted → API 200`。
2. **SSE 僵尸连接（dev Vite 代理）**：dev 下 SSE 走 Vite 代理，后端强断上游时代理吞掉关闭 → EventSource 永远 OPEN、不触发 `onerror`（CDP Network 域证实无 loadingFailed/新请求）。修复：服务端每 15s 发 `{"type":"ping"}` 心跳（`server/routes/task.js`）+ `taskStore.ts` 40s 无活动看门狗（10s 检查）强制重连。端到端验证：重启后 ~50s 看门狗触发 → ERR_ABORTED → 新 SSE 请求 → 服务端 `[SSE] Client connected`。
3. **electron-vite 主进程 watch 失效**：v6 的 `dev` 默认不监听主进程（`cli.js`: `options.w || options.watch ? { watch: {} } : null`），`dev` 脚本补 `--watch`。验证：编辑 `electron-main.ts` → `electron main process rebuilt successfully` → Electron 进程全部换新（19700/5858 被新实例接管），连改两次均生效。
4. **dev CDP 5858 恢复**：迁移中丢失，已恢复 `app.commandLine.appendSwitch('remote-debugging-port', '5858')`（仅 dev）。
5. **repo 清理**：删除 `plain-test` / `plain-pkg` / `plain-appdir` / `old-copy` / `fileapp` / `fileapp-dir` 与 `.ui-migration-conventions.md`（清理前先杀掉残留 `repro-pt.exe`）。

---

## 6. 当前状态

✅ 全部完成：Phase A/B/C、DEV/PROD 双端验收、质量门、AGENTS.md 已知坑点更新；全部改动（含本文件）以单个 commit 提交于 `feat/shadcn-migration`。

---

## 7. 关键文件速查

| 文件                                         | 作用                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `server/standalone.js`                       | 独立部署入口（0.0.0.0:19770，服务 API + SPA）                                                                                 |
| `server/routes/task.js`                      | SSE 端点（15s `{"type":"ping"}` 心跳）                                                                                        |
| `src/stores/taskStore.ts`                    | SSE 客户端（40s 僵尸看门狗，10s 检查）                                                                                        |
| `config/vite.renderer.ts`                    | 前后端共享 renderer Vite 配置                                                                                                 |
| `electron.vite.config.ts` / `vite.config.ts` | 构建入口                                                                                                                      |
| `electron-builder.yml`                       | 打包契约（asar + resources/server）                                                                                           |
| `scripts/prepare-packaged-server.mjs`        | 打包后端 payload 准备                                                                                                         |
| `src-electron/electron-main.ts`              | dev 读 `ELECTRON_RENDERER_URL`；prod 读 `http://127.0.0.1:${expressPort}`；dev CDP 5858；server 热重启（closeAllConnections） |
| `src/main.ts` / `src/components/ui/`         | 新 UI 入口 + vendored 原语                                                                                                    |
| `dist/electron/Packaged/Game Lib-win32-x64/` | 用户旧版可运行应用，**勿删**（对照参考）                                                                                      |

## 8. 环境与命令

- 端口：dev 19700 ｜ test 19701 ｜ prod/standalone 19770 ｜ Electron debug 5858。
- 数据目录：`test-data/`（dev）；`GAME_LIB_PROD=1` → `%APPDATA%/Game Lib/`；`GAME_LIB_DATA_DIR` 可覆盖。
- 命令：`pnpm dev`（= `electron-vite dev --watch`）/ `pnpm dev:server` / `pnpm dev:frontend` / `pnpm standalone` / `pnpm lint` / `pnpm lint:check` / `pnpm typecheck` / `pnpm test` / `pnpm build`。
- Windows 坑：禁用 Linux 命令（head/grep/sed/curl…）；junction 删除用 `cmd /c rmdir`，不要 `Remove-Item -Recurse`。
- Electron 重装注意：清空 node_modules 后需从 `%LOCALAPPDATA%\electron\Cache` 解压 `electron-v42.11.15-win32-x64.zip` + 写 `path.txt` = `electron.exe`。

---

## 9. 后续修复：打包版其实缺少后端依赖（2026-10-18，已修复）

构建生产版供长期使用时发现：**"PROD 验收通过"有盲区**——应用能跑只是因为在这台机器上 Node 沿父目录向上找到了 dev 仓库的 `E:\work\game-lib\node_modules`。打包产物实际有两个问题：

1. **`resources/server` 里没有 node_modules**：electron-builder 的拷贝过滤器无条件丢弃任何拷贝源的根级 `node_modules`（`app-builder-lib/out/util/filter.js`："filter the root node_modules"），extraResources 静默丢掉了后端依赖 → 换机器/删除仓库必崩（旧版 @electron/packager 管线也是因此才需要自定义 hook）。
2. **`app.asar` 膨胀到 394MB**：electron-builder 默认把根 package.json 的生产依赖打进 asar；而 app bundle 由 electron-vite 完整打包，运行时一个 npm 依赖都不需要（纯死重）。

修复（两个 electron-builder 钩子）：

- `scripts/before-build.js`：`beforeBuild` 返回 `false`（node_modules 由外部处理）→ 跳过原生依赖重建 + 不把生产 node_modules 打进 asar。
- `scripts/after-pack.js`：`afterPack` 把 `.packaging/server/node_modules` 直接拷进 `resources/server/node_modules`。

验证（这次是真正的自包含测试）：把 `release\win-unpacked` 拷到**仓库外**（`E:\work\prodcopy`，向上查找摸不到 dev 依赖）启动 → 窗口 / 19770 / SPA 200 / `/api/*` 200、后端全量启动日志正常。修复后：asar 394MB → 2.33MB，`resources/server/node_modules` 9239 文件 / 52.9MB，整包 728MB → 365MB。教训已写入 AGENTS.md：**验证打包版必须拷到仓库外运行**。
