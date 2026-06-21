# Keyword Cleaning & Fixes 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 改进搜索关键词清理（去掉中文括号和版本号）、修复 DLSite fetch 路由参数兼容、GameCard 添加打开目录按钮

**架构：** splitKeyword 增加括号清理，ScannerDialog 在 Scan 阶段预调用 /dlsite/segments 缓存结果，DLSite fetch 路由兼容 `id` 参数，GameCard 通过 electronAPI 打开目录

**技术栈：** Node.js、Vue 3 + Quasar、Electron IPC

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `server/scraper/dlsite.js` | 改进 splitKeyword 括号清理 |
| `server/routes/scraper.js` | DLSite fetch 兼容 id 参数 |
| `src/components/ScannerDialog.vue` | Scan 阶段预加载 segments |
| `src/components/GameCard.vue` | 添加 folder icon 打开目录 |

---

### 任务 1：改进 splitKeyword 括号清理

**文件：**
- 修改：`server/scraper/dlsite.js:4-11`

- [ ] **步骤 1：添加括号 stripping**

修改 `splitKeyword` 函数，在版本号 stripping 之前添加 `【...】` 和 `（...）` 清理：

```js
const splitKeyword = (name) => {
  let cleaned = name
    .replace(/【.*?】/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\s*v\d+[\d.]*\s*$/i, '')
    .trim()
  const rjMatch = cleaned.match(/RJ\d+/)
  if (rjMatch) return { keyword: rjMatch[0], segments: [rjMatch[0]] }
  const re = /[\u4e00-\u9fff\u3040-\u309f\u30a1-\u30fa\u30fc-\u30ff\uff10-\uff19\uff21-\uff3a\uff41-\uff5a\u0041-\u005a\u0061-\u007a\u0030-\u0039]+/g
  const segments = cleaned.match(re) || []
  return { keyword: cleaned, segments }
}
```

- [ ] **步骤 2：验证编译**

运行：`cd d:\work\game-lib && npx vue-tsc --noEmit 2>&1`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
cd d:\work\game-lib
git add server/scraper/dlsite.js
git commit -m "fix: strip Chinese brackets from search keywords"
```

---

### 任务 2：DLSite fetch 路由兼容 id 参数

**文件：**
- 修改：`server/routes/scraper.js:48-55`

- [ ] **步骤 1：修改 fetch 路由接受 id**

```js
router.post('/dlsite/fetch', async (req, res, next) => {
  try {
    const code = req.body.rjcode || req.body.id
    if (!code) {
      return res.status(400).send({ error: 'rjcode or id is required' })
    }
    const detail = await fetchDLSiteDetail(code)
    res.send(detail)
  } catch (err) {
    next(err)
  }
})
```

- [ ] **步骤 2：验证编译**

运行：`cd d:\work\game-lib && npx vue-tsc --noEmit 2>&1`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
cd d:\work\game-lib
git add server/routes/scraper.js
git commit -m "fix: accept id parameter in DLSite fetch route"
```

---

### 任务 3：ScannerDialog Scan 阶段预处理 segments

**文件：**
- 修改：`src/components/ScannerDialog.vue:240-254`

- [ ] **步骤 1：修改 loadUnscraped 预加载 segments**

修改 `loadUnscraped`，在映射完 games 后，批量调用 `/dlsite/segments` 预处理：

```typescript
const loadUnscraped = async () => {
  if (!selectedLibrary.value) {
    scanResults.value = []
    return
  }
  const res = await api.get('/games/unscraped', { params: { libraryId: selectedLibrary.value } })
  const rawGames = res.data as { id: number; name: string; sub_path: string }[]
  scanResults.value = rawGames.map((g) => ({
    name: g.name,
    subPath: g.sub_path,
    status: 'pending' as const,
    searchResult: null,
    adoptData: null,
    searchKeyword: g.name,
    source: null as SourceType | null,
    loading: false,
    gameId: g.id,
  }))

  for (const row of scanResults.value) {
    try {
      const segRes = await api.post('/dlsite/segments', { name: row.name })
      const { keyword, segments } = segRes.data
      row.searchKeyword = keyword
      segmentsCache.set(row.name, [keyword, ...segments.filter((s: string) => s !== keyword)])
    } catch {
      // keep raw name as keyword
    }
  }
}
```

- [ ] **步骤 2：验证类型检查**

运行：`cd d:\work\game-lib && npx vue-tsc --noEmit 2>&1`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
cd d:\work\game-lib
git add src/components/ScannerDialog.vue
git commit -m "feat: pre-process search keywords and segments at scan time"
```

---

### 任务 4：GameCard 添加 folder icon

**文件：**
- 修改：`src/components/GameCard.vue`

- [ ] **步骤 1：更新 GameCard 组件**

更新 `GameCard.vue` 模板和脚本：

```vue
<template>
  <q-card class="game-card cursor-pointer" @click="$router.push(`/game/${game.id}`)">
    <q-img
      :src="coverSrc"
      :ratio="16 / 9"
      class="game-cover"
    >
      <template v-slot:error>
        <div class="absolute-full flex flex-center bg-grey-4 text-grey-6">
          <q-icon name="videogame_asset" size="48px" />
        </div>
      </template>
    </q-img>
    <q-card-section class="q-pa-sm">
      <div class="text-subtitle2 ellipsis">{{ game.name }}</div>
      <div class="text-caption text-grey ellipsis row items-center no-wrap">
        <span class="col ellipsis">{{ game.library_name }}</span>
        <q-btn
          v-if="hasElectronAPI"
          flat
          round
          dense
          size="xs"
          icon="folder_open"
          color="grey-7"
          @click.stop="openDir"
        >
          <q-tooltip>Open Directory</q-tooltip>
        </q-btn>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Game {
  id: number
  name: string
  cover_path: string | null
  library_name: string
  library_path: string
  sub_path: string
}

const props = defineProps<{ game: Game }>()

const coverSrc = computed(() => {
  if (props.game.cover_path) {
    return `/covers/${props.game.cover_path}`
  }
  return ''
})

const hasElectronAPI = computed(() => !!window.electronAPI)

const openDir = async () => {
  if (!window.electronAPI) return
  const fullPath = props.game.library_path + '\\' + props.game.sub_path
  await window.electronAPI.openPath(fullPath)
}
</script>
```

- [ ] **步骤 2：确认 GameLibPage 传给 GameCard 的数据包含 library_path 和 sub_path**

`GameLibPage.vue` 中的 `GameItem` 接口已有 `library_id` 和 `sub_path`，但缺少 `library_path`。需要确认 `GET /games` 返回的字段是否包含 `library_path`。

查看 `db.getGames` 返回的字段：`game.*, library.name as library_name, library.path as library_path` — 已包含 `library_path`。

`GameLibPage.vue` 的 `GameItem` 接口需要添加 `library_path`：

```typescript
interface GameItem {
  id: number; name: string; cover_path: string | null
  library_name: string; library_id: number; sub_path: string
  library_path: string
}
```

- [ ] **步骤 3：验证类型检查**

运行：`cd d:\work\game-lib && npx vue-tsc --noEmit 2>&1`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
cd d:\work\game-lib
git add src/components/GameCard.vue src/pages/GameLibPage.vue
git commit -m "feat: add folder icon to GameCard for opening game directory"
```