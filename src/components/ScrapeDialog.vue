<template>
  <Dialog :open="show" @update:open="show = $event">
    <DialogContent
      class="flex h-[80vh] w-[88vw] max-w-[90vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1400px]"
      @pointer-down-outside.prevent
    >
      <DialogHeader class="flex-row items-center gap-2 space-y-0 border-b px-4 py-2.5">
        <DialogTitle class="text-sm font-semibold">Scrape: {{ gameName }}</DialogTitle>
        <DialogDescription class="sr-only">
          Search a metadata source, preview a result and adopt it.
        </DialogDescription>
        <Tooltip v-if="folderPath">
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon-sm" @click="onOpenFolder">
              <FolderOpen class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open directory</TooltipContent>
        </Tooltip>
      </DialogHeader>

      <div class="shrink-0 px-4 pt-3">
        <Tabs v-model="activeSource">
          <TabsList class="h-8">
            <TabsTrigger
              v-for="s in SOURCES"
              :key="s.value"
              :value="s.value"
              class="h-6 px-2.5 text-xs"
            >
              {{ s.label }}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div class="mt-2 flex items-center gap-2">
          <div class="relative flex-1">
            <Search class="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2" />
            <Input
              v-model="keyword"
              placeholder="Search keyword"
              class="h-8 pl-8 text-[13px]"
              :disabled="manualFetching"
              @keyup.enter="doSearch"
            />
          </div>
          <Input
            v-model="idInput"
            :placeholder="idInputLabel"
            class="h-8 w-48 text-[13px]"
            :disabled="searching"
            @keyup.enter="doSearchOrFetch"
          />
          <Button
            size="sm"
            class="h-8"
            :disabled="!isSearching && !keyword.trim() && !idInput.trim()"
            @click="isSearching ? cancelSearch() : doSearchOrFetch()"
          >
            {{ isSearching ? 'Stop' : 'Search' }}
          </Button>
        </div>

        <div v-if="segments.length > 0" class="mt-2 flex flex-wrap gap-1">
          <button
            v-for="seg in segments"
            :key="seg"
            type="button"
            class="bg-secondary text-secondary-foreground hover:bg-accent rounded-md px-2 py-0.5 text-xs transition-colors"
            @click="keyword = seg"
          >
            {{ seg }}
          </button>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 gap-3 px-4 py-3">
        <div class="w-[42%] min-w-0 overflow-y-auto pr-1">
          <button
            v-for="(r, idx) in results"
            :key="r.id"
            type="button"
            class="hover:bg-accent mb-1 flex w-full gap-2 rounded-lg border p-1 text-left transition-colors"
            :class="selectedIdx === idx ? 'border-primary bg-primary/5' : 'border-transparent'"
            @click="selectResult(idx)"
          >
            <div class="bg-muted h-[76px] w-[57px] shrink-0 overflow-hidden rounded-md">
              <img
                v-if="r.coverUrl && !failedCovers[r.coverUrl]"
                :src="resolveCoverUrl(r.coverUrl)"
                class="h-full w-full object-cover"
                alt=""
                @error="markCoverFailed(r.coverUrl)"
              />
              <div
                v-else
                class="text-muted-foreground flex h-full w-full items-center justify-center"
              >
                <ImageOff class="size-4" />
              </div>
            </div>
            <div class="min-w-0 flex-1 py-0.5">
              <div class="line-clamp-2 text-[13px] leading-snug">{{ r.name }}</div>
              <div class="text-muted-foreground mt-0.5 truncate text-xs">{{ r.makerName }}</div>
              <div class="text-muted-foreground truncate text-[10px]">{{ r.id }}</div>
            </div>
          </button>

          <div
            v-if="results.length === 0 && searched"
            class="text-muted-foreground p-6 text-center text-sm"
          >
            No results found. Try a different keyword or switch source.
          </div>

          <div v-if="searching" class="flex justify-center p-4">
            <Loader2 class="text-primary size-5 animate-spin" />
          </div>
        </div>

        <div class="bg-border w-px shrink-0" />

        <div class="min-w-0 flex-1 overflow-y-auto">
          <div v-if="selectedResult">
            <div class="flex gap-4">
              <div
                class="bg-muted aspect-[3/4] w-2/5 max-w-[220px] shrink-0 overflow-hidden rounded-lg"
              >
                <img
                  v-if="detailCoverUrl"
                  :src="resolveCoverUrl(detailCoverUrl)"
                  class="h-full w-full object-cover"
                  alt=""
                />
                <div v-else class="flex h-full items-center justify-center">
                  <Gamepad2 class="text-muted-foreground size-6" />
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <div class="line-clamp-2 text-sm font-medium">{{ selectedResult.name }}</div>
                <div class="text-muted-foreground mt-2 space-y-0.5 text-xs">
                  <div>
                    <span class="text-foreground/70 font-medium">ID:</span> {{ selectedResult.id }}
                  </div>
                  <div>
                    <span class="text-foreground/70 font-medium">Maker:</span>
                    {{ selectedResult.makerName }}
                  </div>
                </div>
                <div v-if="detailLoading" class="mt-3">
                  <Loader2 class="text-primary size-5 animate-spin" />
                </div>
                <div v-if="detail">
                  <div v-if="detail.genres?.length" class="mt-2 flex flex-wrap gap-1">
                    <span
                      v-for="g in detail.genres"
                      :key="g"
                      class="bg-info/15 text-info rounded px-1.5 py-0.5 text-[11px]"
                    >
                      {{ g }}
                    </span>
                  </div>
                  <div v-if="detail.tags?.length" class="mt-1.5 flex flex-wrap gap-1">
                    <span
                      v-for="t in detail.tags"
                      :key="t"
                      class="bg-success/15 text-success rounded px-1.5 py-0.5 text-[11px]"
                    >
                      {{ t }}
                    </span>
                  </div>
                  <div
                    v-if="detail.description"
                    class="text-muted-foreground mt-3 max-h-32 overflow-y-auto text-xs whitespace-pre-wrap"
                  >
                    {{ detail.description }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            v-else
            class="text-muted-foreground flex h-full min-h-[200px] items-center justify-center"
          >
            <div class="text-center">
              <MousePointerClick class="mx-auto mb-2 size-10 opacity-40" />
              <p class="text-sm">Select a result to preview</p>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-muted/50 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2.5">
        <Button variant="ghost" size="sm" @click="show = false">Cancel</Button>
        <Button
          size="sm"
          :disabled="!selectedResult || detailLoading || manualFetching"
          @click="adopt"
        >
          Adopt
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { FolderOpen, Gamepad2, ImageOff, Loader2, MousePointerClick, Search } from '@lucide/vue';
import { toast } from 'vue-sonner';
import api from '../composables/useApi';
import { useExpressUrl } from '../composables/useExpressUrl';
import { getCleanedName } from '../composables/useSplitKeyword';
import type { SourceType, SearchResult, DetailResult, AdoptData } from '../types/scrape';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

const { resolveCoverUrl } = useExpressUrl();

const SOURCES: { value: SourceType; label: string }[] = [
  { value: 'dlsite', label: 'DLSite' },
  { value: 'dmm', label: 'DMM' },
  { value: 'bangumi', label: 'Bangumi' },
  { value: 'vndb', label: 'VNDB' },
  { value: 'steam', label: 'Steam' },
];

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

// Covers that failed to load (dead URL, hotlink protection) fall back to the
// placeholder icon. Keyed by URL because result rows are recycled by v-for.
const failedCovers = ref<Record<string, true>>({});
const markCoverFailed = (url: string) => {
  failedCovers.value = { ...failedCovers.value, [url]: true };
};

// Scrape failures used to be swallowed (there is no global axios error interceptor), so a
// source that was blocked or unreachable looked exactly like "no results". Surface them.
// DMM's region gate gets a distinct, actionable message because the fix is on the user's
// side (a Japanese proxy exit), not in the code.
const reportScrapeError = (err: unknown, action: string) => {
  const e = err as {
    code?: string;
    response?: { data?: { error?: string; code?: string } };
  };
  if (e?.code === 'ERR_CANCELED') return;
  const data = e?.response?.data;
  const isRegion = data?.code === 'DMM_REGION_BLOCKED';
  const isSelector = data?.code === 'DMM_SELECTOR_MISSING';
  const message = data?.error || `Scrape ${action} failed`;
  if (isRegion || isSelector) {
    toast.warning(message, { duration: 12000 });
  } else {
    toast.error(message);
  }
};

/**
 * A search can succeed and still be incomplete: DLsite/DMM filter some works by IP and
 * report nothing. The server hands back a `region` notice when it can tell, and this is
 * the user's only chance to find out they forgot to switch proxy.
 */
const reportRegionNotice = (
  region: { isJapan?: boolean | null; message?: string } | null | undefined,
) => {
  if (!region || region.isJapan !== false || !region.message) return;
  toast.warning(region.message, { duration: 12000 });
};
const searchAbort = ref<AbortController | null>(null);
const fetchAbort = ref<AbortController | null>(null);
const manualFetchAbort = ref<AbortController | null>(null);

const idInputLabel = computed(() => {
  const labels: Record<SourceType, string> = {
    dlsite: 'RJ Code (e.g. RJ123456)',
    dmm: 'DMM ID (e.g. d_216826)',
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
    const res = await api.post(
      `/scraper/${activeSource.value}/search`,
      {
        keyword: keyword.value.trim(),
      },
      {
        signal: currentAbort.signal,
      },
    );
    const data = res.data;
    results.value = data.results ?? data;
    reportRegionNotice(data.region);
    emit('searched', activeSource.value, keyword.value.trim(), results.value);
    searched.value = true;
  } catch (err: unknown) {
    reportScrapeError(err, 'search');
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
    reportScrapeError(err, 'fetch');
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
    results.value = [
      {
        id: fetched.id || id,
        name: fetched.title || id,
        coverUrl: fetched.coverURL || '',
        makerName: fetched.makers?.join(', ') || '',
      },
    ];
    selectedIdx.value = 0;
  } catch (err: unknown) {
    reportScrapeError(err, 'fetch');
    detail.value = null;
  } finally {
    if (manualFetchAbort.value === currentAbort) {
      manualFetching.value = false;
    }
  }
};

let skipSourceWatch = false;

const isSearching = computed(() => searching.value || manualFetching.value);

const cancelSearch = () => {
  searchAbort.value?.abort();
  fetchAbort.value?.abort();
  manualFetchAbort.value?.abort();
  searching.value = false;
  manualFetching.value = false;
};

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
  const hasDmm = /\bd_\d{3,}\b/i.test(name);
  const letterCount = (name.match(/[a-zA-Z]/g) || []).length;
  const isMostlyEnglish = name.length > 0 && letterCount / name.length >= 0.9;
  if (hasRJ) return 'dlsite';
  if (hasDmm) return 'dmm';
  if (isMostlyEnglish) return 'steam';
  return 'bangumi';
};

// Old behaviour: @show prepared the dialog and started the first search; closing
// aborted every in-flight request.
watch(show, (val) => {
  if (val) {
    void onDialogShow();
  } else {
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
  failedCovers.value = {};

  const searchName = props.gameName;
  const rawKeyword = props.defaultKeyword || searchName.match(/RJ\d+/)?.[0] || searchName;
  keyword.value = getCleanedName(rawKeyword);

  const validSources: SourceType[] = ['dlsite', 'dmm', 'bangumi', 'vndb', 'steam'];
  const source = props.defaultSource;
  const tab: SourceType =
    source && validSources.includes(source) ? source : resolveAutoSource(props.gameName);

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

// The old q-dialog fired @show only when mounted through v-model; a mounted-but-open
// dialog (e.g. restored state) needs the same preparation.
if (props.modelValue) {
  void onDialogShow();
}
</script>
