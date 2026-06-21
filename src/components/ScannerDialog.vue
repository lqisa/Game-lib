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
            :disable="adoptedCount === 0 && staleCount === 0"
            :loading="submitting"
          >
            <q-badge v-if="adoptedCount > 0" color="white" text-color="positive" floating>{{ adoptedCount }}</q-badge>
          </q-btn>
          <q-badge v-if="staleCount > 0" color="negative" class="text-body2">
            {{ staleCount }} 待删除
          </q-badge>
          <q-badge v-else-if="scanResults.length > 0" color="grey-7" class="text-body2">
            {{ scanResults.length }} unscraped
          </q-badge>
        </div>

        <q-virtual-scroll
          :items="scanResults"
          virtual-scroll-horizontal
          style="max-height: 70vh"
          class="q-virtual-scroll--with-horizontal"
        >
          <template v-slot="{ item: row }">
            <div class="row items-center q-py-sm q-px-md" :class="{ 'bg-grey-2': row.status === 'stale' }">
              <div class="col-auto q-mr-sm" style="width: 40px; height: 40px; flex-shrink: 0">
                <q-img
                  v-if="row.searchResult?.coverUrl"
                  :src="row.searchResult.coverUrl"
                  width="40px"
                  height="40px"
                  fit="cover"
                  style="border-radius: 4px"
                >
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

              <div class="col" style="min-width: 0">
                <div class="row items-center no-wrap">
                  <span class="text-body2 ellipsis">{{ row.name }}</span>
                  <q-icon
                    name="folder_open"
                    size="xs"
                    color="grey"
                    class="q-ml-xs cursor-pointer"
                    @click="openFolder(row)"
                  >
                    <q-tooltip>打开目录</q-tooltip>
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

              <div class="col-auto q-ml-sm" style="flex-shrink: 0">
                <q-badge v-if="row.status === 'adopted'" color="positive">Adopted</q-badge>
                <q-badge v-else-if="row.status === 'searching'" color="warning">Searching...</q-badge>
                <q-badge v-else-if="row.status === 'error'" color="negative">Failed</q-badge>
                <q-badge v-else-if="row.status === 'searched'" color="blue">Searched</q-badge>
                <q-badge v-else-if="row.status === 'stale'" color="negative">待删除</q-badge>
                <q-badge v-else color="grey">Pending</q-badge>
              </div>

              <div class="col-auto q-ml-sm" style="flex-shrink: 0; min-width: 120px; text-align: right">
                <template v-if="row.status === 'stale'">
                  <span class="text-grey-5 text-italic text-caption">目录已不存在</span>
                </template>
                <template v-else-if="row.status === 'pending' || row.status === 'error'">
                  <q-btn size="sm" color="primary" label="Scrape" @click="openScrapeDialog(row)" />
                </template>
                <template v-else-if="row.status === 'searched'">
                  <q-btn size="sm" color="primary" flat label="重选" @click="openScrapeDialog(row)" />
                  <q-btn size="sm" color="positive" label="Adopt" :loading="row.loading" @click="quickAdopt(row)" class="q-ml-xs" />
                  <q-btn size="sm" color="negative" flat icon="cancel" class="q-ml-xs" @click="discardRow(row)">
                    <q-tooltip>取消</q-tooltip>
                  </q-btn>
                </template>
                <template v-else-if="row.status === 'adopted'">
                  <q-btn size="sm" color="primary" flat label="重选" @click="openScrapeDialog(row)" />
                  <q-btn size="sm" color="negative" flat icon="cancel" class="q-ml-xs" @click="discardRow(row)">
                    <q-tooltip>取消</q-tooltip>
                  </q-btn>
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
      @segments-loaded="onSegmentsLoaded"
    />
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import api from '../composables/useApi'
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
const segmentsCache = new Map<string, string[]>()

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

  const names = scanResults.value.map(r => r.name)
  if (names.length === 0) return

  try {
    const segRes = await api.post('/scraper/dlsite/segments/batch', { names })
    const segResults: { name: string; keyword: string; segments: string[] }[] = segRes.data.results
    for (const sr of segResults) {
      const row = scanResults.value.find(r => r.name === sr.name)
      if (row) {
        row.searchKeyword = sr.keyword
        segmentsCache.set(sr.name, [sr.keyword, ...sr.segments.filter((s: string) => s !== sr.keyword)])
      }
    }
  } catch {
    // keep raw names as keywords
  }
}

const onLibraryChange = () => {
  searchCache.clear()
  segmentsCache.clear()
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

const onSegmentsLoaded = (name: string, segments: string[]) => {
  segmentsCache.set(name, segments)
}

const quickAdopt = async (row: ScanRow) => {
  if (!row.searchResult) return
  row.loading = true
  try {
    const fetchBody = row.source === 'dlsite'
      ? { rjcode: row.searchResult.id }
      : { id: row.searchResult.id }
    const detailRes = await api.post(`/scraper/${row.source || 'dlsite'}/fetch`, fetchBody)
    const detail = detailRes.data
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
    row.status = 'error'
  } finally {
    row.loading = false
  }
}

const discardRow = (row: ScanRow) => {
  row.status = 'pending'
  row.searchResult = null
  row.adoptData = null
  row.source = null
  row.searchKeyword = row.name.match(/RJ\d+/)?.[0] || row.name
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
  void (window as any).electronAPI.openPath(fullPath)
}

watch(modelValue, (val) => {
  if (val) {
    searchCache.clear()
    segmentsCache.clear()
    void fetchSettings().then(() => fetchLibraries()).then(() => loadUnscraped())
  }
})
</script>