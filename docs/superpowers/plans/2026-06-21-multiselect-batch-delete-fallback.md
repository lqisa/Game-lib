# Multi-Select + Batch Delete & Fetch Fallback 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 列表页支持多选（框选+键盘）和批量删除；fetch detail 失败时回退 search 结果

**架构：** GameLibPage 新增选择模式状态和框选逻辑，GameCard 新增选中视觉反馈；ScannerDialog 的 quickAdopt 和 ScrapeDialog 的 adopt 在 fetch 失败时用 SearchResult 构造降级 DetailResult

**技术栈：** Vue 3 Composition API, Quasar, TypeScript

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src/pages/GameLibPage.vue` | 列表页：选择模式、框选、Shift/Ctrl 多选、批量删除 |
| `src/components/GameCard.vue` | 卡片：新增 `selectable`/`selected` props，选中视觉反馈 |
| `src/components/ScannerDialog.vue` | quickAdopt fetch 失败时回退 |
| `src/components/ScrapeDialog.vue` | adopt 时 detail 为空时回退 |

---

### 任务 1：GameCard 添加选中状态支持

**文件：**
- 修改：`src/components/GameCard.vue`

- [ ] **步骤 1：添加 selectable 和 selected props，修改点击行为和视觉反馈**

```vue
<template>
  <q-card
    class="game-card cursor-pointer"
    :class="{ 'game-card--selected': selected }"
    @click="handleClick"
  >
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
      <div v-if="selectable && selected" class="absolute-top-left q-pa-xs">
        <q-icon name="check_circle" color="primary" size="24px" />
      </div>
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

const props = withDefaults(defineProps<{
  game: Game
  selectable?: boolean
  selected?: boolean
}>(), {
  selectable: false,
  selected: false,
})

const emit = defineEmits<{
  click: []
  select: []
}>()

const coverSrc = computed(() => {
  if (props.game.cover_path) {
    return `/covers/${props.game.cover_path}`
  }
  return ''
})

const hasElectronAPI = computed(() => !!window.electronAPI)

const handleClick = () => {
  if (props.selectable) {
    emit('select')
  } else {
    emit('click')
  }
}

const openDir = async () => {
  if (!window.electronAPI) return
  const fullPath = props.game.library_path + '\\' + props.game.sub_path
  await window.electronAPI.openPath(fullPath)
}
</script>

<style scoped>
.game-card {
  transition: transform 0.15s, box-shadow 0.15s;
  position: relative;
}
.game-card:hover {
  transform: translateY(-2px);
}
.game-card--selected {
  box-shadow: 0 0 0 2px #1976d2;
}
.game-cover {
  min-height: 120px;
}
</style>
```

- [ ] **步骤 2：Commit**

```bash
git add src/components/GameCard.vue
git commit -m "feat: add selectable/selected props to GameCard"
```

---

### 任务 2：GameLibPage 选择模式 + 批量删除

**文件：**
- 修改：`src/pages/GameLibPage.vue`

- [ ] **步骤 1：实现选择模式、Shift/Ctrl 多选、框选、批量删除**

完整替换 GameLibPage.vue：

```vue
<template>
  <q-page>
    <div class="q-pa-md" ref="gridContainer">
      <div class="row items-center q-mb-md q-gutter-sm">
        <q-input
          v-model="keyword"
          label="Search"
          outlined
          dense
          clearable
          style="max-width: 300px"
          @keyup.enter="searchGames"
        >
          <template v-slot:append>
            <q-icon name="search" />
          </template>
        </q-input>
        <q-btn color="primary" label="Scan & Scrape" @click="showScanner = true" />
        <q-btn
          v-if="!selectMode"
          flat
          icon="checklist"
          label="Select"
          @click="enterSelectMode"
        />
        <template v-else>
          <q-btn flat label="Cancel" @click="exitSelectMode" />
          <q-btn
            color="negative"
            icon="delete"
            :label="`Delete (${selectedIds.size})`"
            :disable="selectedIds.size === 0"
            @click="batchDelete"
          />
          <span class="text-caption text-grey">{{ selectedIds.size }} selected</span>
        </template>
      </div>

      <div
        class="row q-col-gutter-md"
        @mousedown="onGridMouseDown"
        @mousemove="onGridMouseMove"
        @mouseup="onGridMouseUp"
      >
        <div
          v-for="game in games"
          :key="game.id"
          class="col-6 col-sm-4 col-md-3 col-lg-2"
          :data-game-id="game.id"
        >
          <GameCard
            :game="game"
            :selectable="selectMode"
            :selected="selectedIds.has(game.id)"
            @click="goDetail(game.id)"
            @select="toggleSelect(game.id, $event)"
          />
        </div>
      </div>

      <div
        v-if="selectMode && dragSelecting"
        class="drag-select-rect"
        :style="dragRectStyle"
      />

      <div v-if="games.length === 0 && !loading" class="text-center text-grey q-mt-xl">
        <q-icon name="videogame_asset" size="64px" />
        <div class="text-h6 q-mt-sm">No games found</div>
        <div class="text-body2">Add a game library in Settings, then scan for games.</div>
      </div>

      <div class="flex flex-center q-mt-md" v-if="total > pageSize">
        <q-pagination
          v-model="page"
          :max="Math.ceil(total / pageSize)"
          :max-pages="7"
          direction-links
          @update:model-value="loadGames"
        />
      </div>
    </div>

    <ScannerDialog v-model="showScanner" @done="loadGames" />

    <q-dialog v-model="confirmDelete" persistent>
      <q-card>
        <q-card-section class="row items-center">
          <q-icon name="warning" color="negative" size="lg" class="q-mr-sm" />
          <span>Delete {{ selectedIds.size }} game(s)?</span>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="negative" label="Delete" @click="doBatchDelete" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../composables/useApi'
import GameCard from '../components/GameCard.vue'
import ScannerDialog from '../components/ScannerDialog.vue'

interface GameItem {
  id: number; name: string; cover_path: string | null
  library_name: string; library_id: number; sub_path: string
  library_path: string
}

const router = useRouter()
const games = ref<GameItem[]>([])
const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = 24
const total = ref(0)
const showScanner = ref(false)

const selectMode = ref(false)
const selectedIds = ref<Set<number>>(new Set())
const lastSelectedId = ref<number | null>(null)
const confirmDelete = ref(false)

const gridContainer = ref<HTMLElement | null>(null)

const dragSelecting = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const dragEnd = ref({ x: 0, y: 0 })

const dragRectStyle = computed(() => {
  const x = Math.min(dragStart.value.x, dragEnd.value.x)
  const y = Math.min(dragStart.value.y, dragEnd.value.y)
  const w = Math.abs(dragEnd.value.x - dragStart.value.x)
  const h = Math.abs(dragEnd.value.y - dragStart.value.y)
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
  }
})

const enterSelectMode = () => {
  selectMode.value = true
}

const exitSelectMode = () => {
  selectMode.value = false
  selectedIds.value = new Set()
  lastSelectedId.value = null
}

const goDetail = (id: number) => {
  void router.push(`/game/${id}`)
}

const toggleSelect = (id: number, event?: MouseEvent) => {
  const newSet = new Set(selectedIds.value)

  if (event?.shiftKey && lastSelectedId.value !== null) {
    const ids = games.value.map(g => g.id)
    const fromIdx = ids.indexOf(lastSelectedId.value)
    const toIdx = ids.indexOf(id)
    if (fromIdx >= 0 && toIdx >= 0) {
      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
      for (let i = lo; i <= hi; i++) {
        newSet.add(ids[i]!)
      }
    }
  } else if (event?.ctrlKey || event?.metaKey) {
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
  } else {
    if (newSet.has(id) && newSet.size === 1) {
      newSet.delete(id)
    } else {
      newSet.clear()
      newSet.add(id)
    }
  }

  selectedIds.value = newSet
  lastSelectedId.value = id
}

const onGridMouseDown = (e: MouseEvent) => {
  if (!selectMode.value) return
  if ((e.target as HTMLElement).closest('.game-card')) return
  dragSelecting.value = true
  const rect = gridContainer.value?.getBoundingClientRect()
  if (!rect) return
  dragStart.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  dragEnd.value = { ...dragStart.value }
}

const onGridMouseMove = (e: MouseEvent) => {
  if (!dragSelecting.value) return
  const rect = gridContainer.value?.getBoundingClientRect()
  if (!rect) return
  dragEnd.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

const onGridMouseUp = () => {
  if (!dragSelecting.value) return
  dragSelecting.value = false

  const container = gridContainer.value
  if (!container) return
  const containerRect = container.getBoundingClientRect()

  const selX1 = Math.min(dragStart.value.x, dragEnd.value.x) + containerRect.left
  const selY1 = Math.min(dragStart.value.y, dragEnd.value.y) + containerRect.top
  const selX2 = Math.max(dragStart.value.x, dragEnd.value.x) + containerRect.left
  const selY2 = Math.max(dragStart.value.y, dragEnd.value.y) + containerRect.top

  const newSet = new Set(selectedIds.value)
  const cards = container.querySelectorAll('[data-game-id]')
  cards.forEach((card) => {
    const cardRect = card.getBoundingClientRect()
    const overlaps = !(cardRect.right < selX1 || cardRect.left > selX2 || cardRect.bottom < selY1 || cardRect.top > selY2)
    if (overlaps) {
      const id = Number((card as HTMLElement).dataset.gameId)
      if (id) newSet.add(id)
    }
  })
  selectedIds.value = newSet
}

const batchDelete = () => {
  confirmDelete.value = true
}

const doBatchDelete = async () => {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  await api.post('/games/batch-delete', { ids })
  confirmDelete.value = false
  exitSelectMode()
  await loadGames()
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && selectMode.value) {
    exitSelectMode()
  }
}

const loadGames = async () => {
  loading.value = true
  try {
    const res = await api.get('/games', {
      params: {
        page: page.value,
        pageSize,
        keyword: keyword.value || undefined,
      },
    })
    games.value = res.data.games
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

const searchGames = () => {
  page.value = 1
  void loadGames()
}

onMounted(() => {
  void loadGames()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.drag-select-rect {
  position: absolute;
  border: 2px dashed #1976d2;
  background: rgba(25, 118, 210, 0.1);
  pointer-events: none;
  z-index: 1000;
}
</style>
```

- [ ] **步骤 2：Commit**

```bash
git add src/pages/GameLibPage.vue
git commit -m "feat: add multi-select (box/shift/ctrl) and batch delete to game list"
```

---

### 任务 3：ScannerDialog quickAdopt fetch 失败时回退

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：在 quickAdopt 中 fetch 失败时用 SearchResult 构造降级 DetailResult**

找到 `quickAdopt` 函数中的 catch 块，将：

```typescript
  } catch {
    row.status = 'error'
  } finally {
```

替换为：

```typescript
  } catch {
    const sr = row.searchResult!
    const fallback: DetailResult = {
      id: sr.id,
      title: sr.name,
      coverURL: sr.coverUrl,
      makers: [],
      genres: [],
      tags: [],
      description: '',
    }
    detailCache.set(dKey, fallback)
    row.adoptData = {
      source: row.source || 'dlsite',
      sourceId: sr.id,
      name: sr.name,
      makerName: sr.makerName,
      coverUrl: sr.coverUrl,
      detail: fallback,
    }
    row.status = 'adopted'
  } finally {
```

- [ ] **步骤 2：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: fallback to search result when fetch detail fails in quickAdopt"
```

---

### 任务 4：ScrapeDialog adopt 时 detail 为空回退

**文件：**
- 修改：`src/components/ScrapeDialog.vue`

- [ ] **步骤 1：在 adopt 函数中 detail 为空时用 SearchResult 构造降级 DetailResult**

找到 `adopt` 函数：

```typescript
const adopt = () => {
  if (!selectedResult.value || !detail.value) return
  emit('adopted', {
    source: activeSource.value,
    sourceId: selectedResult.value.id,
    name: selectedResult.value.name,
    makerName: selectedResult.value.makerName,
    coverUrl: selectedResult.value.coverUrl,
    detail: detail.value
  })
  show.value = false
}
```

替换为：

```typescript
const adopt = () => {
  if (!selectedResult.value) return
  const fallback: DetailResult = detail.value || {
    id: selectedResult.value.id,
    title: selectedResult.value.name,
    coverURL: selectedResult.value.coverUrl,
    makers: [],
    genres: [],
    tags: [],
    description: '',
  }
  emit('adopted', {
    source: activeSource.value,
    sourceId: selectedResult.value.id,
    name: selectedResult.value.name,
    makerName: selectedResult.value.makerName,
    coverUrl: selectedResult.value.coverUrl,
    detail: fallback,
  })
  show.value = false
}
```

同时将 Adopt 按钮的 `:disable="!detail"` 移除，改为 `:disable="!selectedResult"`：

```html
<q-btn color="positive" label="Adopt" @click="adopt" :disable="!selectedResult" />
```

- [ ] **步骤 2：Commit**

```bash
git add src/components/ScrapeDialog.vue
git commit -m "feat: fallback to search result when detail is empty in ScrapeDialog adopt"
```

---

### 任务 5：验证

- [ ] **步骤 1：运行 vue-tsc 类型检查**

运行：`npx vue-tsc --noEmit`
预期：0 errors

- [ ] **步骤 2：手动测试**
  - 列表页点击 Select 进入选择模式
  - 点击卡片选中/取消
  - Shift+Click 范围选
  - Ctrl+Click 追加选
  - 拖拽框选
  - 批量删除确认弹窗
  - ESC 退出选择模式
  - ScannerDialog 中 quickAdopt fetch 失败时仍能 adopt（有封面）
  - ScrapeDialog 中 detail 为空时仍能 adopt