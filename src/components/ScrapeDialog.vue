<template>
  <q-dialog v-model="show" persistent @show="onDialogShow" @keydown.esc="show = false">
    <q-card class="scrape-dialog-card">
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle1">Scrape: {{ gameName }}</div>
        <q-btn
          v-if="folderPath"
          dense
          flat
          icon="folder_open"
          size="sm"
          class="q-ml-xs"
          @click="onOpenFolder"
        >
          <q-tooltip>Open directory</q-tooltip>
        </q-btn>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section class="q-pb-none">
        <q-tabs v-model="activeSource" dense narrow-indicator align="left" class="q-mb-sm">
          <q-tab name="dlsite" label="DLSite" />
          <q-tab name="bangumi" label="Bangumi" />
          <q-tab name="vndb" label="VNDB" />
          <q-tab name="steam" label="Steam" />
        </q-tabs>

        <div class="row q-gutter-sm q-mb-sm">
          <q-input
            v-model="keyword"
            label="Search keyword"
            outlined
            dense
            class="col"
            :disable="manualFetching"
            @keyup.enter="doSearch"
          >
            <template v-slot:append>
              <q-icon name="search" class="cursor-pointer" @click="doSearch" />
            </template>
          </q-input>
          <q-input
            v-model="idInput"
            :label="idInputLabel"
            outlined
            dense
            style="min-width: 160px"
            :disable="searching"
            @keyup.enter="doSearchOrFetch"
          />
          <q-btn
            color="primary"
            label="Search"
            @click="doSearchOrFetch"
            :loading="searching || manualFetching"
            :disable="!keyword.trim() && !idInput.trim()"
          />
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

      <q-card-section class="scrape-content">
        <div class="row no-wrap scrape-content-row">
          <div class="col-5 scrape-results-col">
            <div v-if="results.length > 0">
              <div
                v-for="(r, idx) in results"
                :key="r.id"
                class="cursor-pointer q-mb-xs"
                @click="selectResult(idx)"
              >
                <q-card :class="{ 'scrape-result--selected': selectedIdx === idx }" flat bordered>
                  <div class="row no-wrap">
                    <div class="scrape-cover-box">
                      <q-img
                        v-if="r.coverUrl"
                        :src="r.coverUrl"
                        :ratio="3 / 4"
                        class="rounded-borders-left"
                      >
                        <template v-slot:error>
                          <div class="absolute-full flex flex-center scrape-cover-placeholder">
                            <q-icon name="broken_image" size="18px" color="grey" />
                          </div>
                        </template>
                      </q-img>
                      <div v-else class="scrape-cover-placeholder flex flex-center scrape-cover-ratio">
                        <q-icon name="videogame_asset" size="18px" color="grey" />
                      </div>
                    </div>
                    <div class="col q-pa-xs scrape-info-col">
                      <div class="text-caption ellipsis-2-lines scrape-result-name">
                        {{ r.name }}
                      </div>
                      <div class="text-caption text-grey ellipsis">{{ r.makerName }}</div>
                      <div class="text-caption text-grey scrape-result-id">{{ r.id }}</div>
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

          <div class="col scrape-preview-col">
            <div v-if="selectedResult">
              <div class="row q-col-gutter-md">
                <div class="col-5">
                  <q-img
                    v-if="detailCoverUrl"
                    :src="detailCoverUrl"
                    :ratio="3 / 4"
                    class="rounded-borders"
                  />
                </div>
                <div class="col-7">
                  <div class="text-subtitle2 ellipsis-2-lines">{{ selectedResult.name }}</div>
                  <div class="text-caption text-grey q-mt-xs">
                    <span class="text-grey-7">ID:</span> {{ selectedResult.id }}
                  </div>
                  <div class="text-caption text-grey">
                    <span class="text-grey-7">Maker:</span> {{ selectedResult.makerName }}
                  </div>
                  <div v-if="detailLoading" class="text-center q-pa-sm">
                    <q-spinner-dots size="24px" />
                  </div>
                  <div v-if="detail">
                    <div v-if="detail.genres?.length" class="q-mt-xs">
                      <q-chip
                        v-for="g in detail.genres"
                        :key="g"
                        dense
                        size="sm"
                        color="blue"
                        text-color="white"
                        >{{ g }}</q-chip
                      >
                    </div>
                    <div v-if="detail.tags?.length" class="q-mt-xs">
                      <q-chip
                        v-for="t in detail.tags"
                        :key="t"
                        dense
                        size="sm"
                        color="teal"
                        text-color="white"
                        >{{ t }}</q-chip
                      >
                    </div>
                    <div
                      v-if="detail.description"
                      class="text-caption q-mt-sm scrape-description"
                    >
                      {{ detail.description }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="flex flex-center text-grey scrape-empty-state">
              <div class="text-center">
                <q-icon name="touch_app" size="48px" color="grey-4" />
                <div class="q-mt-sm">Select a result to preview</div>
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
      <q-card-actions align="right" class="scrape-actions q-px-md q-py-sm">
        <q-btn flat label="Cancel" color="grey-7" v-close-popup />
        <q-btn color="positive" label="Adopt" @click="adopt" :disable="!selectedResult || detailLoading || manualFetching" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import api from '../composables/useApi';
import { getCleanedName } from '../composables/useSplitKeyword';
import type { SourceType, SearchResult, DetailResult, AdoptData } from '../types/scrape';

const props = defineProps<{
  modelValue: boolean;
  gameName: string;
  gameId?: number;
  defaultKeyword?: string | undefined;
  defaultSource?: SourceType | undefined;
  initialResults?: SearchResult[] | null;
  initialSegments?: string[] | null;
  folderPath?: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  adopted: [data: AdoptData];
  searched: [source: SourceType, keyword: string, results: SearchResult[]];
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const activeSource = ref<SourceType>('dlsite');
const keyword = ref('');
const idInput = ref('');
const results = ref<SearchResult[]>([]);
const selectedIdx = ref(-1);
const searching = ref(false);
const searched = ref(false);
const detail = ref<DetailResult | null>(null);
const detailLoading = ref(false);
const manualFetching = ref(false);
const searchAbort = ref<AbortController | null>(null);
const fetchAbort = ref<AbortController | null>(null);
const manualFetchAbort = ref<AbortController | null>(null);

const idInputLabel = computed(() => {
  const labels: Record<SourceType, string> = {
    dlsite: 'RJ Code (e.g. RJ123456)',
    bangumi: 'Subject ID (e.g. 123456)',
    vndb: 'VNDB ID (e.g. v12345)',
    steam: 'App ID (e.g. 123456)',
  };
  return labels[activeSource.value] || 'Source ID';
});

const segments = computed(() => {
  if (!props.initialSegments || props.initialSegments.length === 0) return [];
  const cleanedGameName = getCleanedName(props.gameName);
  const cleanedSegs = props.initialSegments.map(getCleanedName).filter(Boolean);
  return [cleanedGameName, ...cleanedSegs.filter((s) => s !== cleanedGameName)];
});

const selectedResult = computed(() => {
  if (selectedIdx.value >= 0 && selectedIdx.value < results.value.length) {
    return results.value[selectedIdx.value];
  }
  return null;
});

const detailCoverUrl = computed(() => {
  return detail.value?.coverURL || selectedResult.value?.coverUrl || '';
});

const doSearch = async () => {
  if (!keyword.value.trim()) return;
  if (searchAbort.value) searchAbort.value.abort();
  searchAbort.value = new AbortController();
  const currentAbort = searchAbort.value;
  searching.value = true;
  results.value = [];
  selectedIdx.value = -1;
  detail.value = null;
  searched.value = false;
  try {
    const res = await api.post(`/scraper/${activeSource.value}/search`, {
      keyword: keyword.value.trim(),
    }, {
      signal: currentAbort.signal,
    });
    const data = res.data;
    results.value = data.results ?? data;
    emit('searched', activeSource.value, keyword.value.trim(), results.value);
    searched.value = true;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ERR_CANCELED') return;
  } finally {
    if (searchAbort.value === currentAbort) {
      searching.value = false;
    }
  }
};

const selectResult = async (idx: number) => {
  selectedIdx.value = idx;
  detail.value = null;
  const r = results.value[idx];
  if (!r) return;
  if (fetchAbort.value) fetchAbort.value.abort();
  fetchAbort.value = new AbortController();
  const currentFetch = fetchAbort.value;
  detailLoading.value = true;
  try {
    const fetchBody = activeSource.value === 'dlsite' ? { rjcode: r.id } : { id: r.id };
    const res = await api.post(`/scraper/${activeSource.value}/fetch`, fetchBody, {
      signal: currentFetch.signal,
    });
    const fetched: DetailResult = res.data || {
      id: r.id,
      title: r.name,
      coverURL: '',
      makers: [],
      genres: [],
      tags: [],
      description: '',
    };
    if (!fetched.coverURL && r.coverUrl) {
      fetched.coverURL = r.coverUrl;
    }
    if (!fetched.title && r.name) {
      fetched.title = r.name;
    }
    detail.value = fetched;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ERR_CANCELED') return;
    detail.value = null;
  } finally {
    if (fetchAbort.value === currentFetch) {
      detailLoading.value = false;
    }
  }
};

const adopt = () => {
  const sr = selectedResult.value;
  const coverURL = detail.value?.coverURL || sr?.coverUrl || '';
  const fallback: DetailResult = detail.value
    ? { ...detail.value, coverURL }
    : {
        id: sr?.id || '',
        title: sr?.name || '',
        coverURL: sr?.coverUrl || '',
        makers: [],
        genres: [],
        tags: [],
        description: '',
      };
  emit('adopted', {
    source: activeSource.value,
    sourceId: sr?.id || detail.value?.id || '',
    name: sr?.name || detail.value?.title || '',
    makerName: sr?.makerName || '',
    coverUrl: coverURL,
    detail: fallback,
  });
  show.value = false;
};

const onOpenFolder = () => {
  if (props.folderPath) {
    void window.electronAPI?.openPath(props.folderPath);
  }
};

const fetchById = async () => {
  const id = idInput.value.trim();
  if (!id) return;
  if (manualFetchAbort.value) manualFetchAbort.value.abort();
  manualFetchAbort.value = new AbortController();
  const currentAbort = manualFetchAbort.value;
  manualFetching.value = true;
  results.value = [];
  selectedIdx.value = -1;
  detail.value = null;
  try {
    const fetchBody = activeSource.value === 'dlsite' ? { rjcode: id } : { id };
    const res = await api.post(`/scraper/${activeSource.value}/fetch`, fetchBody, {
      signal: currentAbort.signal,
    });
    const fetched: DetailResult = res.data || {
      id,
      title: '',
      coverURL: '',
      makers: [],
      genres: [],
      tags: [],
      description: '',
    };
    detail.value = fetched;
    results.value = [{
      id: fetched.id || id,
      name: fetched.title || id,
      coverUrl: fetched.coverURL || '',
      makerName: fetched.makers?.join(', ') || '',
    }];
    selectedIdx.value = 0;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ERR_CANCELED') return;
    detail.value = null;
  } finally {
    if (manualFetchAbort.value === currentAbort) {
      manualFetching.value = false;
    }
  }
};

let skipSourceWatch = false;

const doSearchOrFetch = () => {
  if (idInput.value.trim()) {
    void fetchById();
  } else {
    void doSearch();
  }
};

watch(activeSource, () => {
  if (!props.modelValue || skipSourceWatch) return;
  idInput.value = '';
  void doSearch();
});

const resolveAutoSource = (name: string): SourceType => {
  const hasRJ = /RJ\d+/.test(name);
  const letterCount = (name.match(/[a-zA-Z]/g) || []).length;
  const isMostlyEnglish = name.length > 0 && letterCount / name.length >= 0.9;
  if (hasRJ) return 'dlsite';
  if (isMostlyEnglish) return 'steam';
  return 'bangumi';
};

watch(show, (val) => {
  if (!val) {
    searchAbort.value?.abort();
    fetchAbort.value?.abort();
    manualFetchAbort.value?.abort();
  }
});

const onDialogShow = async () => {
  results.value = [];
  selectedIdx.value = -1;
  detail.value = null;
  searched.value = false;
  idInput.value = '';

  const searchName = props.gameName;
  const rawKeyword =
    props.defaultKeyword || searchName.match(/RJ\d+/)?.[0] || searchName;
  keyword.value = getCleanedName(rawKeyword);

  const validSources: SourceType[] = ['dlsite', 'bangumi', 'vndb', 'steam'];
  const source = props.defaultSource;
  const tab: SourceType = source && validSources.includes(source)
    ? source
    : resolveAutoSource(props.gameName);

  skipSourceWatch = true;
  activeSource.value = tab;
  await nextTick();
  skipSourceWatch = false;

  if (props.initialResults && props.initialResults.length > 0) {
    results.value = props.initialResults;
    searched.value = true;
  } else {
    void doSearch();
  }
};
</script>

<style scoped>
.scrape-dialog-card {
  min-width: 88vw;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
}
.scrape-content {
  flex: 1 1 0%;
  overflow: hidden;
  padding-top: 0;
  display: flex;
}
.scrape-content-row {
  flex: 1 1 0%;
}
.scrape-results-col {
  overflow-y: auto;
}
.scrape-preview-col {
  overflow-y: auto;
  max-height: inherit;
}
.scrape-cover-box {
  width: 60px;
  flex-shrink: 0;
}
.scrape-cover-ratio {
  aspect-ratio: 3 / 4;
}
.scrape-info-col {
  min-width: 0;
}
.scrape-result-name {
  line-height: 1.3;
}
.scrape-result-id {
  font-size: 10px;
}
.scrape-description {
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}
.scrape-empty-state {
  height: 100%;
  min-height: 200px;
}
.scrape-result--selected {
  background: #e3f2fd;
}
.scrape-actions {
  background: #f5f5f5;
}
.scrape-cover-placeholder {
  background: #e0e0e0;
}
</style>

<style>
body.body--dark .scrape-result--selected {
  background: rgba(25, 118, 210, 0.2);
}
body.body--dark .scrape-actions {
  background: #1d1d1d;
}
body.body--dark .scrape-cover-placeholder {
  background: #2a2a2a;
}
</style>