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
          <template v-slot:body-cell-name="props">
            <q-td :props="props" :class="{ 'bg-grey-2': props.row.status === 'stale' }" style="white-space: normal; word-break: break-all;">
              {{ props.row.name }}
            </q-td>
          </template>
          <template v-slot:body-cell-matched="props">
            <q-td :props="props" :class="{ 'bg-grey-2': props.row.status === 'stale' }" style="white-space: normal; word-break: break-all;">
              <div v-if="props.row.searchResult">
                <q-icon name="image" color="primary" size="xs" class="q-mr-xs cursor-pointer">
                  <q-tooltip anchor="center right" self="center left" :offset="[10, 0]">
                    <q-img
                      v-if="props.row.searchResult.coverUrl"
                      :src="props.row.searchResult.coverUrl"
                      style="width: 200px;"
                      fit="contain"
                    >
                      <template v-slot:error>
                        <div class="bg-grey-3 flex flex-center" style="height: 200px;">
                          <q-icon name="broken_image" size="32px" color="grey" />
                        </div>
                      </template>
                    </q-img>
                    <div v-else class="bg-grey-3 flex flex-center" style="width: 200px; height: 200px;">
                      <q-icon name="broken_image" size="32px" color="grey" />
                    </div>
                  </q-tooltip>
                </q-icon>
                <span class="ellipsis" style="max-width: 180px; vertical-align: middle;">
                  {{ props.row.searchResult.name }}
                </span>
                <div class="text-caption text-grey">RJ{{ props.row.searchResult.rjcode }}</div>
              </div>
              <span v-else class="text-grey">—</span>
            </q-td>
          </template>
          <template v-slot:body-cell-status="props">
            <q-td :props="props" :class="{ 'bg-grey-2': props.row.status === 'stale' }">
              <q-badge v-if="props.row.status === 'adopted'" color="positive">Adopted</q-badge>
              <q-badge v-else-if="props.row.status === 'searching'" color="warning">Searching...</q-badge>
              <q-badge v-else-if="props.row.status === 'error'" color="negative">Failed</q-badge>
              <q-badge v-else-if="props.row.status === 'searched'" color="blue">Searched</q-badge>
              <q-badge v-else-if="props.row.status === 'stale'" color="negative">待删除</q-badge>
              <q-badge v-else color="grey">Pending</q-badge>
            </q-td>
          </template>
          <template v-slot:body-cell-actions="props">
            <q-td :props="props" :class="{ 'bg-grey-2': props.row.status === 'stale' }">
              <template v-if="props.row.status === 'stale'">
                <span class="text-grey-5 text-italic" style="font-size: 12px;">目录已不存在</span>
              </template>
              <template v-else-if="props.row.status === 'pending' || props.row.status === 'error'">
                <q-btn size="sm" color="primary" label="Scrape" @click="openScrapeDialog(props.row)" />
              </template>
              <template v-else-if="props.row.status === 'searched'">
                <q-btn size="sm" color="primary" flat label="重选" @click="openScrapeDialog(props.row)" />
                <q-btn size="sm" color="positive" label="Adopt" :loading="props.row.loading" @click="quickAdopt(props.row)" class="q-ml-xs" />
                <q-btn size="sm" color="negative" flat icon="cancel" class="q-ml-xs" @click="discardRow(props.row)">
                  <q-tooltip>取消</q-tooltip>
                </q-btn>
              </template>
              <template v-else-if="props.row.status === 'adopted'">
                <q-btn size="sm" color="primary" flat label="重选" @click="openScrapeDialog(props.row)" />
                <q-btn size="sm" color="negative" flat icon="cancel" class="q-ml-xs" @click="discardRow(props.row)">
                  <q-tooltip>取消</q-tooltip>
                </q-btn>
              </template>
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <ScrapeDialog
      v-model="showScrapeDialog"
      :game-name="scrapingRow?.name || ''"
      :game-id="scrapingRow?.gameId || 0"
      :default-keyword="scrapingRow?.searchKeyword"
      :initial-results="scrapingRow ? (searchCache.get(scrapingRow.searchKeyword) || null) : null"
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
  status: 'pending' | 'searching' | 'searched' | 'adopted' | 'error' | 'stale'
  searchResult: SearchResult | null
  adoptData: AdoptData | null
  searchKeyword: string
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

const hasPending = computed(() => scanResults.value.some(r => r.status === 'pending' || r.status === 'error'))
const adoptedCount = computed(() => scanResults.value.filter(r => r.status === 'adopted').length)
const staleCount = computed(() => scanResults.value.filter(r => r.status === 'stale').length)

const columns = [
  { name: 'name', label: 'Directory', field: 'name', align: 'left' as const, sortable: true, style: 'width: 30%' },
  { name: 'matched', label: 'Matched', field: 'matched', align: 'left' as const, style: 'width: 35%' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' as const, style: 'width: 80px' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' as const, style: 'width: 180px' },
]

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
    searchKeyword: g.name.match(/RJ\d+/)?.[0] || g.name,
    loading: false,
    gameId: g.id,
  }))
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
    rjcode: data.rjcode,
    name: data.name,
    makerName: data.makerName,
    coverUrl: data.coverUrl,
  }
  scrapingRow.value.adoptData = data
  scrapingRow.value.status = 'adopted'
}

const onSearched = (keyword: string, results: SearchResult[]) => {
  searchCache.set(keyword, results)
}

const onSegmentsLoaded = (name: string, segments: string[]) => {
  segmentsCache.set(name, segments)
}

const quickAdopt = async (row: ScanRow) => {
  if (!row.searchResult) return
  row.loading = true
  try {
    const detailRes = await api.post('/scraper/dlsite/fetch', { rjcode: row.searchResult.rjcode })
    const detail = detailRes.data
    row.adoptData = {
      rjcode: row.searchResult.rjcode,
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
  row.searchKeyword = row.name.match(/RJ\d+/)?.[0] || row.name
}

const batchScrape = async () => {
  for (const row of [...scanResults.value]) {
    if (row.status !== 'pending' && row.status !== 'error') continue
    row.status = 'searching'
    row.loading = true
    try {
      const keyword = row.name.match(/RJ\d+/)?.[0] || row.name
      row.searchKeyword = keyword

      let results: SearchResult[]
      const cached = searchCache.get(keyword)
      if (cached) {
        results = cached
      } else {
        const searchRes = await api.post('/scraper/dlsite/search', { keyword })
        const data = searchRes.data
        results = data.results ?? data
        searchCache.set(keyword, results)
      }

      if (results.length > 0) {
        row.searchResult = results[0] ?? null
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
  const staleRows = scanResults.value.filter(r => r.status === 'stale')
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
    for (const row of staleRows) {
      await api.delete(`/games/${row.gameId}`)
    }
    scanResults.value = scanResults.value.filter(r => r.status !== 'adopted' && r.status !== 'stale')
    emit('done')
  } finally {
    submitting.value = false
  }
}

watch(modelValue, (val) => {
  if (val) {
    searchCache.clear()
    segmentsCache.clear()
    void fetchLibraries().then(() => loadUnscraped())
  }
})
</script>