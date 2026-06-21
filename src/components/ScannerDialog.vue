<template>
  <q-dialog v-model="modelValue" persistent maximized>
    <q-card class="column">
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle1">Scan & Scrape</div>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section class="q-pa-md col" style="position: relative; overflow: hidden">
        <q-inner-loading :showing="scanning" label="Scanning..." label-class="text-grey-8" />
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
            label="Submit"
            @click="submitAdopted"
            :disable="adoptedCount === 0 && staleCount === 0"
            :loading="submitting"
          >
            <q-badge v-if="adoptedCount > 0" color="white" text-color="positive" floating>{{ adoptedCount }}</q-badge>
          </q-btn>
          <q-badge v-if="staleCount > 0" color="negative" class="text-body2">
            {{ staleCount }} to delete
          </q-badge>
          <q-badge v-else-if="scanResults.length > 0" color="grey-7" class="text-body2">
            {{ scanResults.length }} unscraped
          </q-badge>
          <q-space />
          <q-select
            v-model="sortBy"
            :options="sortOptions"
            dense
            outlined
            emit-value
            map-options
            style="min-width: 120px"
          />
          <q-btn
            flat
            round
            :icon="sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'"
            @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          />
        </div>

        <q-virtual-scroll
          :items="sortedResults"
          style="height: calc(100vh - 130px)"
        >
          <template v-slot="{ item: row }">
            <div class="scan-row q-py-sm q-px-md" :class="{ 'bg-grey-2': row.status === 'stale' }">
              <div class="scan-row__cover">
                <q-img
                  v-if="row.searchResult?.coverUrl"
                  :src="row.searchResult.coverUrl"
                  width="40px"
                  height="40px"
                  fit="cover"
                  style="border-radius: 4px"
                  class="cursor-pointer"
                >
                  <q-menu anchor="top left" self="top left" :offset="[8, 0]" transition-show="fade" transition-hide="fade">
                    <q-img
                      :src="row.searchResult.coverUrl"
                      style="width: 240px; border-radius: 4px"
                      fit="contain"
                    />
                  </q-menu>
                  <template v-slot:error>
                    <div class="bg-grey-3 flex flex-center full-height" style="border-radius: 4px">
                      <q-icon name="image" size="16px" color="grey" />
                    </div>
                  </template>
                </q-img>
                <div v-else class="bg-grey-3 flex flex-center" style="width: 40px; height: 40px; border-radius: 4px">
                  <q-icon name="folder" size="16px" color="grey" />
                </div>
              </div>

              <div class="scan-row__info">
                <div class="row items-center no-wrap">
                  <span class="text-body2 ellipsis">{{ row.name }}</span>
                  <q-icon
                    name="folder_open"
                    size="xs"
                    color="grey"
                    class="q-ml-xs cursor-pointer"
                    @click="openFolder(row)"
                  >
                    <q-tooltip>Open Folder</q-tooltip>
                  </q-icon>
                </div>
                <div v-if="row.searchResult" class="row items-center no-wrap q-mt-xs">
                  <q-badge
                    v-if="row.source"
                    :color="sourceColor(row.source)"
                    class="q-mr-xs"
                    label-style="font-size:10px"
                  >{{ row.source }}</q-badge>
                  <span class="text-caption ellipsis">{{ row.searchResult.name }}</span>
                  <span class="text-caption text-grey q-ml-sm" style="flex-shrink: 0">{{ row.searchResult.id }}</span>
                </div>
              </div>

              <div class="scan-row__status">
                <q-badge v-if="row.status === 'adopted'" color="positive">Adopted</q-badge>
                <q-badge v-else-if="row.status === 'searching'" color="warning">Searching...</q-badge>
                <q-badge v-else-if="row.status === 'error'" color="negative">Failed</q-badge>
                <q-badge v-else-if="row.status === 'searched'" color="blue">Searched</q-badge>
                <q-badge v-else-if="row.status === 'stale'" color="negative">Stale</q-badge>
                <q-badge v-else color="grey">Pending</q-badge>
              </div>

              <div class="scan-row__actions">
                <template v-if="row.status === 'stale'">
                  <span class="text-grey-5 text-italic text-caption">Directory not found</span>
                </template>
                <template v-else>
                  <q-btn
                    size="sm"
                    color="primary"
                    label="Reselect"
                    flat
                    :disable="row.status === 'searching'"
                    @click="openScrapeDialog(row)"
                    style="min-width: 56px"
                  />
                  <q-btn
                    v-if="row.status === 'pending' || row.status === 'error'"
                    size="sm"
                    color="primary"
                    label="Scrape"
                    @click="openScrapeDialog(row)"
                    class="q-ml-xs"
                    style="min-width: 64px"
                  />
                  <q-btn
                    v-else-if="row.status === 'searched'"
                    size="sm"
                    color="positive"
                    label="Adopt"
                    :loading="row.loading"
                    @click="quickAdopt(row)"
                    class="q-ml-xs"
                    style="min-width: 64px"
                  />
                  <q-btn
                    v-else-if="row.status === 'adopted'"
                    size="sm"
                    color="negative"
                    label="Cancel"
                    @click="discardRow(row)"
                    class="q-ml-xs"
                    style="min-width: 64px"
                  />
                </template>
              </div>
            </div>
            <q-separator />
          </template>
        </q-virtual-scroll>
      </q-card-section>
    </q-card>

    <ScrapeDialog
      v-model="showScrapeDialog"
      :game-name="scrapingRow?.name || ''"
      :game-id="scrapingRow?.gameId || 0"
      :default-keyword="scrapingRow?.searchKeyword"
      :default-source="scrapingRow?.source || undefined"
      :initial-results="scrapingRow ? (searchCache.get(cacheKey(scrapingRow)) || null) : null"
      :initial-segments="scrapingRow ? (segmentsCache.get(scrapingRow.name) || null) : null"
      @adopted="onAdopted"
      @searched="onSearched"
    />
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import api from '../composables/useApi'
import { splitKeyword, segmentsCache } from '../composables/useSplitKeyword'
import ScrapeDialog from './ScrapeDialog.vue'

type SourceType = 'dlsite' | 'bangumi' | 'vndb'

interface SearchResult {
  id: string
  name: string
  makerName: string
  coverUrl: string
}

interface DetailResult {
  id: string
  title: string
  coverURL: string
  makers: string[]
  genres: string[]
  tags: string[]
  description: string
}

interface AdoptData {
  source: SourceType
  sourceId: string
  name: string
  makerName: string
  coverUrl: string
  detail: DetailResult
}

interface ScanRow {
  gameId: number
  name: string
  subPath: string
  status: 'pending' | 'searching' | 'searched' | 'adopted' | 'error' | 'stale'
  searchResult: SearchResult | null
  adoptData: AdoptData | null
  searchKeyword: string
  source: SourceType | null
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

const searchCache = new Map<string, SearchResult[]>()
const detailCache = new Map<string, DetailResult>()

const cacheKey = (row: ScanRow) => `${row.source || 'auto'}:${row.searchKeyword}`

const sourceColor = (source: SourceType) => {
  if (source === 'dlsite') return 'deep-purple'
  if (source === 'bangumi') return 'orange'
  if (source === 'vndb') return 'cyan'
  return 'grey'
}

const getSourceUrl = (source: SourceType, sourceId: string): string => {
  if (source === 'dlsite') return `https://www.dlsite.com/maniax/work/=/product_id/RJ${sourceId}.html`
  if (source === 'bangumi') return `https://bgm.tv/subject/${sourceId}`
  if (source === 'vndb') return `https://vndb.org/${sourceId}`
  return ''
}

const sortBy = ref<'status' | 'action'>('status')
const sortOrder = ref<'asc' | 'desc'>('asc')
const sortOptions = [
  { label: 'Status', value: 'status' },
  { label: 'Action', value: 'action' },
]

const statusOrder: Record<ScanRow['status'], number> = {
  stale: 0,
  error: 1,
  pending: 2,
  searching: 3,
  searched: 4,
  adopted: 5,
}

const actionOrder: Record<ScanRow['status'], number> = {
  pending: 0,
  error: 1,
  searched: 2,
  searching: 3,
  adopted: 4,
  stale: 5,
}

const sortedResults = computed(() => {
  const order = sortBy.value === 'status' ? statusOrder : actionOrder
  const sorted = [...scanResults.value].sort((a, b) => order[a.status] - order[b.status])
  return sortOrder.value === 'desc' ? sorted.reverse() : sorted
})

const hasPending = computed(() => scanResults.value.some(r => r.status === 'pending' || r.status === 'error'))
const adoptedCount = computed(() => scanResults.value.filter(r => r.status === 'adopted').length)
const staleCount = computed(() => scanResults.value.filter(r => r.status === 'stale').length)

let scrapeConcurrency = 4

const fetchSettings = async () => {
  try {
    const res = await api.get('/settings/scrape_concurrency')
    scrapeConcurrency = parseInt(res.data.value, 10) || 4
  } catch {
    scrapeConcurrency = 4
  }
}

const fetchLibraries = async () => {
  const res = await api.get('/libraries')
  libraries.value = res.data
  if (!selectedLibrary.value && libraries.value.length > 0) {
    selectedLibrary.value = libraries.value[0]!.id
  }
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
    searchKeyword: g.name,
    source: null as SourceType | null,
    loading: false,
    gameId: g.id,
  }))

  for (const row of scanResults.value) {
    const { keyword, segments } = splitKeyword(row.name)
    row.searchKeyword = keyword
    segmentsCache.set(row.name, [keyword, ...segments.filter(s => s !== keyword)])
  }
}

const onLibraryChange = () => {
  searchCache.clear()
  segmentsCache.clear()
  detailCache.clear()
  void loadUnscraped()
}

const scanDir = async () => {
  if (!selectedLibrary.value) return
  scanning.value = true
  try {
    const res = await api.post('/games/scan', { libraryId: selectedLibrary.value })
    const newDirs: string[] = res.data.newDirs
    const removedGames: { id: number; name: string; sub_path: string }[] = res.data.removedGames || []

    if (newDirs.length > 0) {
      await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: newDirs,
      })
    }

    await loadUnscraped()

    const removedIds = new Set(removedGames.map(g => g.id))
    for (const row of scanResults.value) {
      if (removedIds.has(row.gameId)) {
        row.status = 'stale'
      }
    }
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
  detailCache.set(`${data.source}:${data.sourceId}`, data.detail)
  scrapingRow.value.searchResult = {
    id: data.sourceId,
    name: data.name,
    makerName: data.makerName,
    coverUrl: data.coverUrl,
  }
  scrapingRow.value.adoptData = data
  scrapingRow.value.source = data.source
  scrapingRow.value.status = 'adopted'
}

const onSearched = (source: SourceType, keyword: string, results: SearchResult[]) => {
  searchCache.set(`${source}:${keyword}`, results)
}

const quickAdopt = async (row: ScanRow) => {
  if (!row.searchResult) return
  const dKey = `${row.source || 'dlsite'}:${row.searchResult.id}`
  const cached = detailCache.get(dKey)
  if (cached) {
    row.adoptData = {
      source: row.source || 'dlsite',
      sourceId: row.searchResult.id,
      name: row.searchResult.name,
      makerName: row.searchResult.makerName,
      coverUrl: row.searchResult.coverUrl,
      detail: cached,
    }
    row.status = 'adopted'
    return
  }
  row.loading = true
  try {
    const fetchBody = row.source === 'dlsite'
      ? { rjcode: row.searchResult.id }
      : { id: row.searchResult.id }
    const detailRes = await api.post(`/scraper/${row.source || 'dlsite'}/fetch`, fetchBody)
    const detail: DetailResult = detailRes.data || {
      id: row.searchResult.id,
      title: row.searchResult.name,
      coverURL: '',
      makers: [],
      genres: [],
      tags: [],
      description: '',
    }
    if (!detail.coverURL && row.searchResult.coverUrl) {
      detail.coverURL = row.searchResult.coverUrl
    }
    if (!detail.title && row.searchResult.name) {
      detail.title = row.searchResult.name
    }
    detailCache.set(dKey, detail)
    row.adoptData = {
      source: row.source || 'dlsite',
      sourceId: row.searchResult.id,
      name: row.searchResult.name,
      makerName: row.searchResult.makerName,
      coverUrl: row.searchResult.coverUrl,
      detail,
    }
    row.status = 'adopted'
  } catch {
    const sr = row.searchResult
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
    row.loading = false
  }
}

const discardRow = (row: ScanRow) => {
  row.adoptData = null
  if (row.status === 'adopted') {
    row.status = row.searchResult ? 'searched' : 'pending'
  } else {
    row.status = 'pending'
    row.searchResult = null
    row.source = null
    row.searchKeyword = row.name.match(/RJ\d+/)?.[0] || row.name
  }
}

const batchScrape = async () => {
  const rows = [...scanResults.value].filter(r => r.status === 'pending' || r.status === 'error')
  const limit = scrapeConcurrency

  for (let i = 0; i < rows.length; i += limit) {
    const chunk = rows.slice(i, i + limit)
    await Promise.all(chunk.map(async (row) => {
      row.status = 'searching'
      row.loading = true
      try {
        const keyword = row.searchKeyword || row.name
        const autoKey = `auto:${keyword}`
        const cached = searchCache.get(autoKey)
        if (cached) {
          if (cached.length > 0) {
            row.searchResult = cached[0] ?? null
            row.status = 'searched'
          } else {
            row.status = 'error'
          }
        } else {
          const searchRes = await api.post('/scraper/auto/search', { keyword, name: row.name })
          const data = searchRes.data
          const results: SearchResult[] = data.results ?? []
          row.source = data.source || null
          searchCache.set(autoKey, results)
          if (data.source) {
            searchCache.set(`${data.source}:${keyword}`, results)
          }
          if (results.length > 0) {
            row.searchResult = results[0] ?? null
            row.status = 'searched'
          } else {
            row.status = 'error'
          }
        }
      } catch {
        row.status = 'error'
      } finally {
        row.loading = false
      }
    }))
  }
}

const submitAdopted = async () => {
  submitting.value = true
  const adoptedRows = scanResults.value.filter(r => r.status === 'adopted' && r.adoptData)
  const staleRows = scanResults.value.filter(r => r.status === 'stale')
  try {
    if (adoptedRows.length > 0) {
      const games = adoptedRows.map(row => {
        const d = row.adoptData!
        const source = d.source || 'dlsite'
        return {
          gameId: row.gameId,
          sourceType: source,
          sourceId: d.sourceId,
          sourceUrl: getSourceUrl(source, d.sourceId),
          name: d.detail.title,
          coverUrl: d.detail.coverURL,
          makers: d.detail.makers,
          genres: d.detail.genres,
          tags: d.detail.tags,
          description: d.detail.description,
        }
      })
      await api.post('/scraper/adopt/batch', { games })
    }
    for (const row of staleRows) {
      await api.delete(`/games/${row.gameId}`)
    }
    scanResults.value = scanResults.value.filter(r => r.status !== 'adopted' && r.status !== 'stale')
    emit('done')
  } finally {
    submitting.value = false
  }
}

const openFolder = (row: ScanRow) => {
  const lib = libraries.value.find(l => l.id === selectedLibrary.value)
  if (!lib) return
  const fullPath = `${lib.path}\\${row.subPath}`
  void window.electronAPI?.openPath(fullPath)
}

watch(modelValue, (val) => {
  if (val) {
    void fetchSettings().then(() => fetchLibraries()).then(() => loadUnscraped())
  } else {
    searchCache.clear()
    segmentsCache.clear()
    detailCache.clear()
  }
})
</script>

<style scoped>
.scan-row {
  display: grid;
  grid-template-columns: 40px 1fr 60px 140px;
  gap: 0 8px;
  align-items: center;
}
.scan-row__cover {
  flex-shrink: 0;
}
.scan-row__info {
  min-width: 0;
}
.scan-row__status,
.scan-row__actions {
  display: flex;
  align-items: center;
}
</style>