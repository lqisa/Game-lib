# 采集流程重构：Scrape 与 Adopt 分离 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将采集（Scrape）与入库（Adopt）分离，搜索结果暂存供用户确认，支持修改关键字重新搜索，最终一键提交入库。

**架构：** ScannerDialog 列表展示未采集游戏，每行可打开 ScrapeDialog 弹窗搜索/重选/采纳。采纳仅暂存到行数据，不立即入库。底部"提交入库"按钮批量执行 adopt。后端搜索 API 返回封面 URL。

**技术栈：** Vue 3 + Quasar + TypeScript（前端），Express + Knex（后端）

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `server/scraper/dlsite.js` | 修改 | searchDLSite 返回 coverUrl 字段 |
| `src/components/ScrapeDialog.vue` | 创建 | 单个游戏采集弹窗：搜索/重选/采纳 |
| `src/components/ScannerDialog.vue` | 重写 | 列表展示未采集游戏 + 封面缩略图 + 提交入库 |
| `src/pages/GameDetailPage.vue` | 修改 | 添加"重新采集"按钮 |

---

### 任务 1：后端 searchDLSite 返回封面 URL

**文件：**
- 修改：`server/scraper/dlsite.js`

- [ ] **步骤 1：修改 searchDLSite 返回 coverUrl**

在 `searchDLSite` 函数中，JSON API 返回的每个 item 包含 `main_image` 字段（相对路径如 `//img.dlsite.com/...`）。将其拼为完整 URL 作为 `coverUrl` 返回。

修改 `server/scraper/dlsite.js` 第 18-26 行的 map 回调：

```javascript
  return items.map(item => {
    const workno = item.workno || ''
    const rjcode = workno.replace('RJ', '')
    let coverUrl = item.main_image || ''
    if (coverUrl && coverUrl.startsWith('//')) {
      coverUrl = `https:${coverUrl}`
    }
    return {
      rjcode,
      name: item.work_name || '',
      makerName: item.maker_name || '',
      coverUrl
    }
  }).filter(r => r.rjcode)
```

- [ ] **步骤 2：验证**

启动应用，调用 `POST /api/scraper/dlsite/search` 传入 `{"keyword":"RJ01180001"}`，确认返回结果包含 `coverUrl` 字段。

- [ ] **步骤 3：Commit**

```bash
git add server/scraper/dlsite.js
git commit -m "feat: searchDLSite returns coverUrl from JSON API"
```

---

### 任务 2：创建 ScrapeDialog 弹窗组件

**文件：**
- 创建：`src/components/ScrapeDialog.vue`

- [ ] **步骤 1：创建 ScrapeDialog.vue**

```vue
<template>
  <q-dialog v-model="show" persistent>
    <q-card style="min-width: 600px; max-width: 800px;">
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle1">Scrape: {{ gameName }}</div>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section>
        <div class="row q-gutter-sm q-mb-md">
          <q-input
            v-model="keyword"
            label="Search keyword"
            outlined
            dense
            class="col"
            @keyup.enter="doSearch"
          >
            <template v-slot:append>
              <q-icon name="search" class="cursor-pointer" @click="doSearch" />
            </template>
          </q-input>
          <q-btn color="primary" label="Search" @click="doSearch" :loading="searching" />
        </div>

        <div v-if="results.length > 0" class="q-mb-md">
          <div class="text-caption text-grey q-mb-sm">Search Results (click to select)</div>
          <div class="row q-col-gutter-sm" style="max-height: 300px; overflow-y: auto;">
            <div
              v-for="(r, idx) in results"
              :key="r.rjcode"
              class="col-6 col-sm-4 cursor-pointer"
              @click="selectResult(idx)"
            >
              <q-card
                :class="{ 'bg-blue-1': selectedIdx === idx }"
                flat
                bordered
              >
                <q-img
                  v-if="r.coverUrl"
                  :src="r.coverUrl"
                  :ratio="3 / 4"
                  style="max-height: 160px;"
                >
                  <template v-slot:error>
                    <div class="absolute-full flex flex-center bg-grey-3">
                      <q-icon name="broken_image" size="32px" color="grey" />
                    </div>
                  </template>
                </q-img>
                <div v-else class="bg-grey-3 flex flex-center" style="aspect-ratio: 3/4; max-height: 160px;">
                  <q-icon name="videogame_asset" size="32px" color="grey" />
                </div>
                <q-card-section class="q-pa-xs">
                  <div class="text-caption ellipsis-2-lines">{{ r.name }}</div>
                  <div class="text-caption text-grey ellipsis">{{ r.makerName }}</div>
                  <div class="text-caption text-grey">RJ{{ r.rjcode }}</div>
                </q-card-section>
              </q-card>
            </div>
          </div>
        </div>

        <div v-if="results.length === 0 && searched" class="text-center text-grey q-pa-md">
          No results found. Try a different keyword.
        </div>

        <q-separator v-if="selectedResult" class="q-my-sm" />

        <div v-if="selectedResult" class="q-mt-sm">
          <div class="text-subtitle2 q-mb-sm">Selected: {{ selectedResult.name }}</div>
          <div class="row q-col-gutter-md">
            <div class="col-4">
              <q-img
                v-if="selectedResult.coverUrl"
                :src="selectedResult.coverUrl"
                :ratio="3 / 4"
                class="rounded-borders"
              />
            </div>
            <div class="col-8">
              <div class="text-body2"><span class="text-grey">RJ:</span> RJ{{ selectedResult.rjcode }}</div>
              <div class="text-body2"><span class="text-grey">Maker:</span> {{ selectedResult.makerName }}</div>
              <div v-if="detailLoading" class="text-center q-pa-sm">
                <q-spinner-dots size="24px" />
              </div>
              <div v-if="detail">
                <div v-if="detail.genres?.length" class="q-mt-xs">
                  <q-chip v-for="g in detail.genres" :key="g" dense size="sm" color="blue" text-color="white">{{ g }}</q-chip>
                </div>
                <div v-if="detail.tags?.length" class="q-mt-xs">
                  <q-chip v-for="t in detail.tags" :key="t" dense size="sm" color="teal" text-color="white">{{ t }}</q-chip>
                </div>
                <div v-if="detail.description" class="text-caption q-mt-sm ellipsis-3-lines">{{ detail.description }}</div>
              </div>
            </div>
          </div>
          <div class="row justify-end q-mt-md">
            <q-btn color="positive" label="Adopt" @click="adopt" :disable="!detail" />
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import api from '../composables/useApi'

interface SearchResult {
  rjcode: string
  name: string
  makerName: string
  coverUrl: string
}

interface DetailResult {
  title: string
  coverURL: string
  makers: string[]
  genres: string[]
  tags: string[]
  description: string
}

interface AdoptData {
  rjcode: string
  name: string
  makerName: string
  coverUrl: string
  detail: DetailResult
}

const props = defineProps<{
  modelValue: boolean
  gameName: string
  gameId: number
  defaultKeyword?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  adopted: [data: AdoptData]
}>()

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const keyword = ref('')
const results = ref<SearchResult[]>([])
const selectedIdx = ref(-1)
const searching = ref(false)
const searched = ref(false)
const detail = ref<DetailResult | null>(null)
const detailLoading = ref(false)

const selectedResult = computed(() => {
  if (selectedIdx.value >= 0 && selectedIdx.value < results.value.length) {
    return results.value[selectedIdx.value]
  }
  return null
})

const doSearch = async () => {
  if (!keyword.value.trim()) return
  searching.value = true
  results.value = []
  selectedIdx.value = -1
  detail.value = null
  searched.value = false
  try {
    const res = await api.post('/scraper/dlsite/search', { keyword: keyword.value.trim() })
    results.value = res.data
    searched.value = true
  } finally {
    searching.value = false
  }
}

const selectResult = async (idx: number) => {
  selectedIdx.value = idx
  detail.value = null
  const r = results.value[idx]
  if (!r) return
  detailLoading.value = true
  try {
    const res = await api.post('/scraper/dlsite/fetch', { rjcode: r.rjcode })
    detail.value = res.data
  } catch {
    detail.value = null
  } finally {
    detailLoading.value = false
  }
}

const adopt = () => {
  if (!selectedResult.value || !detail.value) return
  emit('adopted', {
    rjcode: selectedResult.value.rjcode,
    name: selectedResult.value.name,
    makerName: selectedResult.value.makerName,
    coverUrl: selectedResult.value.coverUrl,
    detail: detail.value
  })
  show.value = false
}

watch(() => props.modelValue, (val) => {
  if (val) {
    keyword.value = props.defaultKeyword || props.gameName.match(/RJ\d+/)?.[0] || props.gameName
    results.value = []
    selectedIdx.value = -1
    detail.value = null
    searched.value = false
    void doSearch()
  }
})
</script>
```

- [ ] **步骤 2：Commit**

```bash
git add src/components/ScrapeDialog.vue
git commit -m "feat: add ScrapeDialog component with search/select/adopt flow"
```

---

### 任务 3：重写 ScannerDialog — 列表暂存 + 提交入库

**文件：**
- 重写：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：重写 ScannerDialog.vue**

```vue
<template>
  <q-dialog v-model="modelValue" persistent maximized>
    <q-card>
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle1">Scan & Scrape</div>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section class="q-pa-md">
        <div class="row q-mb-md items-center q-gutter-sm">
          <q-select
            v-model="selectedLibrary"
            :options="libraries"
            option-label="name"
            option-value="id"
            emit-value
            map-options
            label="Select Library"
            outlined
            dense
            style="min-width: 200px"
            @update:model-value="onLibraryChange"
          />
          <q-btn color="primary" label="Scan" @click="scanDir" :disable="!selectedLibrary" :loading="scanning" />
          <q-btn color="secondary" label="Scrape All" @click="batchScrape" :disable="!hasPending" />
          <q-btn
            color="positive"
            label="提交入库"
            @click="submitAdopted"
            :disable="adoptedCount === 0"
            :loading="submitting"
          >
            <q-badge v-if="adoptedCount > 0" color="white" text-color="positive" floating>{{ adoptedCount }}</q-badge>
          </q-btn>
          <q-badge v-if="scanResults.length > 0" color="grey-7" class="text-body2">
            {{ scanResults.length }} unscraped
          </q-badge>
        </div>

        <q-table
          :rows="scanResults"
          :columns="columns"
          row-key="gameId"
          flat
          bordered
          virtual-scroll
          :rows-per-page-options="[0]"
          style="max-height: 70vh"
        >
          <template v-slot:body-cell-cover="props">
            <q-td :props="props">
              <q-img
                v-if="props.row.searchResult?.coverUrl"
                :src="props.row.searchResult.coverUrl"
                style="width: 48px; height: 64px;"
                fit="cover"
              >
                <template v-slot:error>
                  <div class="absolute-full flex flex-center bg-grey-3">
                    <q-icon name="broken_image" size="16px" color="grey" />
                  </div>
                </template>
              </q-img>
              <q-icon v-else name="videogame_asset" size="32px" color="grey-5" />
            </q-td>
          </template>
          <template v-slot:body-cell-matched="props">
            <q-td :props="props">
              <div v-if="props.row.searchResult" class="ellipsis" style="max-width: 200px;">
                {{ props.row.searchResult.name }}
                <div class="text-caption text-grey">RJ{{ props.row.searchResult.rjcode }}</div>
              </div>
              <span v-else class="text-grey">—</span>
            </q-td>
          </template>
          <template v-slot:body-cell-status="props">
            <q-td :props="props">
              <q-badge v-if="props.row.status === 'adopted'" color="positive">Adopted</q-badge>
              <q-badge v-else-if="props.row.status === 'searching'" color="warning">Searching...</q-badge>
              <q-badge v-else-if="props.row.status === 'error'" color="negative">Failed</q-badge>
              <q-badge v-else-if="props.row.status === 'searched'" color="blue">Searched</q-badge>
              <q-badge v-else color="grey">Pending</q-badge>
            </q-td>
          </template>
          <template v-slot:body-cell-actions="props">
            <q-td :props="props">
              <q-btn
                size="sm"
                color="primary"
                :label="props.row.status === 'pending' || props.row.status === 'error' ? 'Scrape' : '重选'"
                @click="openScrapeDialog(props.row)"
              />
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <ScrapeDialog
      v-model="showScrapeDialog"
      :game-name="scrapingRow?.name || ''"
      :game-id="scrapingRow?.gameId || 0"
      :default-keyword="scrapingRow?.searchResult?.rjcode ? `RJ${scrapingRow.searchResult.rjcode}` : undefined"
      @adopted="onAdopted"
    />
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import api from '../composables/useApi'
import ScrapeDialog from './ScrapeDialog.vue'

interface SearchResult {
  rjcode: string
  name: string
  makerName: string
  coverUrl: string
}

interface DetailResult {
  title: string
  coverURL: string
  makers: string[]
  genres: string[]
  tags: string[]
  description: string
}

interface AdoptData {
  rjcode: string
  name: string
  makerName: string
  coverUrl: string
  detail: DetailResult
}

interface ScanRow {
  gameId: number
  name: string
  subPath: string
  status: 'pending' | 'searching' | 'searched' | 'adopted' | 'error'
  searchResult: SearchResult | null
  adoptData: AdoptData | null
  loading: boolean
}

const modelValue = defineModel<boolean | null>({ default: false })
const emit = defineEmits<{ done: [] }>()

const libraries = ref<{ id: number; name: string; path: string }[]>([])
const selectedLibrary = ref<number | null>(null)
const scanResults = ref<ScanRow[]>([])
const scanning = ref(false)
const submitting = ref(false)

const showScrapeDialog = ref(false)
const scrapingRow = ref<ScanRow | null>(null)

const hasPending = computed(() => scanResults.value.some(r => r.status === 'pending' || r.status === 'error'))
const adoptedCount = computed(() => scanResults.value.filter(r => r.status === 'adopted').length)

const columns = [
  { name: 'cover', label: 'Cover', field: 'cover', align: 'center' as const, style: 'width: 60px' },
  { name: 'name', label: 'Directory', field: 'name', align: 'left' as const, sortable: true },
  { name: 'matched', label: 'Matched', field: 'matched', align: 'left' as const },
  { name: 'status', label: 'Status', field: 'status', align: 'center' as const },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' as const },
]

const fetchLibraries = async () => {
  const res = await api.get('/libraries')
  libraries.value = res.data
}

const loadUnscraped = async () => {
  if (!selectedLibrary.value) {
    scanResults.value = []
    return
  }
  const res = await api.get('/games/unscraped', { params: { libraryId: selectedLibrary.value } })
  scanResults.value = res.data.map((g: { id: number; name: string; sub_path: string }) => ({
    name: g.name,
    subPath: g.sub_path,
    status: 'pending' as const,
    searchResult: null,
    adoptData: null,
    loading: false,
    gameId: g.id,
  }))
}

const onLibraryChange = () => {
  void loadUnscraped()
}

const scanDir = async () => {
  if (!selectedLibrary.value) return
  scanning.value = true
  try {
    const res = await api.post('/games/scan', { libraryId: selectedLibrary.value })
    const newDirs: string[] = res.data.newDirs
    if (newDirs.length > 0) {
      await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: newDirs,
      })
    }
    await loadUnscraped()
  } finally {
    scanning.value = false
  }
}

const openScrapeDialog = (row: ScanRow) => {
  scrapingRow.value = row
  showScrapeDialog.value = true
}

const onAdopted = (data: AdoptData) => {
  if (!scrapingRow.value) return
  scrapingRow.value.searchResult = {
    rjcode: data.rjcode,
    name: data.name,
    makerName: data.makerName,
    coverUrl: data.coverUrl,
  }
  scrapingRow.value.adoptData = data
  scrapingRow.value.status = 'adopted'
}

const batchScrape = async () => {
  for (const row of [...scanResults.value]) {
    if (row.status !== 'pending' && row.status !== 'error') continue
    row.status = 'searching'
    row.loading = true
    try {
      const keyword = row.name.match(/RJ\d+/)?.[0] || row.name
      const searchRes = await api.post('/scraper/dlsite/search', { keyword })
      const results = searchRes.data
      if (results.length > 0) {
        row.searchResult = results[0]
        row.status = 'searched'
      } else {
        row.status = 'error'
      }
    } catch {
      row.status = 'error'
    } finally {
      row.loading = false
    }
  }
}

const submitAdopted = async () => {
  submitting.value = true
  const adoptedRows = scanResults.value.filter(r => r.status === 'adopted' && r.adoptData)
  try {
    for (const row of adoptedRows) {
      const d = row.adoptData!
      await api.post('/scraper/adopt', {
        gameId: row.gameId,
        sourceType: 'dlsite',
        sourceId: d.rjcode,
        sourceUrl: `https://www.dlsite.com/maniax/work/=/product_id/RJ${d.rjcode}.html`,
        name: d.detail.title,
        coverUrl: d.detail.coverURL,
        makers: d.detail.makers,
        genres: d.detail.genres,
        tags: d.detail.tags,
        description: d.detail.description,
      })
    }
    scanResults.value = scanResults.value.filter(r => r.status !== 'adopted')
    emit('done')
  } finally {
    submitting.value = false
  }
}

watch(modelValue, (val) => {
  if (val) {
    void fetchLibraries()
    void loadUnscraped()
  }
})
</script>
```

- [ ] **步骤 2：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: rewrite ScannerDialog with scrape/adopt split and submit flow"
```

---

### 任务 4：GameDetailPage 添加"重新采集"按钮

**文件：**
- 修改：`src/pages/GameDetailPage.vue`

- [ ] **步骤 1：在详情页添加重新采集按钮**

在 `GameDetailPage.vue` 的返回按钮旁边添加"重新采集"按钮，点击后打开 ScrapeDialog。

在 `<q-btn flat round icon="arrow_back" ...>` 后面添加：

```html
<q-btn flat round icon="refresh" class="q-mb-md" @click="showScrapeDialog = true">
  <q-tooltip>Re-scrape</q-tooltip>
</q-btn>
<ScrapeDialog
  v-model="showScrapeDialog"
  :game-name="game?.name || ''"
  :game-id="game?.id || 0"
  :default-keyword="game?.sources?.[0]?.source_id ? `RJ${game.sources[0].source_id}` : undefined"
  @adopted="onReScrape"
/>
```

在 `<script setup>` 中添加：

```typescript
import ScrapeDialog from '../components/ScrapeDialog.vue'

const showScrapeDialog = ref(false)

const onReScrape = async (data: any) => {
  if (!game.value) return
  await api.post('/scraper/adopt', {
    gameId: game.value.id,
    sourceType: 'dlsite',
    sourceId: data.rjcode,
    sourceUrl: `https://www.dlsite.com/maniax/work/=/product_id/RJ${data.rjcode}.html`,
    name: data.detail.title,
    coverUrl: data.detail.coverURL,
    makers: data.detail.makers,
    genres: data.detail.genres,
    tags: data.detail.tags,
    description: data.detail.description,
  })
  const res = await api.get(`/games/${game.value.id}`)
  game.value = res.data
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/pages/GameDetailPage.vue
git commit -m "feat: add re-scrape button to game detail page"
```

---

### 任务 5：端到端验证

- [ ] **步骤 1：启动应用**

```bash
cd d:\work\game-lib && npx quasar dev -m electron
```

- [ ] **步骤 2：验证完整流程**

1. 打开 Scan & Scrape → 选择游戏库 → 列表显示未采集游戏
2. 点某行 "Scrape" → 弹窗打开 → 自动搜索 → 修改关键字重新搜索 → 选择结果 → 采纳 → 行状态变 Adopted
3. 点 "Scrape All" → 批量搜索 → 列表显示封面和匹配标题
4. 点某行 "重选" → 弹窗打开 → 重新搜索 → 采纳
5. 点 "提交入库" → 已采纳的游戏入库并从列表消失
6. 回到 Game Lib → 确认入库的游戏有封面和信息
7. 进入游戏详情页 → 点"重新采集" → 重新搜索 → 采纳 → 信息更新

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: complete scrape-adopt split with e2e verification"
```