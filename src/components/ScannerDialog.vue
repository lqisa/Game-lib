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