# Compress Store Mode & Task Cancel — Design

## Problem

1. Relocate folder → archive（压缩）使用 rar 默认压缩级别，CPU 密集耗时长，但收益不大——大部分 galgame 资源已经是压缩格式（图片、音频），再压一遍几乎不缩减体积。
2. Task Panel 中没有 compress 任务的取消按钮，用户无法中断正在运行的压缩任务。

## Solution

两个独立改动，互不依赖：

1. 压缩从默认级别改为 store 模式（`-m0`），只打包不做压缩运算
2. 前端 TaskPanel 补齐 compress 类型的 UI 支持（类型声明 + 图标 + 取消按钮）

## Design

### 1. Backend — Store Mode

**文件:** `server/tasks.js`

**改动:** `tryCompress` 函数，rar 参数加 `-m0`

```diff
- const args = ['a', '-r', '-ep1', '-idq', destArchive, `${sourceDir}\\*`];
+ const args = ['a', '-r', '-ep1', '-idq', '-m0', destArchive, `${sourceDir}\\*`];
```

- `-m0`: store mode，不压缩，仅打包。速度从 CPU-bound 变成纯 I/O-bound
- 其他参数不变：`-r` 递归、`-ep1` 去除 base 路径、`-idq` 静默模式

### 2. Frontend — Task Panel Compress Support

**文件:** `src/stores/taskStore.ts`

Task 类型的 type 联合加 `'compress'`：

```diff
- type: 'move' | 'extract' | 'similar-scan' | 'nsfw-scan' | 'backup';
+ type: 'move' | 'extract' | 'compress' | 'similar-scan' | 'nsfw-scan' | 'backup';
```

**文件:** `src/components/TaskPanel.vue`

两处改动：

**a) 取消按钮条件** — 加 `task.type === 'compress'`：

```diff
- v-if="task.status === 'running' && (task.type === 'extract' || task.type === 'backup')"
+ v-if="task.status === 'running' && (task.type === 'extract' || task.type === 'compress' || task.type === 'backup')"
```

**b) 图标映射** — compress 类型已经有 fallback 到 `'archive'`（当前 `else` 分支），语义合适，不需要改。但如果要更明确，可以在条件分支里加：

```diff
  task.type === 'backup'
    ? 'settings_backup_restore'
+   : task.type === 'compress'
+     ? 'archive'
      : 'archive'
```

实际上当前三元已经 fallback 到 `'archive'`，所以图标分支可加可不加——加了更明确，不加行为不变。

### 3. 无需改动的部分

**同名检查 (2.1):** `server/routes/game.js` relocate 路由已正确处理：

- `force` 未传或 false → `destExists` → 409
- `force: true` → 跳过检查，允许覆盖

**临时产物清理 (2.2):** `server/tasks.js` 链路完整：

- `cancelTask` → `childProcess.kill()` → `tryCompress` close 事件检测 `status === 'cancelled'` → resolve `'error'` → `executeCompressTask` 调用 `cleanupDest()` 删半成品 .rar
- rar.exe 在 Windows 上没有 graceful shutdown 机制（无 signal handler、无 `--stop`），`kill()` 即 `TerminateProcess` 是唯一可行方案，我们自己的 `cleanupDest()` 兜底不依赖 rar 行为

## Files to Modify

| File                           | Change                                            |
| ------------------------------ | ------------------------------------------------- |
| `server/tasks.js`              | `tryCompress` 加 `-m0` 参数                       |
| `src/stores/taskStore.ts`      | Task type 联合加 `'compress'`                     |
| `src/components/TaskPanel.vue` | 取消按钮条件加 compress；图标映射加 compress 分支 |

## Verification

- `npm run typecheck` — 无类型错误
- `npm run lint:check` — 无 lint 错误
- 已有测试 `integration-compress.test.js` 验证压缩流程，store 模式不改变行为语义，现有测试仍能通过（前提系统有 WinRAR）
