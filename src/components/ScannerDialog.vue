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
          />
          <q-btn color="primary" label="Scan" @click="scanDir" :disable="!selectedLibrary" />
          <q-btn color="secondary" label="Scrape All" @click="batchScrape" :disable="scanResults.length === 0" />
        </div>

        <q-table
          :rows="scanResults"
          :columns="columns"
          row-key="name"
          flat
          bordered
          virtual-scroll
          :rows-per-page-options="[0]"
          style="max-height: 70vh"
        >
          <template v-slot:body-cell-actions="props">
            <q-td :props="props">
              <q-btn
                size="sm"
                color="primary"
                label="Scrape"
                @click="scrapeSingle(props.row)"
                :loading="props.row.loading"
                :disable="props.row.status === 'done'"
              />
            </q-td>
          </template>
          <template v-slot:body-cell-status="props">
            <q-td :props="props">
              <q-badge v-if="props.row.status === 'done'" color="positive">Done</q-badge>
              <q-badge v-else-if="props.row.status === 'loading'" color="warning">Scraping...</q-badge>
              <q-badge v-else-if="props.row.status === 'error'" color="negative">Failed</q-badge>
              <q-badge v-else color="grey">Pending</q-badge>
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import api from '../composables/useApi'

interface ScanRow {
  name: string
  status: 'pending' | 'loading' | 'done' | 'error'
  loading: boolean
  gameId?: number
}

const modelValue = defineModel<boolean | null>({ default: false })
const emit = defineEmits<{ done: [] }>()

const libraries = ref<{ id: number; name: string; path: string }[]>([])
const selectedLibrary = ref<number | null>(null)
const scanResults = ref<ScanRow[]>([])

const columns = [
  { name: 'name', label: 'Game', field: 'name', align: 'left' as const, sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' as const },
  { name: 'status', label: 'Status', field: 'status', align: 'center' as const },
]

const fetchLibraries = async () => {
  const res = await api.get('/libraries')
  libraries.value = res.data
}

const scanDir = async () => {
  if (!selectedLibrary.value) return
  const res = await api.post('/games/scan', { libraryId: selectedLibrary.value })
  const newDirs: string[] = res.data.newDirs
  if (newDirs.length === 0) {
    scanResults.value = []
    return
  }
  await api.post('/games/scan/add', {
    libraryId: selectedLibrary.value,
    dirs: newDirs,
  })
  const gamesRes = await api.get('/games', { params: { pageSize: 9999 } })
  interface GameItem { id: number; name: string; library_id: number; sub_path: string }
  const addedGames = gamesRes.data.games.filter(
    (g: GameItem) => g.library_id === selectedLibrary.value && newDirs.includes(g.sub_path),
  )
  scanResults.value = addedGames.map((g: GameItem) => ({
    name: g.name,
    status: 'pending' as const,
    loading: false,
    gameId: g.id,
  }))
}

const scrapeSingle = async (row: ScanRow) => {
  row.status = 'loading'
  row.loading = true
  try {
    const keyword = row.name.match(/RJ\d+/)?.[0] || row.name
    const searchRes = await api.post('/scraper/dlsite/search', { keyword })
    const results = searchRes.data
    if (results.length === 0) {
      row.status = 'error'
      return
    }
    const detailRes = await api.post('/scraper/dlsite/fetch', { rjcode: results[0].rjcode })
    const detail = detailRes.data
    await api.post('/scraper/adopt', {
      gameId: row.gameId,
      sourceType: 'dlsite',
      sourceId: results[0].rjcode,
      sourceUrl: `https://www.dlsite.com/maniax/work/=/product_id/RJ${results[0].rjcode}.html`,
      name: detail.title,
      coverUrl: detail.coverURL,
      makers: detail.makers,
      genres: detail.genres,
      tags: detail.tags,
      description: detail.description,
    })
    row.status = 'done'
  } catch {
    row.status = 'error'
  } finally {
    row.loading = false
  }
}

const batchScrape = async () => {
  for (const row of scanResults.value) {
    if (row.status !== 'pending') continue
    await scrapeSingle(row)
  }
  emit('done')
}

watch(modelValue, (val) => {
  if (val) {
    void fetchLibraries()
    scanResults.value = []
  }
})
</script>