<template>
  <q-page>
    <div class="row items-center q-gutter-sm q-px-md q-py-sm toolbar-sticky">
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
      <q-btn
        flat
        icon="filter_list"
        label="Filter"
        @click="showFilter = true"
      >
        <q-badge v-if="activeFilterCount > 0" color="orange" floating>{{ activeFilterCount }}</q-badge>
      </q-btn>
      <q-select
        v-model="sortBy"
        :options="sortOptions"
        dense
        outlined
        emit-value
        map-options
        style="min-width: 140px"
      />
      <q-btn
        flat
        round
        :icon="sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'"
        @click="toggleSortOrder"
      />
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
          @click="confirmDeleteDialog = true"
        />
        <span class="text-caption text-grey">{{ selectedIds.size }} selected</span>
      </template>
    </div>

    <div ref="gridContainer" class="q-pa-md" style="position: relative;">
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

        <div v-if="loading && games.length > 0" class="flex flex-center q-pa-md">
          <q-spinner-dots size="32px" color="primary" />
        </div>
    </div>

    <ScannerDialog v-model="showScanner" @done="loadGames" />
    <FilterDialog v-model="showFilter" :filter="currentFilter" @apply="onApplyFilter" />

    <q-dialog v-model="confirmDeleteDialog" persistent>
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../composables/useApi'
import GameCard from '../components/GameCard.vue'
import ScannerDialog from '../components/ScannerDialog.vue'
import FilterDialog from '../components/FilterDialog.vue'

interface GameItem {
  id: number; name: string; cover_path: string | null
  library_name: string; library_id: number; sub_path: string
  library_path: string
}

interface FilterState {
  libraryIds: number[]
  makerIds: number[]
  genreIds: number[]
  tagIds: number[]
  scraped: 'all' | 'yes' | 'no'
}

const router = useRouter()
const games = ref<GameItem[]>([])
const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = 24
const total = ref(0)
const showScanner = ref(false)

const showFilter = ref(false)
const currentFilter = ref<FilterState>({ libraryIds: [], makerIds: [], genreIds: [], tagIds: [], scraped: 'yes' })

const sortBy = ref('updated_at')
const sortOrder = ref<'asc' | 'desc'>('desc')
const sortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Date Added', value: 'created_at' },
  { label: 'Date Updated', value: 'updated_at' },
]

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  page.value = 1
  games.value = []
  void loadGames()
}

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
  games.value = []
  void loadGames()
}

const selectMode = ref(false)
const selectedIds = ref<Set<number>>(new Set())
const lastSelectedId = ref<number | null>(null)
const confirmDeleteDialog = ref(false)

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

const doBatchDelete = async () => {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  await api.post('/games/batch-delete', { ids })
  confirmDeleteDialog.value = false
  exitSelectMode()
  await loadGames()
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && selectMode.value) {
    exitSelectMode()
  }
}

const hasMore = computed(() => games.value.length < total.value)

const loadGames = async (append = false) => {
  if (loading.value) return
  if (!append) {
    page.value = 1
    window.scrollTo(0, 0)
  }
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
    params.sortBy = sortBy.value
    params.sortOrder = sortOrder.value

    const res = await api.get('/games', { params })
    if (append) {
      games.value = [...games.value, ...res.data.games]
    } else {
      games.value = res.data.games
    }
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

const loadMore = () => {
  if (!hasMore.value || loading.value) return
  page.value++
  void loadGames(true)
}

const onScroll = () => {
  const el = document.documentElement
  const threshold = 200
  if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
    loadMore()
  }
}

const searchGames = () => {
  page.value = 1
  games.value = []
  void loadGames()
}

watch(sortBy, () => {
  page.value = 1
  games.value = []
  void loadGames()
})

onMounted(() => {
  void loadGames()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onScroll)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onScroll)
})
</script>

<style scoped>
.toolbar-sticky {
  position: sticky;
  top: 50px;
  z-index: 100;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}
.drag-select-rect {
  position: absolute;
  border: 2px dashed #1976d2;
  background: rgba(25, 118, 210, 0.1);
  pointer-events: none;
  z-index: 1000;
}
</style>