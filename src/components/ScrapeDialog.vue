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
  defaultKeyword?: string | undefined
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