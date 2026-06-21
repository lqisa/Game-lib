# 游戏列表页改进 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为游戏列表页添加多条件筛选弹窗、空白封面占位图标、搜索栏固定顶部、ScrapeDialog Adopt 按钮移至底部 Action 栏

**架构：** 后端新增筛选相关 API 并扩展现有 GET /games 接口；前端新增 FilterDialog 组件，修改 GameLibPage 集成筛选和 sticky 布局，修改 GameCard 添加占位图标，修改 ScrapeDialog 调整 Adopt 按钮位置

**技术栈：** Vue 3 + Quasar + TypeScript（前端），Express + Knex + SQLite（后端）

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `server/database/db.js` | 修改 | 新增 getMakers/getGenres/getTags，修改 getGames 支持筛选 |
| `server/routes/game.js` | 修改 | 新增 GET /makers、GET /genres、GET /tags，修改 GET /games |
| `src/components/FilterDialog.vue` | 创建 | 筛选弹窗组件 |
| `src/pages/GameLibPage.vue` | 修改 | 集成筛选、sticky 工具栏 |
| `src/components/GameCard.vue` | 修改 | 空白封面占位图标 |
| `src/components/ScrapeDialog.vue` | 修改 | Adopt 按钮移至底部 Action 栏 |

---

### 任务 1：后端 — 新增筛选数据接口

**文件：**
- 修改：`server/database/db.js`
- 修改：`server/routes/game.js`

- [ ] **步骤 1：在 db.js 中新增 getMakers、getGenres、getTags 方法**

在 `server/database/db.js` 的 `module.exports` 之前添加：

```js
const getMakers = async () => {
  return db('maker').select('id', 'name').orderBy('name')
}

const getGenres = async () => {
  return db('genre').select('id', 'name').orderBy('name')
}

const getTags = async () => {
  return db('tag').select('id', 'name').orderBy('name')
}
```

在 `module.exports` 中添加 `getMakers`、`getGenres`、`getTags`。

- [ ] **步骤 2：在 game.js 路由中新增三个接口**

在 `server/routes/game.js` 的 `router.get('/unscraped', ...)` 之前添加：

```js
router.get('/makers', async (req, res, next) => {
  try {
    const makers = await db.getMakers()
    res.send(makers)
  } catch (err) {
    next(err)
  }
})

router.get('/genres', async (req, res, next) => {
  try {
    const genres = await db.getGenres()
    res.send(genres)
  } catch (err) {
    next(err)
  }
})

router.get('/tags', async (req, res, next) => {
  try {
    const tags = await db.getTags()
    res.send(tags)
  } catch (err) {
    next(err)
  }
})
```

- [ ] **步骤 3：验证新接口**

启动服务后访问 `GET /games/makers`、`GET /games/genres`、`GET /games/tags`，确认返回数据。

- [ ] **步骤 4：Commit**

```bash
git add server/database/db.js server/routes/game.js
git commit -m "feat: add GET /games/makers, /genres, /tags endpoints"
```

---

### 任务 2：后端 — 扩展 GET /games 支持筛选

**文件：**
- 修改：`server/database/db.js`
- 修改：`server/routes/game.js`

- [ ] **步骤 1：修改 db.js 中的 getGames 方法**

将 `getGames` 方法签名和实现改为：

```js
const getGames = async ({ page = 1, pageSize = 50, keyword = '', libraryIds, makerIds, genreIds, tagIds, scraped } = {}) => {
  let query = db('game')
    .leftJoin('library', 'game.library_id', 'library.id')
    .select('game.*', 'library.name as library_name', 'library.path as library_path')
    .orderBy('game.updated_at', 'desc')

  if (keyword) {
    query = query.where('game.name', 'like', `%${keyword}%`)
  }

  if (libraryIds && libraryIds.length > 0) {
    query = query.whereIn('game.library_id', libraryIds)
  }

  if (makerIds && makerIds.length > 0) {
    query = query
      .join('game_maker', 'game.id', 'game_maker.game_id')
      .whereIn('game_maker.maker_id', makerIds)
  }

  if (genreIds && genreIds.length > 0) {
    query = query
      .join('game_genre', 'game.id', 'game_genre.game_id')
      .whereIn('game_genre.genre_id', genreIds)
  }

  if (tagIds && tagIds.length > 0) {
    query = query
      .join('game_tag', 'game.id', 'game_tag.game_id')
      .whereIn('game_tag.tag_id', tagIds)
  }

  if (scraped === true) {
    query = query.whereExists(function () {
      this.select('id').from('game_source').whereRaw('game_source.game_id = game.id')
    })
  } else if (scraped === false) {
    query = query.whereNotExists(function () {
      this.select('id').from('game_source').whereRaw('game_source.game_id = game.id')
    })
  }

  const total = await query.clone().countDistinct('game.id as count').first()
  const offset = (page - 1) * pageSize
  const games = await query.groupBy('game.id').offset(offset).limit(pageSize)

  return { games, total: total.count, page, pageSize }
}
```

注意：使用 `countDistinct('game.id')` 和 `groupBy('game.id')` 避免 JOIN 导致的重复行问题。

- [ ] **步骤 2：修改 game.js 路由中的 GET / 处理**

将 `server/routes/game.js` 中的 GET `/` 处理改为：

```js
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, keyword, libraryIds, makerIds, genreIds, tagIds, scraped } = req.query
    const result = await db.getGames({
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 50,
      keyword: keyword || '',
      libraryIds: libraryIds ? String(libraryIds).split(',').map(Number) : undefined,
      makerIds: makerIds ? String(makerIds).split(',').map(Number) : undefined,
      genreIds: genreIds ? String(genreIds).split(',').map(Number) : undefined,
      tagIds: tagIds ? String(tagIds).split(',').map(Number) : undefined,
      scraped: scraped === 'true' ? true : scraped === 'false' ? false : undefined,
    })
    res.send(result)
  } catch (err) {
    next(err)
  }
})
```

- [ ] **步骤 3：验证筛选接口**

用 curl 或浏览器测试：
- `GET /games?scraped=false` — 应只返回未爬取的游戏
- `GET /games?scraped=true` — 应只返回已爬取的游戏
- `GET /games?libraryIds=1` — 应只返回指定库的游戏

- [ ] **步骤 4：Commit**

```bash
git add server/database/db.js server/routes/game.js
git commit -m "feat: extend GET /games with filter params (libraryIds, makerIds, genreIds, tagIds, scraped)"
```

---

### 任务 3：前端 — 创建 FilterDialog 组件

**文件：**
- 创建：`src/components/FilterDialog.vue`

- [ ] **步骤 1：创建 FilterDialog.vue**

```vue
<template>
  <q-dialog v-model="show" persistent>
    <q-card style="min-width: 400px; max-width: 500px;">
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle2">筛选</div>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section style="max-height: 60vh; overflow-y: auto;">
        <q-expansion-item label="游戏库" dense-toggle>
          <div v-if="librariesLoading" class="text-center q-pa-sm">
            <q-spinner-dots size="20px" color="primary" />
          </div>
          <div v-else>
            <q-input v-model="librarySearch" dense outlined placeholder="搜索..." class="q-mb-xs" />
            <q-checkbox
              v-for="lib in filteredLibraries"
              :key="lib.id"
              v-model="localFilter.libraryIds"
              :val="lib.id"
              :label="lib.name"
              dense
            />
            <div v-if="filteredLibraries.length === 0" class="text-caption text-grey q-ml-sm">无匹配</div>
          </div>
        </q-expansion-item>

        <q-expansion-item label="制作者" dense-toggle>
          <div v-if="makersLoading" class="text-center q-pa-sm">
            <q-spinner-dots size="20px" color="primary" />
          </div>
          <div v-else>
            <q-input v-model="makerSearch" dense outlined placeholder="搜索..." class="q-mb-xs" />
            <q-checkbox
              v-for="m in filteredMakers"
              :key="m.id"
              v-model="localFilter.makerIds"
              :val="m.id"
              :label="m.name"
              dense
            />
            <div v-if="filteredMakers.length === 0" class="text-caption text-grey q-ml-sm">无匹配</div>
          </div>
        </q-expansion-item>

        <q-expansion-item label="类型" dense-toggle>
          <div v-if="genresLoading" class="text-center q-pa-sm">
            <q-spinner-dots size="20px" color="primary" />
          </div>
          <div v-else>
            <q-checkbox
              v-for="g in genres"
              :key="g.id"
              v-model="localFilter.genreIds"
              :val="g.id"
              :label="g.name"
              dense
            />
          </div>
        </q-expansion-item>

        <q-expansion-item label="标签" dense-toggle>
          <div v-if="tagsLoading" class="text-center q-pa-sm">
            <q-spinner-dots size="20px" color="primary" />
          </div>
          <div v-else>
            <q-input v-model="tagSearch" dense outlined placeholder="搜索..." class="q-mb-xs" />
            <q-checkbox
              v-for="t in filteredTags"
              :key="t.id"
              v-model="localFilter.tagIds"
              :val="t.id"
              :label="t.name"
              dense
            />
            <div v-if="filteredTags.length === 0" class="text-caption text-grey q-ml-sm">无匹配</div>
          </div>
        </q-expansion-item>

        <q-expansion-item label="爬取状态" dense-toggle default-opened>
          <q-radio v-model="localFilter.scraped" val="all" label="全部" dense />
          <q-radio v-model="localFilter.scraped" val="yes" label="已爬取" dense />
          <q-radio v-model="localFilter.scraped" val="no" label="未爬取" dense />
        </q-expansion-item>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="重置" @click="resetFilter" />
        <q-btn color="primary" label="应用" @click="applyFilter" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import api from '../composables/useApi'

interface FilterState {
  libraryIds: number[]
  makerIds: number[]
  genreIds: number[]
  tagIds: number[]
  scraped: 'all' | 'yes' | 'no'
}

const props = defineProps<{
  modelValue: boolean
  filter: FilterState
}>()

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  'apply': [filter: FilterState]
}>()

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const localFilter = ref<FilterState>({ libraryIds: [], makerIds: [], genreIds: [], tagIds: [], scraped: 'all' })

const libraries = ref<{ id: number; name: string; path: string }[]>([])
const makers = ref<{ id: number; name: string }[]>([])
const genres = ref<{ id: number; name: string }[]>([])
const tags = ref<{ id: number; name: string }[]>([])

const librariesLoading = ref(false)
const makersLoading = ref(false)
const genresLoading = ref(false)
const tagsLoading = ref(false)

const librarySearch = ref('')
const makerSearch = ref('')
const tagSearch = ref('')

const filteredLibraries = computed(() => {
  if (!librarySearch.value) return libraries.value
  const q = librarySearch.value.toLowerCase()
  return libraries.value.filter(l => l.name.toLowerCase().includes(q))
})

const filteredMakers = computed(() => {
  if (!makerSearch.value) return makers.value
  const q = makerSearch.value.toLowerCase()
  return makers.value.filter(m => m.name.toLowerCase().includes(q))
})

const filteredTags = computed(() => {
  if (!tagSearch.value) return tags.value
  const q = tagSearch.value.toLowerCase()
  return tags.value.filter(t => t.name.toLowerCase().includes(q))
})

const loadLibraries = async () => {
  if (libraries.value.length > 0) return
  librariesLoading.value = true
  try {
    const res = await api.get('/libraries')
    libraries.value = res.data
  } finally {
    librariesLoading.value = false
  }
}

const loadMakers = async () => {
  if (makers.value.length > 0) return
  makersLoading.value = true
  try {
    const res = await api.get('/games/makers')
    makers.value = res.data
  } finally {
    makersLoading.value = false
  }
}

const loadGenres = async () => {
  if (genres.value.length > 0) return
  genresLoading.value = true
  try {
    const res = await api.get('/games/genres')
    genres.value = res.data
  } finally {
    genresLoading.value = false
  }
}

const loadTags = async () => {
  if (tags.value.length > 0) return
  tagsLoading.value = true
  try {
    const res = await api.get('/games/tags')
    tags.value = res.data
  } finally {
    tagsLoading.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    localFilter.value = {
      libraryIds: [...props.filter.libraryIds],
      makerIds: [...props.filter.makerIds],
      genreIds: [...props.filter.genreIds],
      tagIds: [...props.filter.tagIds],
      scraped: props.filter.scraped,
    }
    librarySearch.value = ''
    makerSearch.value = ''
    tagSearch.value = ''
    void loadLibraries()
    void loadMakers()
    void loadGenres()
    void loadTags()
  }
})

const resetFilter = () => {
  localFilter.value = { libraryIds: [], makerIds: [], genreIds: [], tagIds: [], scraped: 'all' }
}

const applyFilter = () => {
  emit('apply', { ...localFilter.value, libraryIds: [...localFilter.value.libraryIds], makerIds: [...localFilter.value.makerIds], genreIds: [...localFilter.value.genreIds], tagIds: [...localFilter.value.tagIds] })
  show.value = false
}
</script>
```

- [ ] **步骤 2：验证组件无语法错误**

运行 `npx vue-tsc --noEmit` 确认无类型错误。

- [ ] **步骤 3：Commit**

```bash
git add src/components/FilterDialog.vue
git commit -m "feat: add FilterDialog component"
```

---

### 任务 4：前端 — GameLibPage 集成筛选 + sticky 工具栏

**文件：**
- 修改：`src/pages/GameLibPage.vue`

- [ ] **步骤 1：添加筛选状态和 FilterDialog 引用**

在 `<script setup>` 中添加：

```typescript
import FilterDialog from '../components/FilterDialog.vue'

interface FilterState {
  libraryIds: number[]
  makerIds: number[]
  genreIds: number[]
  tagIds: number[]
  scraped: 'all' | 'yes' | 'no'
}

const showFilter = ref(false)
const currentFilter = ref<FilterState>({ libraryIds: [], makerIds: [], genreIds: [], tagIds: [], scraped: 'all' })

const activeFilterCount = computed(() => {
  const f = currentFilter.value
  let count = 0
  if (f.libraryIds.length > 0) count++
  if (f.makerIds.length > 0) count++
  if (f.genreIds.length > 0) count++
  if (f.tagIds.length > 0) count++
  if (f.scraped !== 'all') count++
  return count
})

const onApplyFilter = (filter: FilterState) => {
  currentFilter.value = filter
  page.value = 1
  void loadGames()
}
```

- [ ] **步骤 2：修改 loadGames 传递筛选参数**

将 `loadGames` 改为：

```typescript
const loadGames = async () => {
  loading.value = true
  try {
    const f = currentFilter.value
    const params: Record<string, string | number> = {
      page: page.value,
      pageSize,
    }
    if (keyword.value) params.keyword = keyword.value
    if (f.libraryIds.length > 0) params.libraryIds = f.libraryIds.join(',')
    if (f.makerIds.length > 0) params.makerIds = f.makerIds.join(',')
    if (f.genreIds.length > 0) params.genreIds = f.genreIds.join(',')
    if (f.tagIds.length > 0) params.tagIds = f.tagIds.join(',')
    if (f.scraped === 'yes') params.scraped = 'true'
    else if (f.scraped === 'no') params.scraped = 'false'

    const res = await api.get('/games', { params })
    games.value = res.data.games
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}
```

- [ ] **步骤 3：修改模板 — 添加筛选按钮 + FilterDialog + sticky 工具栏**

将模板中操作栏 `<div class="row items-center q-mb-md q-gutter-sm">` 改为 `<div class="row items-center q-mb-md q-gutter-sm toolbar-sticky">`。

在搜索输入框后面、Scan & Scrape 按钮前面，添加筛选按钮：

```html
<q-btn
  flat
  icon="filter_list"
  label="筛选"
  @click="showFilter = true"
>
  <q-badge v-if="activeFilterCount > 0" color="orange" floating>{{ activeFilterCount }}</q-badge>
</q-btn>
```

在 `</q-page>` 之前、ScannerDialog 之后添加：

```html
<FilterDialog
  v-model="showFilter"
  :filter="currentFilter"
  @apply="onApplyFilter"
/>
```

- [ ] **步骤 4：添加 sticky CSS**

在 `<style scoped>` 中添加：

```css
.toolbar-sticky {
  position: sticky;
  top: 0;
  z-index: 100;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  padding: 16px;
  margin: -16px;
  margin-bottom: 16px;
}
```

注意：需要将外层 `<div class="q-pa-md">` 的 padding 调整，让 sticky 元素能正确贴合顶部。将外层 div 改为 `<div ref="gridContainer">`，把 `q-pa-md` 的 padding 移到内部非 sticky 的内容区域。

具体做法：外层 div 改为 `<div ref="gridContainer">`（无 padding），sticky 工具栏自带 padding，游戏网格区域加 `q-pa-md`。

- [ ] **步骤 5：验证页面功能**

运行 `npx vue-tsc --noEmit` 确认无类型错误。启动开发服务器，验证：
1. 搜索栏滚动时固定在顶部
2. 筛选按钮点击弹出弹窗
3. 选择筛选条件后点应用，列表正确过滤

- [ ] **步骤 6：Commit**

```bash
git add src/pages/GameLibPage.vue
git commit -m "feat: integrate FilterDialog and sticky toolbar in GameLibPage"
```

---

### 任务 5：前端 — GameCard 空白封面占位图标

**文件：**
- 修改：`src/components/GameCard.vue`

- [ ] **步骤 1：修改模板，空封面时显示占位图标**

将 `<q-img>` 部分替换为条件渲染：

```html
<q-img
  v-if="game.cover_path"
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
<div v-else class="game-cover game-cover--placeholder flex flex-center bg-grey-4 text-grey-6">
  <q-icon name="videogame_asset" size="48px" />
  <div v-if="selectable && selected" class="absolute-top-left q-pa-xs">
    <q-icon name="check_circle" color="primary" size="24px" />
  </div>
</div>
```

- [ ] **步骤 2：添加占位样式**

在 `<style scoped>` 中添加：

```css
.game-cover--placeholder {
  position: relative;
}
```

- [ ] **步骤 3：验证**

运行 `npx vue-tsc --noEmit`。查看列表页，未爬取的游戏应显示灰色背景 + 游戏手柄图标。

- [ ] **步骤 4：Commit**

```bash
git add src/components/GameCard.vue
git commit -m "feat: add placeholder icon for games without cover"
```

---

### 任务 6：前端 — ScrapeDialog Adopt 按钮移至底部 Action 栏

**文件：**
- 修改：`src/components/ScrapeDialog.vue`

- [ ] **步骤 1：从右侧详情区移除 Adopt 按钮**

删除右侧详情区中的：

```html
<div class="row justify-end q-mt-md">
  <q-btn color="positive" label="Adopt" @click="adopt" :disable="!selectedResult" />
</div>
```

- [ ] **步骤 2：在 q-card 底部添加 q-card-actions**

在 `</q-card-section>` 和 `</q-card>` 之间添加：

```html
<q-card-actions align="right" class="bg-grey-1 q-px-md q-py-sm">
  <q-btn color="positive" label="Adopt" @click="adopt" :disable="!selectedResult" />
</q-card-actions>
```

- [ ] **步骤 3：验证**

运行 `npx vue-tsc --noEmit`。打开 ScrapeDialog，确认：
1. Adopt 按钮出现在弹窗底部右侧
2. 右侧详情区不再有 Adopt 按钮
3. 点击 Adopt 功能正常

- [ ] **步骤 4：Commit**

```bash
git add src/components/ScrapeDialog.vue
git commit -m "feat: move Adopt button to bottom action bar in ScrapeDialog"
```

---

### 任务 7：最终验证

- [ ] **步骤 1：运行 ESLint**

```bash
npx eslint src/components/FilterDialog.vue src/components/GameCard.vue src/components/ScrapeDialog.vue src/pages/GameLibPage.vue
```

预期：0 errors, 0 warnings

- [ ] **步骤 2：运行 vue-tsc**

```bash
npx vue-tsc --noEmit
```

预期：0 errors

- [ ] **步骤 3：手动端到端验证**

1. 打开游戏列表页，确认搜索栏 sticky 生效
2. 点击筛选按钮，打开弹窗，选择条件后应用，确认列表过滤正确
3. 确认未爬取游戏显示占位图标
4. 打开 ScrapeDialog，确认 Adopt 按钮在底部