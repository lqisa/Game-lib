<template>
  <q-dialog v-model="show" persistent>
    <q-card style="min-width: 800px; max-width: 1000px; max-height: 80vh; display: flex; flex-direction: column;">
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle1">Scrape: {{ gameName }}</div>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section class="q-pb-none">
        <q-tabs
          v-model="activeSource"
          dense
          narrow-indicator
          align="left"
          class="q-mb-sm"
        >
          <q-tab name="dlsite" label="DLSite" />
          <q-tab name="bangumi" label="Bangumi" />
          <q-tab name="vndb" label="VNDB" />
        </q-tabs>

        <div class="row q-gutter-sm q-mb-sm">
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

        <div v-if="segments.length > 0" class="q-mb-sm">
          <q-chip
            v-for="seg in segments"
            :key="seg"
            clickable
            dense
            :color="seg === gameName ? 'blue-grey-2' : 'grey-3'"
            text-color="dark"
            @click="keyword = seg"
          >
            {{ seg }}
          </q-chip>
        </div>
      </q-card-section>

      <q-card-section class="col overflow-hidden q-pt-none">
        <div class="row no-wrap" style="height: 100%;">
          <div class="col-5" style="overflow-y: auto; max-height: 50vh;">
            <div v-if="results.length > 0">
              <div
                v-for="(r, idx) in results"
                :key="r.id"
                class="cursor-pointer q-mb-xs"
                @click="selectResult(idx)"
              >
                <q-card
                  :class="{ 'bg-blue-1': selectedIdx === idx }"
                  flat
                  bordered
                >
                  <div class="row no-wrap">
                    <div style="width: 60px; flex-shrink: 0;">
                      <q-img
                        v-if="r.coverUrl"
                        :src="r.coverUrl"
                        :ratio="3 / 4"
                        class="rounded-borders-left"
                      >
                        <template v-slot:error>
                          <div class="absolute-full flex flex-center bg-grey-3">
                            <q-icon name="broken_image" size="18px" color="grey" />
                          </div>
                        </template>
                      </q-img>
                      <div v-else class="bg-grey-3 flex flex-center" style="aspect-ratio: 3/4;">
                        <q-icon name="videogame_asset" size="18px" color="grey" />
                      </div>
                    </div>
                    <div class="col q-pa-xs" style="min-width: 0;">
                      <div class="text-caption ellipsis-2-lines" style="line-height: 1.3;">{{ r.name }}</div>
                      <div class="text-caption text-grey ellipsis">{{ r.makerName }}</div>
                      <div class="text-caption text-grey" style="font-size: 10px;">{{ r.id }}</div>
                    </div>
                  </div>
                </q-card>
              </div>
            </div>

            <div v-if="results.length === 0 && searched" class="text-center text-grey q-pa-md">
              No results found. Try a different keyword or switch source.
            </div>

            <div v-if="searching" class="text-center q-pa-md">
              <q-spinner-dots size="24px" color="primary" />
            </div>
          </div>

          <q-separator vertical class="q-mx-sm" />

          <div class="col" style="overflow-y: auto; max-height: 50vh;">
            <div v-if="selectedResult">
              <div class="row q-col-gutter-md">
                <div class="col-5">
                  <q-img
                    v-if="selectedResult.coverUrl"
                    :src="selectedResult.coverUrl"
                    :ratio="3 / 4"
                    class="rounded-borders"
                  />
                </div>
                <div class="col-7">
                  <div class="text-subtitle2 ellipsis-2-lines">{{ selectedResult.name }}</div>
                  <div class="text-caption text-grey q-mt-xs"><span class="text-grey-7">ID:</span> {{ selectedResult.id }}</div>
                  <div class="text-caption text-grey"><span class="text-grey-7">Maker:</span> {{ selectedResult.makerName }}</div>
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
                    <div v-if="detail.description" class="text-caption q-mt-sm" style="white-space: pre-wrap; max-height: 120px; overflow-y: auto;">{{ detail.description }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="flex flex-center text-grey" style="height: 100%; min-height: 200px;">
              <div class="text-center">
                <q-icon name="touch_app" size="48px" color="grey-4" />
                <div class="q-mt-sm">Select a result to preview</div>
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
      <q-card-actions align="right" class="bg-grey-1 q-px-md q-py-sm">
        <q-btn color="positive" label="Adopt" @click="adopt" :disable="!selectedResult" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import api from '../composables/useApi'

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

const props = defineProps<{
  modelValue: boolean
  gameName: string
  gameId: number
  defaultKeyword?: string | undefined
  defaultSource?: SourceType | undefined
  initialResults?: SearchResult[] | null
  initialSegments?: string[] | null
}>()

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  adopted: [data: AdoptData]
  searched: [source: SourceType, keyword: string, results: SearchResult[]]
}>()

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const cleanName = (name: string): string =>
  name
    .replace(/【.*?】/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\s*[Vv](?:er)?\d+(\.\d+)*/gi, '')
    .trim()

const activeSource = ref<SourceType>('dlsite')
const keyword = ref('')
const results = ref<SearchResult[]>([])
const selectedIdx = ref(-1)
const searching = ref(false)
const searched = ref(false)
const detail = ref<DetailResult | null>(null)
const detailLoading = ref(false)

const segments = computed(() => {
  if (!props.initialSegments || props.initialSegments.length === 0) return []
  const cleanedGameName = cleanName(props.gameName)
  const cleanedSegs = props.initialSegments.map(cleanName).filter(Boolean)
  return [cleanedGameName, ...cleanedSegs.filter(s => s !== cleanedGameName)]
})

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
    const res = await api.post(`/scraper/${activeSource.value}/search`, { keyword: keyword.value.trim() })
    const data = res.data
    results.value = data.results ?? data
    emit('searched', activeSource.value, keyword.value.trim(), results.value)
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
    const fetchBody = activeSource.value === 'dlsite'
      ? { rjcode: r.id }
      : { id: r.id }
    const res = await api.post(`/scraper/${activeSource.value}/fetch`, fetchBody)
    const fetched: DetailResult = res.data || {
      id: r.id,
      title: r.name,
      coverURL: '',
      makers: [],
      genres: [],
      tags: [],
      description: '',
    }
    if (!fetched.coverURL && r.coverUrl) {
      fetched.coverURL = r.coverUrl
    }
    if (!fetched.title && r.name) {
      fetched.title = r.name
    }
    detail.value = fetched
  } catch {
    detail.value = null
  } finally {
    detailLoading.value = false
  }
}

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
    detail: fallback
  })
  show.value = false
}

watch(() => props.modelValue, (val) => {
  if (val) {
    activeSource.value = props.defaultSource || 'dlsite'
    const rawKeyword = props.defaultKeyword || props.gameName.match(/RJ\d+/)?.[0] || props.gameName
    keyword.value = cleanName(rawKeyword)
    results.value = []
    selectedIdx.value = -1
    detail.value = null
    searched.value = false
    if (props.initialResults && props.initialResults.length > 0) {
      results.value = props.initialResults
      searched.value = true
    } else {
      void doSearch()
    }
  }
})

watch(activeSource, () => {
  if (props.modelValue) {
    void doSearch()
  }
})
</script>