<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="flex shrink-0 items-center gap-2 border-b px-4 py-2">
      <div class="relative w-[300px]">
        <Search
          class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input v-model="keyword" placeholder="Search" class="h-8 pl-8 text-[13px]" />
        <button
          v-if="keyword"
          type="button"
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
          @click="onSearchClear"
        >
          <X class="size-4" />
        </button>
      </div>

      <Button variant="secondary" size="sm" class="relative h-8" @click="showFilter = true">
        <ListFilter class="size-4" />
        Filter
        <span
          v-if="activeFilterCount > 0"
          class="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium"
        >
          {{ activeFilterCount }}
        </span>
      </Button>

      <Select v-model="sortBy">
        <SelectTrigger class="h-8 w-[150px] text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </SelectItem>
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="toggleSortOrder">
            <ArrowDown v-if="sortOrder === 'desc'" class="size-4" />
            <ArrowUp v-else class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ sortOrder === 'desc' ? 'Descending' : 'Ascending' }}</TooltipContent>
      </Tooltip>

      <div class="flex-1" />

      <Button
        v-if="!favoritesMode && !archivedMode"
        size="sm"
        class="h-8"
        @click="showScanner = true"
      >
        <Search class="size-4" />
        Scan &amp; Scrape
      </Button>
      <Button v-if="!selectMode" variant="outline" size="sm" class="h-8" @click="enterSelectMode">
        <ClipboardCheck class="size-4" />
        Select
      </Button>
      <template v-else>
        <Button variant="ghost" size="sm" class="h-8" @click="exitSelectMode">Cancel</Button>
        <template v-if="archivedMode">
          <Button
            variant="secondary"
            size="sm"
            class="h-8"
            :disabled="selectedIds.size === 0"
            @click="onBatchUnarchive"
          >
            <ArchiveRestore class="size-4" />
            Unarchive ({{ selectedIds.size }})
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="h-8"
            :disabled="selectedIds.size === 0"
            @click="onBatchDelete"
          >
            <Trash2 class="size-4" />
            Delete ({{ selectedIds.size }})
          </Button>
        </template>
        <template v-else-if="favoritesMode">
          <Button
            variant="secondary"
            size="sm"
            class="h-8"
            :disabled="selectedIds.size === 0"
            @click="onBatchUnfavorite"
          >
            <HeartCrack class="size-4" />
            Unfavorite ({{ selectedIds.size }})
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="h-8"
            :disabled="selectedIds.size === 0"
            @click="onBatchArchive"
          >
            <Archive class="size-4" />
            Archive ({{ selectedIds.size }})
          </Button>
        </template>
        <template v-else>
          <Button
            variant="secondary"
            size="sm"
            class="h-8"
            :disabled="selectedIds.size === 0"
            @click="onBatchArchive"
          >
            <Archive class="size-4" />
            Archive ({{ selectedIds.size }})
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="h-8"
            :disabled="selectedIds.size === 0"
            @click="onBatchDelete"
          >
            <Trash2 class="size-4" />
            Delete ({{ selectedIds.size }})
          </Button>
        </template>
        <span class="text-muted-foreground text-xs">{{ selectedIds.size }} selected</span>
      </template>

      <div class="bg-border mx-1 h-6 w-px" />
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="games.length === 0"
            @click="openRandomGame"
          >
            <Dices class="text-primary size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open a random game</TooltipContent>
      </Tooltip>
    </div>

    <div
      ref="gridContainer"
      class="relative flex min-h-0 flex-1 flex-col p-4"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div
        v-if="dragOver && !favoritesMode && !archivedMode"
        class="drop-overlay flex items-center justify-center"
      >
        <div class="text-center">
          <CloudUpload class="text-primary mx-auto size-16" />
          <div class="text-primary mt-3 text-lg font-medium">Drop folder to search</div>
        </div>
      </div>

      <VirtualGrid
        v-if="games.length > 0"
        ref="virtualGrid"
        class="virtual-grid-wrapper"
        :style="{ opacity: restoringScroll ? 0 : 1 }"
        @scroll="onGridScroll"
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
          <div :data-game-id="game.id" :data-select-mode="selectMode ? '1' : '0'">
            <GameContextMenu
              :game="game"
              :favorites-mode="favoritesMode"
              :archived-mode="archivedMode"
              @delete-game="handleDeleteGame"
              @toggle-favorite="handleToggleFavorite"
              @unfavorite="handleUnfavorite"
              @archive="handleArchive"
              @unarchive="handleUnarchive"
            >
              <GameCard
                :game="game"
                :selectable="selectMode"
                :selected="selectMode && selectedIds.has(game.id)"
                :duplicate="duplicateGameIds.has(game.id)"
                @click="goDetail(game.id)"
                @select="toggleSelect(game.id, $event)"
              />
            </GameContextMenu>
          </div>
        </template>
      </VirtualGrid>

      <div v-if="selectMode && dragSelecting" class="drag-select-rect" :style="dragRectStyle" />

      <div
        v-if="games.length === 0 && !loading"
        class="text-muted-foreground flex flex-1 flex-col items-center justify-center text-center"
      >
        <Gamepad2 class="size-16 opacity-40" />
        <div class="text-foreground mt-3 text-lg font-medium">
          {{ archivedMode ? 'No archived games' : 'No games found' }}
        </div>
        <div class="mt-1 text-sm">Add a game library in Settings, then scan for games.</div>
      </div>

      <div v-if="loading && games.length > 0" class="flex justify-center p-4">
        <Loader2 class="text-primary size-6 animate-spin" />
      </div>
    </div>

    <ScannerDialog v-model="showScanner" @done="loadGames" />
    <FilterDialog v-model="showFilter" :filter="currentFilter" @apply="onApplyFilter" />

    <ScrapeDialog v-model="showDropScrape" :game-name="dropFolderName" @adopted="onDropAdopt" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ClipboardCheck,
  CloudUpload,
  Dices,
  Gamepad2,
  HeartCrack,
  ListFilter,
  Loader2,
  Search,
  Trash2,
  X,
} from '@lucide/vue';

import api from '../composables/useApi';
import { confirm } from '../composables/useConfirm';
import { getGridCols, useViewportWidth } from '../composables/useGridLayout';
import { useGameListStore } from '../stores/gameListStore';
import type { GameListMode } from '../stores/gameListStore';
import GameCard from '../components/GameCard.vue';
import VirtualGrid from '../components/VirtualGrid.vue';
import type { VirtualGridExposed } from '../components/VirtualGrid.types';
import ScannerDialog from '../components/ScannerDialog.vue';
import ScrapeDialog from '../components/ScrapeDialog.vue';
import FilterDialog from '../components/FilterDialog.vue';
import GameContextMenu from '../components/GameContextMenu.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface GameItem {
  id: number;
  name: string;
  cover_path: string | null;
  library_name: string;
  library_id: number;
  sub_path: string;
  library_path: string;
  is_favorite: boolean;
  is_archived: boolean;
  // A cover is fetched through the game's source, so this decides whether a missing cover is
  // repairable at all. Sent by GET /games for exactly that reason.
  hasSource: boolean;
  // cover_path names a file that is not on disk (swapped data directory, manual clean, a scrape
  // that died between the row and the write). Sent by GET /games, because the string alone cannot
  // say whether the cover is there.
  coverMissing: boolean;
}

interface FilterState {
  libraryIds: number[];
  noLibrary: boolean;
  makerIds: number[];
  genreIds: number[];
  tagIds: number[];
  scraped: 'all' | 'yes' | 'no';
  duplicate: 'all' | 'yes' | 'no';
  r18: 'all' | 'yes' | 'no';
}

const router = useRouter();
const gameListStore = useGameListStore();
const { favoritesMode, archivedMode, mode } = storeToRefs(gameListStore);
const games = ref<GameItem[]>([]);
const loading = ref(false);
const restoringScroll = ref(false);
const keyword = ref('');
const showScanner = ref(false);
const showDropScrape = ref(false);
const dropFolderName = ref('');
const dropFolderPath = ref('');
const dragOver = ref(false);
const restoringFilter = ref(false);
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
const DEFAULT_FILTER: FilterState = {
  libraryIds: [],
  noLibrary: false,
  makerIds: [],
  genreIds: [],
  tagIds: [],
  scraped: 'all',
  duplicate: 'all',
  r18: 'all',
};

const currentFilter = ref<FilterState>({ ...DEFAULT_FILTER });

const sortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Date Added', value: 'created_at' },
  { label: 'Date Updated', value: 'updated_at' },
  { label: 'Creation Time', value: 'dir_created_at' },
];

const SORT_KEY = '__game_lib_sort__';
const SORT_KEY_FAV = '__game_lib_sort_fav__';
const SORT_KEY_ARCH = '__game_lib_sort_arch__';
const sortKeyFor = (m: GameListMode) =>
  m === 'favorites' ? SORT_KEY_FAV : m === 'archived' ? SORT_KEY_ARCH : SORT_KEY;
const getSortKey = () => sortKeyFor(mode.value);

const loadSortPrefs = (): { sortBy: string; sortOrder: 'asc' | 'desc' } => {
  try {
    const saved = localStorage.getItem(getSortKey());
    if (saved) return JSON.parse(saved);
  } catch {
    /* ignore */
  }
  return { sortBy: 'updated_at', sortOrder: 'desc' };
};

const saveSortPrefs = () => {
  localStorage.setItem(
    getSortKey(),
    JSON.stringify({
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    }),
  );
};

const restoreSortPrefs = () => {
  const saved = loadSortPrefs();
  sortBy.value = saved.sortBy;
  sortOrder.value = saved.sortOrder;
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
  if (f.r18 !== 'all') count++;
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

const gridContainer = ref<HTMLElement | null>(null);
const virtualGrid = ref<VirtualGridExposed<GameItem> | null>(null);
const viewportWidth = useViewportWidth();

const CARD_ASPECT = 2.8 / 4;
// viewportWidth is reactive, so the row height follows the column count when the window
// is resized. Reading window.innerWidth directly here made this computed go stale while
// VirtualGrid re-flowed to the new column count, which left gaps between the rows.
const rowHeight = computed(() => {
  const containerW = (gridContainer.value?.clientWidth ?? 1200) - 32;
  const c = getGridCols(viewportWidth.value);
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

// Picks from the games currently in the grid, so "random" stays inside whatever the user has
// filtered down to instead of jumping to a game they cannot see.
const openRandomGame = () => {
  if (games.value.length === 0) return;
  const pick = games.value[Math.floor(Math.random() * games.value.length)];
  if (pick) goDetail(pick.id);
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
        newSet.add(ids[i]);
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

// Batch actions confirm first (one summary dialog for the whole selection) so a
// mis-click on "Delete (23)" cannot destroy a third of the library in one go.
const onBatchDelete = async () => {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  const ok = await confirm({
    title: `Delete ${ids.length} game(s)?`,
    message: 'This action cannot be undone.',
    okLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  await api.post('/games/batch-delete', { ids });
  exitSelectMode();
  await loadGames();
};

const onBatchUnfavorite = async () => {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  const ok = await confirm({
    title: `Remove ${ids.length} game(s) from favorites?`,
    okLabel: 'Unfavorite',
  });
  if (!ok) return;
  await api.post('/games/batch-unfavorite', { ids });
  exitSelectMode();
  await loadGames();
};

const onBatchArchive = async () => {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  const ok = await confirm({
    title: `Archive ${ids.length} game(s)?`,
    message: 'Archived games only appear in the Archive view.',
    okLabel: 'Archive',
  });
  if (!ok) return;
  await api.post('/games/batch-archive', { ids });
  exitSelectMode();
  await loadGames();
};

const onBatchUnarchive = async () => {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  const ok = await confirm({
    title: `Restore ${ids.length} game(s) from the archive?`,
    okLabel: 'Unarchive',
  });
  if (!ok) return;
  await api.post('/games/batch-unarchive', { ids });
  exitSelectMode();
  await loadGames();
};

const handleToggleFavorite = async (id: number) => {
  const game = games.value.find((g) => g.id === id);
  if (!game) return;
  if (game.is_favorite) {
    await api.delete(`/games/${id}/favorite`);
    game.is_favorite = false;
  } else {
    await api.post(`/games/${id}/favorite`);
    game.is_favorite = true;
  }
};

const handleUnfavorite = async (id: number) => {
  await api.delete(`/games/${id}/favorite`);
  games.value = games.value.filter((g) => g.id !== id);
  gameListStore.filteredCount = games.value.length;
};

// Archiving removes the game from the current list (Games/Favorites no longer include it), so
// the row goes away immediately - the same "the list can't show what it just filtered out"
// behavior as unfavorite/delete above.
const handleArchive = async (id: number) => {
  await api.post(`/games/${id}/archive`);
  games.value = games.value.filter((g) => g.id !== id);
  gameListStore.filteredCount = games.value.length;
};

const handleUnarchive = async (id: number) => {
  await api.delete(`/games/${id}/archive`);
  games.value = games.value.filter((g) => g.id !== id);
  gameListStore.filteredCount = games.value.length;
};

const handleDeleteGame = async (id: number) => {
  const ok = await confirm({
    title: 'Delete this game?',
    message: 'This action cannot be undone.',
    okLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  await api.delete(`/games/${id}`);
  games.value = games.value.filter((g) => g.id !== id);
  gameListStore.filteredCount = games.value.length;
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && selectMode.value) {
    exitSelectMode();
  }
};

let loadGamesSeq = 0;

const loadGames = async () => {
  const seq = ++loadGamesSeq;
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
    if (f.r18 === 'yes') params.r18 = 'yes';
    else if (f.r18 === 'no') params.r18 = 'no';
    if (favoritesMode.value) params.favoritesOnly = 'true';
    if (archivedMode.value) params.archivedOnly = 'true';
    params.sortBy = sortBy.value;
    params.sortOrder = sortOrder.value;

    const res = await api.get('/games', { params });
    if (seq !== loadGamesSeq) return;
    games.value = res.data.games;
    gameListStore.filteredCount = res.data.games.length;
  } finally {
    if (seq === loadGamesSeq) loading.value = false;
    void loadDuplicates();
  }
};

// Repair covers for visible games that are missing cover art on disk.
// ── Strategy ──
// • Driven by virtual-scroll visibility: only games in or near the viewport are checked.
// • A cover is fetched through the game's source, so a game without one (never scraped, not a
//   lost cover) is skipped here and never asked about - the server cannot resolve anything for
//   it, and asking on every list load was pure noise. The list reports `hasSource` per game.
// • A cover_path whose file is gone counts as repairable too (`coverMissing`): the server can
//   re-download it, and leaving it out was what kept those cards on a placeholder forever.
// • Games that have a source but whose cover download failed are retried with backoff.
// • The server already has its own 10-min failure-TTL; our backoff avoids hammering it.

interface RepairRecord {
  at: number;
  retries: number;
}
const repRec = new Map<number, RepairRecord>();
const unscrapedIds = new Set<number>();
let repairPending = false;
const BACKOFF_MS = [30_000, 120_000, 300_000, 600_000];

// Where "ask the server to fetch this cover" is decided - one definition, used by the repair pass
// and by the watcher that schedules it.
const needsCoverRepair = (item: GameItem) =>
  (!item.cover_path || item.coverMissing) && item.hasSource;

const rememberFailure = (id: number, at: number) => {
  const prev = repRec.get(id) ?? { at: 0, retries: 0 };
  repRec.set(id, { at, retries: prev.retries + 1 });
};

const lazyRepairCovers = async () => {
  if (repairPending) return;
  const visItems = virtualGrid.value?.getVisibleItems();
  if (!visItems || visItems.length === 0) return;

  const now = Date.now();
  const needsRepair: number[] = [];
  for (const vis of visItems) {
    const id = vis.item.id;
    if (unscrapedIds.has(id)) continue;
    // Nothing to repair without a source (see the strategy note above). This is not remembered
    // in unscrapedIds on purpose: the flag comes from the list, which reloads, so a game that
    // gets scraped later must become repairable again without a page reload.
    if (!needsCoverRepair(vis.item)) continue;
    const rec = repRec.get(id);
    if (rec) {
      const delay = BACKOFF_MS[Math.min(rec.retries, BACKOFF_MS.length - 1)] ?? 600_000;
      if (now - rec.at < delay) continue;
    }
    needsRepair.push(id);
    if (needsRepair.length >= 8) break;
  }
  if (needsRepair.length === 0) return;

  repairPending = true;
  try {
    // A row that has to re-read its source can spend 15s downloading, 3 x 15s retrying the entry
    // and 15s again - so the default 30s request timeout aborts batches the server is still
    // working on, and (before the catch below) the abort was invisible to the backoff.
    const res = await api.post(
      '/cover/repair',
      { gameIds: needsRepair, limit: 8 },
      { timeout: 90_000 },
    );
    const repaired: { gameId: number; coverPath: string }[] = res.data?.repaired ?? [];
    // Both are per game, and both mean "stop asking": noSource for a game the repair pass has no
    // source for at all, hopelessIds for one whose source offers nothing to derive or re-read.
    // A request-level counter could not tell either of those from a game whose download simply
    // failed, so those ids came back on every list load, forever.
    const giveUpIds = new Set<number>([
      ...(res.data?.noSource ?? []),
      ...(res.data?.hopelessIds ?? []),
    ]);

    if (repaired.length > 0) {
      const byId = new Map(repaired.map((r) => [r.gameId, r.coverPath]));
      for (const game of games.value) {
        const coverPath = byId.get(game.id);
        if (!coverPath) continue;
        if (game.cover_path !== coverPath) game.cover_path = coverPath;
        // A re-download can land on the same file name, so this flag - not cover_path - is what
        // tells the card that the placeholder can go.
        game.coverMissing = false;
      }
    }

    for (const id of needsRepair) {
      if (repaired.some((r) => r.gameId === id)) {
        repRec.delete(id);
        continue;
      }
      if (giveUpIds.has(id)) {
        unscrapedIds.add(id);
        repRec.delete(id);
        continue;
      }
      rememberFailure(id, now);
    }
  } catch {
    // Non-critical for the covers, but the batch must not be retried straight away: the request
    // can time out while the server is still downloading, and without a backoff the next
    // visibility change would ask for the same rows again.
    for (const id of needsRepair) rememberFailure(id, Date.now());
  } finally {
    repairPending = false;
  }
};

// Watch visible items and repair covers for games that scroll into view
let repairDebounce: ReturnType<typeof setTimeout> | null = null;
watch(
  () => virtualGrid.value?.getVisibleItems(),
  (visItems) => {
    if (!visItems || visItems.length === 0) return;
    const now = Date.now();
    const hasPending = visItems.some((vis) => {
      const id = vis.item.id;
      if (unscrapedIds.has(id)) return false;
      if (!needsCoverRepair(vis.item)) return false;
      const rec = repRec.get(id);
      if (!rec) return true;
      const delay = BACKOFF_MS[Math.min(rec.retries, BACKOFF_MS.length - 1)] ?? 600_000;
      return now - rec.at >= delay;
    });
    if (!hasPending) return;
    if (repairDebounce) clearTimeout(repairDebounce);
    repairDebounce = setTimeout(() => {
      void lazyRepairCovers();
    }, 300);
  },
);

const searchGames = () => {
  games.value = [];
  void loadGames();
};

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let suppressNextKeywordWatch = false;

watch(keyword, () => {
  if (restoringFilter.value) return;
  if (suppressNextKeywordWatch) {
    suppressNextKeywordWatch = false;
    return;
  }
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    saveFilterState();
    searchGames();
  }, 300);
});

const onSearchClear = () => {
  suppressNextKeywordWatch = true;
  if (searchTimer) clearTimeout(searchTimer);
  searchGames();
};

watch(sortBy, () => {
  saveSortPrefs();
  games.value = [];
  void loadGames();
});

const FILTER_KEY = '__game_lib_filter__';
const FILTER_KEY_FAV = '__game_lib_filter_fav__';
const FILTER_KEY_ARCH = '__game_lib_filter_arch__';

const filterKeyFor = (m: GameListMode) =>
  m === 'favorites' ? FILTER_KEY_FAV : m === 'archived' ? FILTER_KEY_ARCH : FILTER_KEY;
const getFilterKey = () => filterKeyFor(mode.value);

// Filter selections are stored in localStorage (like the sort prefs) so they survive an
// app restart. sessionStorage is cleared when the window closes, which silently reset
// every filter - including Scraped - back to its default on the next launch.
const saveFilterState = () => {
  localStorage.setItem(
    getFilterKey(),
    JSON.stringify({
      keyword: keyword.value,
      filter: currentFilter.value,
    }),
  );
};

const restoreFilterState = () => {
  restoringFilter.value = true;
  try {
    const saved = localStorage.getItem(getFilterKey());
    if (saved) {
      const { keyword: kw, filter } = JSON.parse(saved);
      keyword.value = kw ?? '';
      currentFilter.value = { ...DEFAULT_FILTER, ...filter };
    } else {
      keyword.value = '';
      currentFilter.value = { ...DEFAULT_FILTER };
    }
  } catch {
    /* ignore */
  } finally {
    void nextTick(() => {
      restoringFilter.value = false;
    });
  }
};

const SCROLL_KEY = '__game_lib_scroll__';
const SCROLL_KEY_FAV = '__game_lib_scroll_fav__';
const SCROLL_KEY_ARCH = '__game_lib_scroll_arch__';

const scrollKeyFor = (m: GameListMode) =>
  m === 'favorites' ? SCROLL_KEY_FAV : m === 'archived' ? SCROLL_KEY_ARCH : SCROLL_KEY;
const getScrollKey = () => scrollKeyFor(mode.value);

const saveScrollPosition = () => {
  // The grid is gone once the page unmounts, and `?? 0` would then store a made-up "top of the
  // list" over the real position `onBeforeUnmount` just saved - which is why coming back from a
  // detail page landed at the top instead of where the user was.
  if (!virtualGrid.value) return;
  sessionStorage.setItem(getScrollKey(), String(virtualGrid.value.getScrollTop()));
};

let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
const onGridScroll = () => {
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(saveScrollPosition, 100);
};

watch(mode, (_newMode, leaveMode) => {
  // Games, Favorites and Archive are separate views of the same grid, so nothing view-local may
  // carry over: a selection made in one list means nothing in the other (and the batch actions
  // would otherwise fire on ids the user cannot even see).
  exitSelectMode();
  const scrollTop = virtualGrid.value?.getScrollTop() ?? 0;
  sessionStorage.setItem(scrollKeyFor(leaveMode), String(scrollTop));
  localStorage.setItem(
    filterKeyFor(leaveMode),
    JSON.stringify({
      keyword: keyword.value,
      filter: currentFilter.value,
    }),
  );
  games.value = [];
  restoringScroll.value = true;
  restoreFilterState();
  restoreSortPrefs();
  void loadGames().then(() => restoreScroll());
});

const restoreScroll = () => {
  const key = getScrollKey();
  const saved = sessionStorage.getItem(key);
  if (!saved) {
    restoringScroll.value = false;
    return;
  }
  sessionStorage.removeItem(key);
  const top = Number(saved);
  if (!top) {
    restoringScroll.value = false;
    return;
  }
  void nextTick(() => {
    setTimeout(() => {
      virtualGrid.value?.scrollTo(top);
      restoringScroll.value = false;
    }, 150);
  });
};

const getSourceUrl = (source: string, sourceId: string): string => {
  if (source === 'dlsite')
    return `https://www.dlsite.com/maniax/work/=/product_id/${sourceId}.html`;
  if (source === 'dmm') return `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${sourceId}/`;
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
    nsfw?: boolean | undefined;
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
      nsfw: data.detail.nsfw,
    });
    await loadGames();
  } catch {
    // handled by error interceptor
  }
};

let hasNotifiedReady = false;
const notifyInitialRenderComplete = () => {
  if (hasNotifiedReady) return;
  hasNotifiedReady = true;
  void nextTick(() => {
    if (window.electronAPI?.readyForBackgroundTasks) {
      void window.electronAPI.readyForBackgroundTasks();
    } else {
      void api.post('/tasks/start-workers').catch(() => {});
    }
  });
};

onMounted(() => {
  restoreFilterState();
  restoringScroll.value = true;
  void loadGames().then(() => {
    restoreScroll();
    notifyInitialRenderComplete();
  });
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  saveScrollPosition();
  saveFilterState();
  // Pending debounces outlive the component otherwise: the scroll one would overwrite the
  // position saved above, and the search one would fire a request for a list nobody is on.
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  if (searchTimer) clearTimeout(searchTimer);
  if (repairDebounce) clearTimeout(repairDebounce);
  gameListStore.filteredCount = 0;
});
</script>

<style scoped>
.virtual-grid-wrapper {
  transition: opacity 0.15s ease;
}
.drag-select-rect {
  position: absolute;
  border: 2px dashed var(--primary);
  background: color-mix(in oklab, var(--primary) 12%, transparent);
  pointer-events: none;
  z-index: 1000;
}
.drop-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in oklab, var(--background) 92%, transparent);
  z-index: 1001;
  border: 3px dashed var(--primary);
  border-radius: var(--radius);
  pointer-events: none;
}
</style>
