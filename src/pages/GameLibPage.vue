<template>
  <q-page style="overflow: hidden; display: flex; flex-direction: column;">
    <div class="row items-center q-gutter-sm q-px-md q-py-sm">
      <q-input
        v-model="keyword"
        label="Search"
        outlined
        dense
        clearable
        style="max-width: 300px"
        @clear="onSearchClear"
      >
        <template v-slot:append>
          <q-icon name="search" />
        </template>
      </q-input>
      <q-btn flat icon="filter_list" label="Filter" @click="showFilter = true">
        <q-badge v-if="activeFilterCount > 0" color="orange" floating>{{
          activeFilterCount
        }}</q-badge>
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
      <q-btn v-if="!selectMode" flat icon="checklist" label="Select" @click="enterSelectMode" />
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

    <div
      ref="gridContainer"
class="q-pa-md"
      style="flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column;"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div
        v-if="dragOver"
        class="drop-overlay flex flex-center"
      >
        <div class="text-center">
          <q-icon name="cloud_upload" size="64px" color="primary" />
          <div class="text-h6 text-primary q-mt-sm">Drop folder to search</div>
        </div>
      </div>

      <VirtualGrid
        v-if="games.length > 0"
        ref="virtualGrid"
        :items="games"
        :item-key="(g: GameItem) => g.id"
        :row-height="rowHeight"
        :gutter="16"
        :buffer-rows="3"
        @mousedown="onGridMouseDown"
        @mousemove="onGridMouseMove"
        @mouseup="onGridMouseUp"
      >
        <template #default="{ item: game }">
          <div :data-game-id="game.id">
            <GameCard
              :game="game"
              :selectable="selectMode"
              :selected="selectedIds.has(game.id)"
              :duplicate="duplicateGameIds.has(game.id)"
              @click="goDetail(game.id)"
              @select="toggleSelect(game.id, $event)"
            />
          </div>
        </template>
      </VirtualGrid>

      <div v-if="selectMode && dragSelecting" class="drag-select-rect" :style="dragRectStyle" />

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

    <ScrapeDialog
      v-model="showDropScrape"
      :game-name="dropFolderName"
      @adopted="onDropAdopt"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter, onBeforeRouteLeave } from 'vue-router';

import api from '../composables/useApi';
import GameCard from '../components/GameCard.vue';
import VirtualGrid from '../components/VirtualGrid.vue';
import ScannerDialog from '../components/ScannerDialog.vue';
import ScrapeDialog from '../components/ScrapeDialog.vue';
import FilterDialog from '../components/FilterDialog.vue';

interface GameItem {
  id: number;
  name: string;
  cover_path: string | null;
  library_name: string;
  library_id: number;
  sub_path: string;
  library_path: string;
}

interface FilterState {
  libraryIds: number[];
  noLibrary: boolean;
  makerIds: number[];
  genreIds: number[];
  tagIds: number[];
  scraped: 'all' | 'yes' | 'no';
  duplicate: 'all' | 'yes' | 'no';
}

const router = useRouter();
const games = ref<GameItem[]>([]);
const loading = ref(false);
const keyword = ref('');
const total = ref(0);
const showScanner = ref(false);
const showDropScrape = ref(false);
const dropFolderName = ref('');
const dropFolderPath = ref('');
const dragOver = ref(false);
let dragCounter = 0;
const duplicateGameIds = ref<Set<number>>(new Set());

const loadDuplicates = async () => {
  try {
    const res = await api.get('/games/duplicates');
    const ids = new Set<number>();
    for (const group of res.data) {
      for (const game of group.games) {
        ids.add(game.gameId);
      }
    }
    duplicateGameIds.value = ids;
  } catch {
    duplicateGameIds.value = new Set();
  }
};

const showFilter = ref(false);
const currentFilter = ref<FilterState>({
  libraryIds: [],
  noLibrary: false,
  makerIds: [],
  genreIds: [],
  tagIds: [],
  scraped: 'yes',
  duplicate: 'all',
});

const sortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Date Added', value: 'created_at' },
  { label: 'Date Updated', value: 'updated_at' },
  { label: 'Creation Time', value: 'dir_created_at' },
];

const SORT_KEY = '__game_lib_sort__';

const loadSortPrefs = (): { sortBy: string; sortOrder: 'asc' | 'desc' } => {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return { sortBy: 'updated_at', sortOrder: 'desc' };
};

const saveSortPrefs = () => {
  localStorage.setItem(SORT_KEY, JSON.stringify({
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
  }));
};

const savedSort = loadSortPrefs();
const sortBy = ref(savedSort.sortBy);
const sortOrder = ref<'asc' | 'desc'>(savedSort.sortOrder);

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
  saveSortPrefs();
  games.value = [];
  void loadGames();
};

const activeFilterCount = computed(() => {
  const f = currentFilter.value;
  let count = 0;
  if (f.libraryIds.length > 0 || f.noLibrary) count++;
  if (f.makerIds.length > 0) count++;
  if (f.genreIds.length > 0) count++;
  if (f.tagIds.length > 0) count++;
  if (f.scraped !== 'all') count++;
  if (f.duplicate !== 'all') count++;
  return count;
});

const onApplyFilter = (filter: FilterState) => {
  currentFilter.value = filter;
  saveFilterState();
  games.value = [];
  void loadGames();
};

const selectMode = ref(false);
const selectedIds = ref<Set<number>>(new Set());
const lastSelectedId = ref<number | null>(null);
const confirmDeleteDialog = ref(false);

const gridContainer = ref<HTMLElement | null>(null);
const virtualGrid = ref<{ scrollTo: (top: number) => void; getScrollTop: () => number } | null>(null);

const CARD_ASPECT = 2.8 / 4;
const rowHeight = computed(() => {
  const containerW = (gridContainer.value?.clientWidth ?? 1200) - 32;
  const vw = window.innerWidth;
  let c: number;
  if (vw >= 1440) c = 6;
  else if (vw >= 1024) c = 4;
  else if (vw >= 600) c = 3;
  else c = 2;
  const gutter = 16;
  const colW = (containerW - gutter * (c - 1)) / c;
  return Math.ceil(colW / CARD_ASPECT);
});

const dragSelecting = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const dragEnd = ref({ x: 0, y: 0 });

const dragRectStyle = computed(() => {
  const x = Math.min(dragStart.value.x, dragEnd.value.x);
  const y = Math.min(dragStart.value.y, dragEnd.value.y);
  const w = Math.abs(dragEnd.value.x - dragStart.value.x);
  const h = Math.abs(dragEnd.value.y - dragStart.value.y);
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
  };
});

const enterSelectMode = () => {
  selectMode.value = true;
};

const exitSelectMode = () => {
  selectMode.value = false;
  selectedIds.value = new Set();
  lastSelectedId.value = null;
};

const goDetail = (id: number) => {
  void router.push(`/game/${id}`);
};

const toggleSelect = (id: number, event?: MouseEvent) => {
  const newSet = new Set(selectedIds.value);

  if (event?.shiftKey && lastSelectedId.value !== null) {
    const ids = games.value.map((g) => g.id);
    const fromIdx = ids.indexOf(lastSelectedId.value);
    const toIdx = ids.indexOf(id);
    if (fromIdx >= 0 && toIdx >= 0) {
      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      for (let i = lo; i <= hi; i++) {
        newSet.add(ids[i]!);
      }
    }
  } else if (event?.ctrlKey || event?.metaKey) {
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
  } else {
    if (newSet.has(id) && newSet.size === 1) {
      newSet.delete(id);
    } else {
      newSet.clear();
      newSet.add(id);
    }
  }

  selectedIds.value = newSet;
  lastSelectedId.value = id;
};

const onGridMouseDown = (e: MouseEvent) => {
  if (!selectMode.value) return;
  if ((e.target as HTMLElement).closest('.game-card')) return;
  dragSelecting.value = true;
  const rect = gridContainer.value?.getBoundingClientRect();
  if (!rect) return;
  dragStart.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  dragEnd.value = { ...dragStart.value };
};

const onGridMouseMove = (e: MouseEvent) => {
  if (!dragSelecting.value) return;
  const rect = gridContainer.value?.getBoundingClientRect();
  if (!rect) return;
  dragEnd.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const onGridMouseUp = () => {
  if (!dragSelecting.value) return;
  dragSelecting.value = false;

  const container = gridContainer.value;
  if (!container) return;
  const containerRect = container.getBoundingClientRect();

  const selX1 = Math.min(dragStart.value.x, dragEnd.value.x) + containerRect.left;
  const selY1 = Math.min(dragStart.value.y, dragEnd.value.y) + containerRect.top;
  const selX2 = Math.max(dragStart.value.x, dragEnd.value.x) + containerRect.left;
  const selY2 = Math.max(dragStart.value.y, dragEnd.value.y) + containerRect.top;

  const newSet = new Set(selectedIds.value);
  const cards = container.querySelectorAll('[data-game-id]');
  cards.forEach((card) => {
    const cardRect = card.getBoundingClientRect();
    const overlaps = !(
      cardRect.right < selX1 ||
      cardRect.left > selX2 ||
      cardRect.bottom < selY1 ||
      cardRect.top > selY2
    );
    if (overlaps) {
      const id = Number((card as HTMLElement).dataset.gameId);
      if (id) newSet.add(id);
    }
  });
  selectedIds.value = newSet;
};

const doBatchDelete = async () => {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  await api.post('/games/batch-delete', { ids });
  confirmDeleteDialog.value = false;
  exitSelectMode();
  await loadGames();
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && selectMode.value) {
    exitSelectMode();
  }
};

const loadGames = async () => {
  if (loading.value) return;
  virtualGrid.value?.scrollTo(0);
  loading.value = true;
  try {
    const f = currentFilter.value;
    const params: Record<string, string | number> = { pageSize: 0 };
    if (keyword.value) params.keyword = keyword.value;
    if (f.libraryIds.length > 0) params.libraryIds = f.libraryIds.join(',');
    if (f.noLibrary) params.noLibrary = 'true';
    if (f.makerIds.length > 0) params.makerIds = f.makerIds.join(',');
    if (f.genreIds.length > 0) params.genreIds = f.genreIds.join(',');
    if (f.tagIds.length > 0) params.tagIds = f.tagIds.join(',');
    if (f.scraped === 'yes') params.scraped = 'true';
    else if (f.scraped === 'no') params.scraped = 'false';
    if (f.duplicate === 'yes') params.duplicate = 'yes';
    else if (f.duplicate === 'no') params.duplicate = 'no';
    params.sortBy = sortBy.value;
    params.sortOrder = sortOrder.value;

    const res = await api.get('/games', { params });
    games.value = res.data.games;
    total.value = res.data.total;
  } finally {
    loading.value = false;
    void loadDuplicates();
  }
};

const searchGames = () => {
  games.value = [];
  void loadGames();
};

let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(keyword, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    saveFilterState();
    searchGames();
  }, 300);
});

const onSearchClear = () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchGames();
};

watch(sortBy, () => {
  saveSortPrefs();
  games.value = [];
  void loadGames();
});

const FILTER_KEY = '__game_lib_filter__';

const saveFilterState = () => {
  sessionStorage.setItem(FILTER_KEY, JSON.stringify({
    keyword: keyword.value,
    filter: currentFilter.value,
  }));
};

const restoreFilterState = () => {
  try {
    const saved = sessionStorage.getItem(FILTER_KEY);
    if (!saved) return;
    const { keyword: kw, filter } = JSON.parse(saved);
    if (kw) keyword.value = kw;
    if (filter) Object.assign(currentFilter.value, filter);
  } catch { /* ignore */ }
};

const SCROLL_KEY = '__game_lib_scroll__';

const restoreScroll = () => {
  const saved = sessionStorage.getItem(SCROLL_KEY);
  if (!saved) return;
  sessionStorage.removeItem(SCROLL_KEY);
  const top = Number(saved);
  if (!top) return;
  void nextTick(() => {
    virtualGrid.value?.scrollTo(top);
  });
};

const getSourceUrl = (source: string, sourceId: string): string => {
  if (source === 'dlsite')
    return `https://www.dlsite.com/maniax/work/=/product_id/${sourceId}.html`;
  if (source === 'bangumi') return `https://bgm.tv/subject/${sourceId}`;
  if (source === 'vndb') return `https://vndb.org/${sourceId}`;
  if (source === 'steam') return `https://store.steampowered.com/app/${sourceId}`;
  return '';
};

const onDragEnter = () => {
  dragCounter++;
  dragOver.value = true;
};

const onDragOver = () => {
  dragOver.value = true;
};

const onDragLeave = () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dragOver.value = false;
  }
};

const onDrop = (e: DragEvent) => {
  dragOver.value = false;
  dragCounter = 0;
  const items = e.dataTransfer?.items;
  if (!items || items.length === 0) return;
  const firstItem = items[0];
  if (!firstItem) return;
  const entry = firstItem.webkitGetAsEntry();
  if (!entry?.isDirectory) return;
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  const fullPath = window.electronAPI?.getFilePath(file) || entry.name;
  dropFolderPath.value = fullPath;
  dropFolderName.value = fullPath.split(/[/\\]/).pop() || fullPath;
  showDropScrape.value = true;
};

interface DropAdoptData {
  source: string;
  sourceId: string;
  name: string;
  makerName: string;
  coverUrl: string;
  detail: {
    title: string;
    coverURL: string;
    makers: string[];
    genres: string[];
    tags: string[];
    description: string;
  };
}

const normalizePath = (p: string) => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');

const onDropAdopt = async (data: DropAdoptData) => {
  try {
    const libsRes = await api.get('/libraries');
    const libs = libsRes.data || [];

    const dropNorm = normalizePath(dropFolderPath.value);
    const matchedLib = libs.find((lib: { id: number; name: string; path: string }) => {
      const libNorm = normalizePath(lib.path);
      return dropNorm.startsWith(libNorm + '\\');
    });

    let libraryId: number | undefined;
    let subPath: string;
    if (matchedLib) {
      libraryId = matchedLib.id;
      const libPrefix = matchedLib.path.replace(/\//g, '\\').replace(/\\+$/, '');
      subPath = dropFolderPath.value.replace(/\//g, '\\').substring(libPrefix.length + 1);
    } else {
      libraryId = undefined;
      subPath = dropFolderPath.value;
    }

    const gameRes = await api.post('/games', {
      name: dropFolderName.value,
      sub_path: subPath,
      ...(libraryId && { library_id: libraryId }),
    });
    const gameId = gameRes.data.id;
    await api.post('/scraper/adopt', {
      gameId,
      sourceType: data.source,
      sourceId: data.sourceId,
      sourceUrl: getSourceUrl(data.source, data.sourceId),
      name: data.detail.title,
      coverUrl: data.detail.coverURL,
      makers: data.detail.makers,
      genres: data.detail.genres,
      tags: data.detail.tags,
      description: data.detail.description,
    });
    await loadGames();
  } catch {
    // handled by error interceptor
  }
};

onMounted(() => {
  restoreFilterState();
  void loadGames().then(() => restoreScroll());
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});

onBeforeRouteLeave(() => {
  const scrollTop = virtualGrid.value?.getScrollTop() ?? 0;
  sessionStorage.setItem(SCROLL_KEY, String(scrollTop));
  saveFilterState();
});

onBeforeUnmount(() => {
  saveFilterState();
});
</script>

<style scoped>
.toolbar-sticky {
  position: sticky;
  top: 0;
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
.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.92);
  z-index: 1001;
  border: 3px dashed #1976d2;
  border-radius: 8px;
  pointer-events: none;
}
</style>

<style>
body.body--dark .toolbar-sticky {
  background: #1d1d1d;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
</style>