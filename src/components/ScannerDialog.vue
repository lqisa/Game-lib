<template>
  <Dialog :open="modelValue ?? false" @update:open="modelValue = $event">
    <DialogContent
      class="top-0 left-0 flex h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-none"
      @pointer-down-outside.prevent
    >
      <DialogHeader class="h-14 shrink-0 flex-row items-center gap-3 space-y-0 border-b px-4">
        <div class="bg-primary/15 flex size-9 shrink-0 items-center justify-center rounded-xl">
          <Search class="text-primary size-5" />
        </div>
        <DialogTitle class="text-sm font-semibold">Scan & Scrape</DialogTitle>
        <DialogDescription class="sr-only">
          Scan a library for unscraped games, search metadata sources in bulk and submit the adopted
          matches.
        </DialogDescription>
      </DialogHeader>

      <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-4">
        <div
          v-if="scanning"
          class="bg-background/60 absolute inset-0 z-20 flex flex-col items-center justify-center gap-2"
        >
          <Loader2 class="text-primary size-6 animate-spin" />
          <span class="text-muted-foreground text-sm">Scanning...</span>
        </div>

        <div class="mb-4 flex flex-wrap items-center gap-2">
          <Select v-model="selectedLibrary" @update:model-value="onLibraryChange">
            <SelectTrigger size="sm" class="min-w-[200px] text-[13px]">
              <SelectValue placeholder="Select Library" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="lib in libraries" :key="lib.id" :value="lib.id">
                {{ lib.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button class="h-8" :disabled="!selectedLibrary || scanning" @click="scanDir">
            <Loader2 v-if="scanning" class="size-4 animate-spin" />
            <FolderOpen v-else class="size-4" />
            Scan
          </Button>
          <Button
            v-if="!scraping"
            variant="secondary"
            class="h-8"
            :disabled="!hasPending"
            @click="startBatchScrape"
          >
            <Wand2 class="size-4" />
            Scrape All
          </Button>
          <Tooltip v-else>
            <TooltipTrigger as-child>
              <Button variant="secondary" class="h-8" @click="togglePause">
                <Play v-if="scrapePaused" class="size-4" />
                <Pause v-else class="size-4" />
                {{ scrapeDone }} / {{ scrapeTotal }}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{
              scrapePaused ? 'Click to resume' : 'Click to pause'
            }}</TooltipContent>
          </Tooltip>
          <Button variant="outline" class="h-8" :disabled="totalCount === 0" @click="forceRefresh">
            <RefreshCw class="size-4" />
            Force Refresh
          </Button>
          <Button
            class="h-8"
            :disabled="submitting || (adoptedCount === 0 && staleCount === 0)"
            @click="submitAdopted"
          >
            <Loader2 v-if="submitting" class="size-4 animate-spin" />
            <Check v-else class="size-4" />
            Submit
            <span
              v-if="adoptedCount > 0"
              class="bg-background text-success rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            >
              {{ adoptedCount }}
            </span>
          </Button>
          <span
            v-if="staleCount > 0"
            class="bg-destructive/15 text-destructive rounded px-1.5 py-0.5 text-xs font-medium"
          >
            {{ staleCount }} to delete
          </span>
          <span
            v-else-if="totalCount > 0"
            class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs font-medium"
          >
            {{ totalCount }} unscraped
          </span>
          <div class="flex-1" />
          <div class="relative w-[180px]">
            <Search class="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2" />
            <Input
              v-model="searchKeyword"
              placeholder="Search..."
              class="h-8 pr-7 pl-8 text-[13px]"
            />
            <button
              v-if="searchKeyword"
              type="button"
              aria-label="Clear search"
              class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              @click="searchKeyword = ''"
            >
              <X class="size-3.5" />
            </button>
          </div>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                :class="compact ? 'text-muted-foreground' : 'text-primary'"
                @click="compact = !compact"
              >
                <Rows3 v-if="compact" class="size-4" />
                <LayoutList v-else class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{
              compact ? 'Compact view (48px)' : 'Large view (260px)'
            }}</TooltipContent>
          </Tooltip>
        </div>

        <div
          class="grid h-9 shrink-0 items-center border-b bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          :class="
            compact
              ? 'grid-cols-[40px_1fr_60px_180px] gap-x-2'
              : 'grid-cols-[180px_1fr_70px_200px] gap-x-3'
          "
        >
          <div class="h-full w-full" />
          <button
            type="button"
            class="hover:text-primary flex items-center gap-1 transition-colors select-none"
            @click="toggleSort('name')"
          >
            <span>Name</span>
            <ChevronUp v-if="sortBy === 'name' && sortOrder === 'asc'" class="size-3.5" />
            <ChevronDown v-if="sortBy === 'name' && sortOrder === 'desc'" class="size-3.5" />
          </button>
          <button
            type="button"
            class="hover:text-primary flex items-center gap-1 transition-colors select-none"
            @click="toggleSort('status')"
          >
            <span>Status</span>
            <ChevronUp v-if="sortBy === 'status' && sortOrder === 'asc'" class="size-3.5" />
            <ChevronDown v-if="sortBy === 'status' && sortOrder === 'desc'" class="size-3.5" />
          </button>
          <button
            type="button"
            class="hover:text-primary flex items-center gap-1 transition-colors select-none"
            @click="toggleSort('action')"
          >
            <span>Action</span>
            <ChevronUp v-if="sortBy === 'action' && sortOrder === 'asc'" class="size-3.5" />
            <ChevronDown v-if="sortBy === 'action' && sortOrder === 'desc'" class="size-3.5" />
          </button>
        </div>

        <VirtualList :items="sortedResults" :item-key="(r) => r.subPath" :item-height="rowHeight">
          <template #default="{ item: row }">
            <div
              class="grid h-full items-center border-b pr-4 text-sm transition-colors hover:bg-accent/50"
              :class="[
                compact
                  ? 'grid-cols-[40px_1fr_60px_180px] gap-x-2'
                  : 'grid-cols-[180px_1fr_70px_200px] gap-x-3',
                row.status === 'stale' ? 'bg-destructive/10' : '',
              ]"
              :style="{ paddingLeft: `${24 + row.depth * 24}px` }"
            >
              <div>
                <div v-if="row.searchResult?.coverUrl">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div
                        class="bg-muted relative flex items-center justify-center overflow-hidden"
                        :class="compact ? 'size-10 rounded' : 'h-[240px] w-[180px] rounded-md'"
                      >
                        <img
                          :src="resolveCoverUrl(row.searchResult.coverUrl)"
                          class="absolute inset-0 z-[1] h-full w-full object-cover"
                          @error="
                            (e) => {
                              const img = e.target as HTMLImageElement;
                              img.style.display = 'none';
                              img.dataset.error = '1';
                            }
                          "
                          @load="
                            (e) => {
                              const img = e.target as HTMLImageElement;
                              if (img.dataset.error) {
                                img.style.display = '';
                                delete img.dataset.error;
                              }
                            }
                          "
                        />
                        <Image
                          class="text-muted-foreground pointer-events-none z-0"
                          :class="compact ? 'size-4' : 'size-12'"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      align="start"
                      :side-offset="8"
                      class="border-none bg-transparent p-0 shadow-none [&>span]:hidden"
                    >
                      <img
                        :src="resolveCoverUrl(row.searchResult.coverUrl)"
                        class="block max-h-[320px] w-[240px] rounded object-contain"
                      />
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div
                  v-else
                  class="bg-muted flex items-center justify-center"
                  :class="compact ? 'size-10 rounded' : 'h-[240px] w-[180px] rounded-md'"
                >
                  <component
                    :is="row.isArchive ? Archive : Folder"
                    class="text-muted-foreground"
                    :class="compact ? 'size-4' : 'size-12'"
                  />
                </div>
              </div>

              <div class="min-w-0 overflow-hidden">
                <div class="flex items-center">
                  <Tooltip v-if="row.hasChildren !== false && !row.isArchive">
                    <TooltipTrigger as-child>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        class="mr-1 shrink-0"
                        :disabled="row.loading && row.children.length === 0"
                        @click="expandRow(row)"
                      >
                        <Loader2
                          v-if="row.loading && row.children.length === 0"
                          class="size-3 animate-spin"
                        />
                        <ChevronDown v-else-if="row.expanded" class="size-3" />
                        <ChevronRight v-else class="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ row.expanded ? 'Collapse' : 'Expand scan' }}</TooltipContent>
                  </Tooltip>
                  <span v-else class="w-7 shrink-0" />
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <span class="min-w-0 truncate">{{ row.name }}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start">{{ row.subPath }}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        class="text-muted-foreground ml-1 shrink-0"
                        @click="openFolder(row)"
                      >
                        <FolderOpen class="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open Folder</TooltipContent>
                  </Tooltip>
                </div>
                <div v-if="row.searchResult" class="mt-1 flex items-center">
                  <span
                    v-if="row.source"
                    class="mr-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                    :class="sourceColor(row.source)"
                    >{{ row.source }}</span
                  >
                  <span class="truncate text-xs">{{ row.searchResult.name }}</span>
                  <span class="text-muted-foreground ml-2 shrink-0 text-xs">{{
                    row.searchResult.id
                  }}</span>
                </div>
              </div>

              <div class="flex items-center">
                <span
                  v-if="row.status === 'adopted'"
                  class="bg-success/15 text-success rounded px-1.5 py-0.5 text-[11px] font-medium"
                  >Adopted</span
                >
                <span
                  v-else-if="row.status === 'searching'"
                  class="bg-warning/15 text-warning rounded px-1.5 py-0.5 text-[11px] font-medium"
                  >Searching...</span
                >
                <span
                  v-else-if="row.status === 'error'"
                  class="bg-destructive/15 text-destructive rounded px-1.5 py-0.5 text-[11px] font-medium"
                  >Failed</span
                >
                <span
                  v-else-if="row.status === 'searched'"
                  class="bg-info/15 text-info rounded px-1.5 py-0.5 text-[11px] font-medium"
                  >Searched</span
                >
                <span
                  v-else-if="row.status === 'stale'"
                  class="bg-destructive/15 text-destructive rounded px-1.5 py-0.5 text-[11px] font-medium"
                  >Stale</span
                >
                <span
                  v-else
                  class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px] font-medium"
                  >Pending</span
                >
              </div>

              <div class="flex items-center">
                <template v-if="row.status === 'stale'">
                  <span class="text-muted-foreground text-xs italic">Directory not found</span>
                </template>
                <template v-else>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-primary h-7 min-w-[56px] px-2 text-xs"
                    :disabled="row.status !== 'searched' && row.status !== 'adopted'"
                    @click="openScrapeDialog(row)"
                  >
                    Reselect
                  </Button>
                  <Button
                    v-if="row.status === 'pending' || row.status === 'error'"
                    size="sm"
                    class="ml-1 h-7 min-w-[64px] px-2 text-xs"
                    @click="openScrapeDialog(row)"
                  >
                    Scrape
                  </Button>
                  <Button
                    v-else-if="row.status === 'searched'"
                    size="sm"
                    class="bg-success/15 text-success hover:bg-success/25 ml-1 h-7 min-w-[64px] px-2 text-xs"
                    :disabled="row.loading"
                    @click="quickAdopt(row)"
                  >
                    <Loader2 v-if="row.loading" class="size-3 animate-spin" />
                    Adopt
                  </Button>
                  <Button
                    v-else-if="row.status === 'adopted'"
                    variant="destructive"
                    size="sm"
                    class="ml-1 h-7 min-w-[64px] px-2 text-xs"
                    @click="discardRow(row)"
                  >
                    Cancel
                  </Button>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        class="text-muted-foreground ml-1"
                        @click="blacklistRow = row"
                      >
                        <Ban class="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Add to blacklist</TooltipContent>
                  </Tooltip>
                </template>
              </div>
            </div>
          </template>
        </VirtualList>
      </div>
    </DialogContent>

    <ScrapeDialog
      v-model="showScrapeDialog"
      :game-name="scrapingRow?.name || ''"
      :game-id="scrapingRow?.gameId || 0"
      :default-keyword="scrapingRow?.searchKeyword"
      :default-source="scrapingRow?.source || undefined"
      :initial-results="
        scrapingRow ? (searchCache.get(cacheKey(scrapingRow))?.results ?? null) : null
      "
      :initial-segments="scrapingRow ? segmentsCache.get(scrapingRow.name) || null : null"
      :folder-path="scrapingRow ? getRowFolderPath(scrapingRow) : null"
      @adopted="onAdopted"
      @searched="onSearched"
    />

    <Dialog :open="showConflictDialog" @update:open="onConflictDialogOpen">
      <DialogContent class="w-[500px] max-w-[80vw] sm:max-w-[500px]" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle class="text-warning flex items-center gap-2 text-base">
            <TriangleAlert class="size-5" />
            Source Conflict Detected
          </DialogTitle>
          <DialogDescription class="text-sm">
            The following sources are already used by other games. Submitting will share the source.
            Do you want to continue?
          </DialogDescription>
        </DialogHeader>
        <div class="max-h-[50vh] overflow-auto">
          <div v-for="(conflict, i) in conflictData" :key="i" class="mb-4">
            <div class="flex items-center gap-1.5 text-sm font-medium">
              <span
                class="rounded px-1.5 py-0.5 text-[10px] font-medium"
                :class="sourceColor(conflict.sourceType as SourceType)"
                >{{ conflict.sourceType }}</span
              >
              ID: {{ conflict.sourceId }}
            </div>
            <div
              v-for="game in conflict.games"
              :key="game.gameId"
              class="text-muted-foreground mt-1 ml-4 flex items-center gap-1.5 text-xs"
            >
              <Gamepad2 class="size-3.5 shrink-0" />
              {{ game.name }} (ID: {{ game.gameId }})
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" class="text-destructive" @click="cancelConflictSubmit">
            Cancel
          </Button>
          <Button size="sm" @click="confirmConflictSubmit">Confirm Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="showBlacklistDialog" @update:open="showBlacklistDialog = $event">
      <DialogContent class="w-[400px] max-w-[80vw] sm:max-w-[400px]" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle class="text-warning flex items-center gap-2 text-base">
            <TriangleAlert class="size-5" />
            Add to Blacklist
          </DialogTitle>
          <DialogDescription class="text-sm">
            Add <strong>{{ blacklistRow?.subPath }}</strong> to blacklist? This directory will be
            excluded from all scan results and game lists.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" @click="showBlacklistDialog = false">Cancel</Button>
          <Button variant="destructive" size="sm" @click="confirmBlacklist">Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Archive,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Folder,
  FolderOpen,
  Gamepad2,
  Image,
  LayoutList,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Rows3,
  Search,
  TriangleAlert,
  Wand2,
  X,
} from '@lucide/vue';
import api from '../composables/useApi';
import { splitKeyword, segmentsCache, ARCHIVE_EXT_RE } from '../composables/useSplitKeyword';
// Shared with the server (plain ESM, no node deps) so both sides decide matches the
// same way - the server uses it for /scraper/auto/search, the client for cached results.
import { bestMatch } from '../../server/scraper/match.js';
import { useExpressUrl } from '../composables/useExpressUrl';
import ScrapeDialog from './ScrapeDialog.vue';
import VirtualList from './VirtualList.vue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SourceType, SearchResult, DetailResult, AdoptData } from '../types/scrape';

const { resolveCoverUrl } = useExpressUrl();

interface AdoptCacheEntry {
  game_id: number;
  library_id: number;
  sub_path: string;
  source_type: string;
  source_id: string;
  source_url: string | null;
  name: string | null;
  cover_url: string | null;
  makers: string[];
  genres: string[];
  tags: string[];
  description: string | null;
  /** Vendor adult flag as stored: 1/0, or null when the vendor publishes none. */
  nsfw: number | null;
}

interface ScanRow {
  gameId: number;
  name: string;
  subPath: string;
  status: 'pending' | 'searching' | 'searched' | 'adopted' | 'error' | 'stale';
  searchResult: SearchResult | null;
  adoptData: AdoptData | null;
  searchKeyword: string;
  source: SourceType | null;
  loading: boolean;
  children: ScanRow[];
  expanded: boolean;
  isArchive: boolean;
  depth: number;
  hasChildren: boolean | null;
}

interface SubmitGame {
  gameId: number;
  subPath: string;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
  name: string;
  coverUrl: string;
  makers: string[];
  genres: string[];
  tags: string[];
  description: string;
  /** Vendor adult flag, straight from the detail read (Bangumi publishes one per entry). */
  nsfw?: boolean | undefined;
}

interface ConflictInfo {
  sourceType: string;
  sourceId: string;
  games: { gameId: number; name: string }[];
}

const modelValue = defineModel<boolean | null>({ default: false });
const emit = defineEmits<{ done: [] }>();

const libraries = ref<{ id: number; name: string; path: string }[]>([]);
const selectedLibrary = ref<number | null>(null);
const scanResults = ref<ScanRow[]>([]);
const scanning = ref(false);
const submitting = ref(false);
const scraping = ref(false);
const showConflictDialog = ref(false);
const conflictData = ref<ConflictInfo[]>([]);
const pendingSubmitData = ref<{ games: SubmitGame[]; staleRows: ScanRow[] } | null>(null);
const scrapePaused = ref(false);
const scrapeDone = ref(0);
const scrapeTotal = ref(0);

const showScrapeDialog = ref(false);
const scrapingRow = ref<ScanRow | null>(null);

const searchCache = new Map<string, { source: string; results: SearchResult[] }>();
const detailCache = new Map<string, DetailResult>();

const cacheKey = (row: ScanRow) => `${row.source || 'auto'}:${row.searchKeyword}`;

// The old Quasar color names are gone; each source keeps a distinct hue through token
// tints, so it still reads as a tag instead of a status.
const sourceColor = (source: SourceType) => {
  if (source === 'dlsite') return 'bg-primary/15 text-primary';
  if (source === 'dmm') return 'bg-destructive/15 text-destructive';
  if (source === 'bangumi') return 'bg-warning/15 text-warning';
  if (source === 'vndb') return 'bg-info/15 text-info';
  if (source === 'steam') return 'bg-secondary text-secondary-foreground';
  return 'bg-muted text-muted-foreground';
};

const getSourceUrl = (source: SourceType, sourceId: string): string => {
  if (source === 'dlsite')
    return `https://www.dlsite.com/maniax/work/=/product_id/${sourceId}.html`;
  if (source === 'dmm') return `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${sourceId}/`;
  if (source === 'bangumi') return `https://bgm.tv/subject/${sourceId}`;
  if (source === 'vndb') return `https://vndb.org/${sourceId}`;
  if (source === 'steam') return `https://store.steampowered.com/app/${sourceId}`;
  return '';
};

const sortBy = ref<'none' | 'name' | 'status' | 'action'>('none');
const sortOrder = ref<'asc' | 'desc'>('asc');
const searchKeyword = ref('');
const compact = ref(false);
const rowHeight = computed(() => (compact.value ? 48 : 260));

const toggleSort = (field: 'name' | 'status' | 'action') => {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = field;
    sortOrder.value = 'asc';
  }
};

const statusOrder: Record<ScanRow['status'], number> = {
  stale: 0,
  error: 1,
  pending: 2,
  searching: 3,
  searched: 4,
  adopted: 5,
};

const actionOrder: Record<ScanRow['status'], number> = {
  pending: 0,
  error: 1,
  searched: 2,
  searching: 3,
  adopted: 4,
  stale: 5,
};

const flattenTree = (rows: ScanRow[]): ScanRow[] => {
  const result: ScanRow[] = [];
  for (const row of rows) {
    result.push(row);
    if (row.expanded && row.children.length > 0) {
      result.push(...flattenTree(row.children));
    }
  }
  return result;
};

const flattenAllRows = (rows: ScanRow[]): ScanRow[] => {
  const result: ScanRow[] = [];
  for (const row of rows) {
    result.push(row);
    if (row.children.length > 0) {
      result.push(...flattenAllRows(row.children));
    }
  }
  return result;
};

const flattenTreeSorted = (
  rows: ScanRow[],
  field: 'name' | 'status' | 'action',
  order: 'asc' | 'desc',
): ScanRow[] => {
  const sorted = [...rows].sort((a, b) => {
    let cmp: number;
    if (field === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    } else {
      const ord = field === 'status' ? statusOrder : actionOrder;
      cmp = ord[a.status] - ord[b.status];
    }
    return order === 'desc' ? -cmp : cmp;
  });
  const result: ScanRow[] = [];
  for (const row of sorted) {
    result.push(row);
    if (row.expanded && row.children.length > 0) {
      result.push(...flattenTreeSorted(row.children, field, order));
    }
  }
  return result;
};

const sortedResults = computed(() => {
  const list =
    sortBy.value === 'none'
      ? flattenTree(scanResults.value)
      : flattenTreeSorted(scanResults.value, sortBy.value, sortOrder.value);
  const kw = searchKeyword.value?.trim().toLowerCase();
  if (kw) {
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(kw) ||
        r.subPath.toLowerCase().includes(kw) ||
        (r.searchResult?.name?.toLowerCase().includes(kw) ?? false),
    );
  }
  return list;
});

const hasPending = computed(() =>
  flattenAllRows(scanResults.value).some((r) => r.status === 'pending' || r.status === 'error'),
);
const adoptedCount = computed(
  () => flattenAllRows(scanResults.value).filter((r) => r.status === 'adopted').length,
);
const staleCount = computed(
  () => flattenAllRows(scanResults.value).filter((r) => r.status === 'stale').length,
);
const totalCount = computed(() => flattenAllRows(scanResults.value).length);

let scrapeConcurrency = 4;
let matchThreshold = 0.8;

const fetchSettings = async () => {
  try {
    const res = await api.get('/settings/scrape_concurrency');
    scrapeConcurrency = parseInt(res.data.value, 10) || 4;
  } catch {
    scrapeConcurrency = 4;
  }
  try {
    const res = await api.get('/settings/match_threshold');
    const parsed = Number(res.data.value);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1) matchThreshold = parsed;
  } catch {
    matchThreshold = 0.8;
  }
};

const fetchLibraries = async () => {
  const res = await api.get('/libraries');
  libraries.value = res.data;
  if (!selectedLibrary.value && libraries.value.length > 0) {
    selectedLibrary.value = libraries.value[0].id;
  }
};

const loadUnscraped = async () => {
  if (!selectedLibrary.value) {
    scanResults.value = [];
    return;
  }
  const res = await api.get('/games/unscraped', { params: { libraryId: selectedLibrary.value } });
  scanResults.value = res.data.map((g: { id: number; name: string; sub_path: string }) => {
    const isArchive = ARCHIVE_EXT_RE.test(g.name);
    const cleanName = isArchive ? g.name.replace(ARCHIVE_EXT_RE, '') : g.name;
    return {
      name: cleanName,
      subPath: g.sub_path,
      status: 'pending' as const,
      searchResult: null,
      adoptData: null,
      searchKeyword: cleanName,
      source: null as SourceType | null,
      loading: false,
      gameId: g.id,
      children: [],
      expanded: false,
      isArchive,
      depth: 0,
      hasChildren: null,
    };
  });

  for (const row of scanResults.value) {
    const { keyword, segments } = splitKeyword(row.name);
    segmentsCache.set(row.name, [keyword, ...segments.filter((s) => s !== keyword)]);
  }

  await preloadCache();
  await preloadAdoptCache();
};

const preloadCache = async () => {
  const allRows = flattenAllRows(scanResults.value);
  if (allRows.length === 0) return;
  const keywords = allRows.map((r) => r.searchKeyword || r.name);
  try {
    const res = await api.post('/cache/search/preload', { keywords });
    const entries = res.data.entries || [];
    for (const entry of entries) {
      searchCache.set(entry.key, { source: entry.source, results: entry.results });
    }
  } catch {
    // preload failure is non-critical
  }
};

const preloadAdoptCache = async () => {
  const allRows = flattenAllRows(scanResults.value);
  if (allRows.length === 0) return;
  const realIdRows = allRows.filter((r) => r.gameId > 0);
  const tempIdRows = allRows.filter((r) => r.gameId === 0);
  const gameIds = realIdRows.map((r) => r.gameId);
  const subPaths = tempIdRows.map((r) => r.subPath);
  try {
    const params: Record<string, string> = {};
    if (gameIds.length > 0) params.gameIds = gameIds.join(',');
    if (subPaths.length > 0 && selectedLibrary.value) {
      params.libraryId = String(selectedLibrary.value);
      params.subPaths = subPaths.join(',');
    }
    if (!params.gameIds && !params.subPaths) return;
    const res = await api.get('/cache/adopt', { params });
    const entries: AdoptCacheEntry[] = res.data.entries || [];
    const adoptByGameId = new Map(
      entries.filter((e) => e.game_id > 0).map((e): [number, AdoptCacheEntry] => [e.game_id, e]),
    );
    const adoptBySubPath = new Map(
      entries.filter((e) => e.sub_path).map((e): [string, AdoptCacheEntry] => [e.sub_path, e]),
    );
    for (const row of allRows) {
      const cached =
        row.gameId > 0 ? adoptByGameId.get(row.gameId) : adoptBySubPath.get(row.subPath);
      if (cached) {
        row.source = cached.source_type as SourceType;
        row.searchResult = {
          id: cached.source_id,
          name: cached.name || row.name,
          makerName: '',
          coverUrl: cached.cover_url || '',
        };
        row.adoptData = {
          source: cached.source_type as SourceType,
          sourceId: cached.source_id,
          name: cached.name || row.name,
          makerName: '',
          coverUrl: cached.cover_url || '',
          detail: {
            id: cached.source_id,
            title: cached.name || row.name,
            coverURL: cached.cover_url || '',
            makers: cached.makers || [],
            genres: cached.genres || [],
            tags: cached.tags || [],
            description: cached.description || '',
            nsfw: cached.nsfw === 1,
          },
        };
        row.status = 'adopted';
      }
    }
  } catch {
    // preload failure is non-critical
  }
};

const onLibraryChange = () => {
  void loadUnscraped();
};

const scanDir = async () => {
  if (!selectedLibrary.value) return;
  scanning.value = true;
  try {
    const res = await api.post('/games/scan', { libraryId: selectedLibrary.value });
    const newEntries: string[] = res.data.newDirs;
    const allArchives: string[] = res.data.archives || [];
    const archiveSet = new Set(allArchives);
    const removedGames: { id: number; name: string; sub_path: string }[] =
      res.data.removedGames || [];

    const allRows = flattenAllRows(scanResults.value);
    const removedPaths = new Set(removedGames.map((g) => g.sub_path));
    const existingGameIds = new Set(allRows.map((r) => r.gameId));
    for (const row of allRows) {
      if (removedPaths.has(row.subPath)) {
        row.status = 'stale';
      }
    }
    for (const g of removedGames) {
      if (!existingGameIds.has(g.id)) {
        scanResults.value.push({
          gameId: g.id,
          name: g.name,
          subPath: g.sub_path,
          status: 'stale',
          searchResult: null,
          adoptData: null,
          searchKeyword: g.name,
          source: null,
          loading: false,
          children: [],
          expanded: false,
          isArchive: false,
          depth: 0,
          hasChildren: null,
        });
      }
    }

    if (newEntries.length > 0) {
      const addRes = await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: newEntries,
      });
      const addedGames: { id: number; name: string; sub_path: string }[] = addRes.data.games || [];
      const existingPaths = new Set(allRows.map((r) => r.subPath));
      for (const g of addedGames) {
        if (!existingPaths.has(g.sub_path)) {
          const isArchive = archiveSet.has(g.sub_path);
          const { keyword, segments } = splitKeyword(g.name);
          segmentsCache.set(g.name, [keyword, ...segments.filter((s) => s !== keyword)]);
          scanResults.value.push({
            gameId: g.id,
            name: g.name,
            subPath: g.sub_path,
            status: 'pending',
            searchResult: null,
            adoptData: null,
            searchKeyword: isArchive ? g.name.replace(ARCHIVE_EXT_RE, '') : g.name,
            source: null,
            loading: false,
            children: [],
            expanded: false,
            isArchive,
            depth: 0,
            hasChildren: null,
          });
        }
      }
      const newRows = scanResults.value.filter((r) => addedGames.some((g) => g.id === r.gameId));
      if (newRows.length > 0) {
        const keywords = newRows.map((r) => r.searchKeyword || r.name);
        try {
          const cacheRes = await api.post('/cache/search/preload', { keywords });
          const entries = cacheRes.data.entries || [];
          for (const entry of entries) {
            searchCache.set(entry.key, { source: entry.source, results: entry.results });
          }
        } catch {
          // preload failure is non-critical
        }
        const newGameIds = newRows.map((r) => r.gameId);
        try {
          const adoptRes = await api.get('/cache/adopt', {
            params: { gameIds: newGameIds.join(',') },
          });
          const entries: AdoptCacheEntry[] = adoptRes.data.entries || [];
          const adoptMap = new Map(entries.map((e): [number, AdoptCacheEntry] => [e.game_id, e]));
          for (const row of newRows) {
            const cached = adoptMap.get(row.gameId);
            if (cached) {
              row.source = cached.source_type as SourceType;
              row.searchResult = {
                id: cached.source_id,
                name: cached.name || row.name,
                makerName: '',
                coverUrl: cached.cover_url || '',
              };
              row.adoptData = {
                source: cached.source_type as SourceType,
                sourceId: cached.source_id,
                name: cached.name || row.name,
                makerName: '',
                coverUrl: cached.cover_url || '',
                detail: {
                  id: cached.source_id,
                  title: cached.name || row.name,
                  coverURL: cached.cover_url || '',
                  makers: cached.makers || [],
                  genres: cached.genres || [],
                  tags: cached.tags || [],
                  description: cached.description || '',
                  nsfw: cached.nsfw === 1,
                },
              };
              row.status = 'adopted';
            }
          }
        } catch {
          // preload failure is non-critical
        }
      }
    }
  } finally {
    scanning.value = false;
  }
};

const openScrapeDialog = (row: ScanRow) => {
  scrapingRow.value = row;
  showScrapeDialog.value = true;
};

const expandRow = async (row: ScanRow) => {
  if (row.expanded) {
    row.expanded = false;
    return;
  }
  if (row.children.length > 0) {
    row.expanded = true;
    return;
  }
  if (!selectedLibrary.value) return;

  row.loading = true;
  try {
    const res = await api.post('/games/scan/expand', {
      libraryId: selectedLibrary.value,
      subPath: row.subPath,
    });
    const dirs: string[] = res.data.dirs || [];
    const archives: string[] = res.data.archives || [];
    const hasSubDirs: Record<string, boolean> = res.data.hasSubDirs || {};
    const existingPaths: Set<string> = new Set(res.data.existingPaths || []);

    const allEntries = [...dirs, ...archives].filter((e) => !existingPaths.has(e));
    if (allEntries.length === 0) {
      row.hasChildren = false;
      return;
    }

    const childDepth = row.depth + 1;
    for (const entry of allEntries) {
      const isArchive = archives.includes(entry);
      const dirName = entry.split('/').pop() || entry;
      const displayName = isArchive
        ? dirName.replace(/\.(7z|zip)\.\d+$|\.part\d+\.rar$|\.rar(\.r\d+)?$|\.(zip|7z|rar)$/i, '')
        : dirName;
      const { keyword, segments } = splitKeyword(displayName);
      segmentsCache.set(displayName, [keyword, ...segments.filter((s) => s !== keyword)]);
      row.children.push({
        gameId: 0,
        name: displayName,
        subPath: entry,
        status: 'pending',
        searchResult: null,
        adoptData: null,
        searchKeyword: isArchive
          ? displayName.replace(
              /\.(7z|zip)\.\d+$|\.part\d+\.rar$|\.rar(\.r\d+)?$|\.(zip|7z|rar)$/i,
              '',
            )
          : displayName,
        source: null,
        loading: false,
        children: [],
        expanded: false,
        isArchive,
        depth: childDepth,
        hasChildren: hasSubDirs[dirName] === true ? null : false,
      });
    }

    row.expanded = true;
    row.hasChildren = true;

    const newRows = row.children;
    if (newRows.length > 0) {
      const keywords = newRows.map((r) => r.searchKeyword || r.name);
      try {
        const cacheRes = await api.post('/cache/search/preload', { keywords });
        const entries = cacheRes.data.entries || [];
        for (const entry of entries) {
          searchCache.set(entry.key, { source: entry.source, results: entry.results });
        }
      } catch {
        // preload failure is non-critical
      }
      if (selectedLibrary.value) {
        try {
          const subPathList = newRows.map((r) => r.subPath);
          const adoptRes = await api.get('/cache/adopt', {
            params: { libraryId: selectedLibrary.value, subPaths: subPathList.join(',') },
          });
          const adoptEntries: AdoptCacheEntry[] = adoptRes.data.entries || [];
          const adoptBySubPath = new Map(
            adoptEntries.map((e): [string, AdoptCacheEntry] => [e.sub_path, e]),
          );
          for (const child of newRows) {
            const cached = adoptBySubPath.get(child.subPath);
            if (cached) {
              child.source = cached.source_type as SourceType;
              child.searchResult = {
                id: cached.source_id,
                name: cached.name || child.name,
                makerName: '',
                coverUrl: cached.cover_url || '',
              };
              child.adoptData = {
                source: cached.source_type as SourceType,
                sourceId: cached.source_id,
                name: cached.name || child.name,
                makerName: '',
                coverUrl: cached.cover_url || '',
                detail: {
                  id: cached.source_id,
                  title: cached.name || child.name,
                  coverURL: cached.cover_url || '',
                  makers: cached.makers || [],
                  genres: cached.genres || [],
                  tags: cached.tags || [],
                  description: cached.description || '',
                  nsfw: cached.nsfw === 1,
                },
              };
              child.status = 'adopted';
            }
          }
        } catch {
          // adopt cache preload failure is non-critical
        }
      }
    }
  } finally {
    row.loading = false;
  }
};

const onAdopted = (data: AdoptData) => {
  if (!scrapingRow.value) return;
  detailCache.set(`${data.source}:${data.sourceId}`, data.detail);
  scrapingRow.value.searchResult = {
    id: data.sourceId,
    name: data.name,
    makerName: data.makerName,
    coverUrl: data.coverUrl,
  };
  scrapingRow.value.adoptData = data;
  scrapingRow.value.source = data.source;
  scrapingRow.value.status = 'adopted';
  saveAdoptCache(scrapingRow.value);
};

const onSearched = (source: SourceType, keyword: string, results: SearchResult[]) => {
  const key = `${source}:${keyword}`;
  searchCache.set(key, { source, results });
  api
    .post('/cache/search', { key, source, keyword, results })
    .then((res) => {
      if (res.data.results) {
        searchCache.set(key, { source, results: res.data.results });
      }
    })
    .catch(() => {});
};

const saveAdoptCache = (row: ScanRow) => {
  if (!row.adoptData) return;
  const d = row.adoptData;
  api
    .post('/cache/adopt', {
      gameId: row.gameId,
      libraryId: selectedLibrary.value || 0,
      subPath: row.subPath,
      sourceType: d.source,
      sourceId: d.sourceId,
      sourceUrl: getSourceUrl(d.source, d.sourceId),
      name: d.detail.title,
      coverUrl: d.detail.coverURL,
      makers: d.detail.makers,
      genres: d.detail.genres,
      tags: d.detail.tags,
      description: d.detail.description,
      nsfw: d.detail.nsfw,
    })
    .catch(() => {});
};

const quickAdopt = async (row: ScanRow) => {
  if (!row.searchResult) return;
  const dKey = `${row.source || 'dlsite'}:${row.searchResult.id}`;
  const cached = detailCache.get(dKey);
  if (cached) {
    row.adoptData = {
      source: row.source || 'dlsite',
      sourceId: row.searchResult.id,
      name: row.searchResult.name,
      makerName: row.searchResult.makerName,
      coverUrl: row.searchResult.coverUrl,
      detail: cached,
    };
    row.status = 'adopted';
    saveAdoptCache(row);
    return;
  }
  row.loading = true;
  try {
    const fetchBody =
      row.source === 'dlsite' ? { rjcode: row.searchResult.id } : { id: row.searchResult.id };
    const detailRes = await api.post(`/scraper/${row.source || 'dlsite'}/fetch`, fetchBody);
    const detail: DetailResult = detailRes.data || {
      id: row.searchResult.id,
      title: row.searchResult.name,
      coverURL: '',
      makers: [],
      genres: [],
      tags: [],
      description: '',
    };
    if (!detail.coverURL && row.searchResult.coverUrl) {
      detail.coverURL = row.searchResult.coverUrl;
    }
    if (!detail.title && row.searchResult.name) {
      detail.title = row.searchResult.name;
    }
    detailCache.set(dKey, detail);
    row.adoptData = {
      source: row.source || 'dlsite',
      sourceId: row.searchResult.id,
      name: row.searchResult.name,
      makerName: row.searchResult.makerName,
      coverUrl: row.searchResult.coverUrl,
      detail,
    };
    row.status = 'adopted';
    saveAdoptCache(row);
  } catch {
    const sr = row.searchResult;
    const fallback: DetailResult = {
      id: sr.id,
      title: sr.name,
      coverURL: sr.coverUrl,
      makers: [],
      genres: [],
      tags: [],
      description: '',
    };
    detailCache.set(dKey, fallback);
    row.adoptData = {
      source: row.source || 'dlsite',
      sourceId: sr.id,
      name: sr.name,
      makerName: sr.makerName,
      coverUrl: sr.coverUrl,
      detail: fallback,
    };
    row.status = 'adopted';
    saveAdoptCache(row);
  } finally {
    row.loading = false;
  }
};

const discardRow = (row: ScanRow) => {
  row.adoptData = null;
  if (row.gameId > 0) {
    api.delete('/cache/adopt', { params: { gameIds: row.gameId } }).catch(() => {});
  } else if (selectedLibrary.value && row.subPath) {
    api
      .delete('/cache/adopt', {
        params: { libraryId: selectedLibrary.value, subPaths: row.subPath },
      })
      .catch(() => {});
  }
  if (row.status === 'adopted') {
    row.status = row.searchResult ? 'searched' : 'pending';
  } else {
    row.status = 'pending';
    row.searchResult = null;
    row.source = null;
    row.searchKeyword = row.name.match(/RJ\d+/)?.[0] || row.name;
  }
};

const startBatchScrape = () => {
  scrapePaused.value = false;
  void batchScrape();
};

const togglePause = () => {
  scrapePaused.value = !scrapePaused.value;
};

const batchScrape = async () => {
  const rows = flattenAllRows(scanResults.value).filter(
    (r) => r.status === 'pending' || r.status === 'error',
  );
  if (rows.length === 0) return;

  scrapeDone.value = 0;
  scrapeTotal.value = rows.length;
  scraping.value = true;
  const limit = scrapeConcurrency;

  // A game that already has a source must not be scraped again: the user may have
  // scraped it by hand (or a previous run did) while this batch was still going.
  const scrapedIds = new Set<number>();
  const refreshScrapedIds = async () => {
    try {
      const res = await api.get('/games/scraped-ids');
      for (const id of res.data) scrapedIds.add(id);
    } catch {
      // non-critical - keep whatever we already know
    }
  };
  await refreshScrapedIds();
  let processedSinceRefresh = 0;
  const REFRESH_EVERY = 20;

  for (let i = 0; i < rows.length; i += limit) {
    if (!scraping.value) break;
    while (scrapePaused.value) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (processedSinceRefresh >= REFRESH_EVERY) {
      processedSinceRefresh = 0;
      await refreshScrapedIds();
    }
    const chunk = rows.slice(i, i + limit);
    await Promise.all(
      chunk.map(async (row) => {
        if (row.gameId > 0 && scrapedIds.has(row.gameId)) {
          row.status = 'adopted';
          scrapeDone.value++;
          return;
        }
        row.status = 'searching';
        row.loading = true;
        try {
          const keyword = row.searchKeyword || row.name;
          const autoKey = `auto:${keyword}`;
          let cachedEntry = searchCache.get(autoKey);
          if (!cachedEntry) {
            try {
              const dbRes = await api.get('/cache/search', { params: { key: autoKey } });
              if (dbRes.data.hit) {
                cachedEntry = { source: dbRes.data.data.source, results: dbRes.data.data.results };
                searchCache.set(autoKey, cachedEntry);
              }
            } catch {
              // DB lookup failure is non-critical
            }
          }
          if (cachedEntry) {
            row.source = (cachedEntry.source as SourceType | null) || null;
            const cached = cachedEntry.results;
            if (cached.length > 0) {
              const match = bestMatch(row.name, cached, matchThreshold);
              row.searchResult = match ? match.result : (cached[0] ?? null);
              row.status = 'searched';
              if (match) await quickAdopt(row);
            } else {
              row.status = 'error';
            }
          } else {
            const searchRes = await api.post('/scraper/auto/search', { keyword, name: row.name });
            const data = searchRes.data;
            let results: SearchResult[] = data.results ?? [];
            const hitSource = data.source || 'auto';
            row.source = data.source || null;
            try {
              const cacheRes = await api.post('/cache/search', {
                key: autoKey,
                source: hitSource === 'auto' ? 'dlsite' : hitSource,
                keyword,
                results,
              });
              if (cacheRes.data.results) {
                results = cacheRes.data.results;
              }
              searchCache.set(autoKey, { source: hitSource, results });
              if (data.source) {
                const cacheRes2 = await api.post('/cache/search', {
                  key: `${data.source}:${keyword}`,
                  source: data.source,
                  keyword,
                  results,
                });
                if (cacheRes2.data.results) {
                  searchCache.set(`${data.source}:${keyword}`, {
                    source: data.source,
                    results: cacheRes2.data.results,
                  });
                }
              }
            } catch {
              // cache write failure is non-critical
              searchCache.set(autoKey, { source: hitSource, results });
            }
            if (results.length > 0) {
              // The server already picked a match; fall back to deciding locally if an
              // older/other server response has no decision attached.
              const match = data.matched
                ? { result: data.matched as SearchResult }
                : bestMatch(row.name, results, matchThreshold);
              row.searchResult = match ? match.result : (results[0] ?? null);
              row.status = 'searched';
              if (match) await quickAdopt(row);
            } else {
              row.status = 'error';
            }
          }
        } catch {
          row.status = 'error';
        } finally {
          row.loading = false;
          scrapeDone.value++;
          processedSinceRefresh++;
        }
      }),
    );
  }

  scraping.value = false;
};

const forceRefresh = async () => {
  const allRows = flattenAllRows(scanResults.value);
  const keys = allRows.map((r) => `auto:${r.searchKeyword || r.name}`);
  searchCache.clear();
  detailCache.clear();
  try {
    if (keys.length > 0) {
      await api.delete('/cache/search', { params: { keys: keys.join(',') } });
    }
    const realIdRows = allRows.filter((r) => r.gameId > 0);
    const tempIdRows = allRows.filter((r) => r.gameId === 0 && r.subPath);
    if (realIdRows.length > 0) {
      await api.delete('/cache/adopt', {
        params: { gameIds: realIdRows.map((r) => r.gameId).join(',') },
      });
    }
    if (tempIdRows.length > 0 && selectedLibrary.value) {
      await api.delete('/cache/adopt', {
        params: {
          libraryId: selectedLibrary.value,
          subPaths: tempIdRows.map((r) => r.subPath).join(','),
        },
      });
    }
  } catch {
    // cache delete failure is non-critical
  }
  for (const row of allRows) {
    if (row.status === 'searched' || row.status === 'error' || row.status === 'adopted') {
      row.status = 'pending';
      row.searchResult = null;
      row.source = null;
      row.adoptData = null;
    }
  }
};

const doSubmit = async (games: SubmitGame[], staleRows: ScanRow[]) => {
  const failedIds = new Set<number>();
  if (games.length > 0) {
    const batchRes = await api.post('/scraper/adopt/batch', { games });
    const results: { gameId: number; success: boolean; error?: string }[] =
      batchRes.data.results || [];
    const allRows = flattenAllRows(scanResults.value);
    for (const r of results) {
      if (!r.success) {
        failedIds.add(r.gameId);
        const row = allRows.find((ar) => ar.gameId === r.gameId);
        if (row) row.status = row.searchResult ? 'searched' : 'pending';
      }
    }
    const adoptedGameIds = games.map((g) => g.gameId);
    if (adoptedGameIds.length > 0) {
      try {
        await api.delete('/cache/adopt', { params: { gameIds: adoptedGameIds.join(',') } });
      } catch {
        // adopt cache delete failure is non-critical
      }
    }
  }
  if (staleRows.length > 0) {
    await api.post('/games/batch-delete', { ids: staleRows.map((r) => r.gameId) });
  }
  const removeTree = (rows: ScanRow[]) => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      removeTree(r.children);
      if (r.status === 'stale') {
        rows.splice(i, 1);
      } else if (r.status === 'adopted' && !failedIds.has(r.gameId)) {
        rows.splice(i, 1);
      }
    }
  };
  removeTree(scanResults.value);
  emit('done');
};

const submitAdopted = async () => {
  submitting.value = true;
  const adoptedRows = flattenAllRows(scanResults.value).filter(
    (r) => r.status === 'adopted' && r.adoptData,
  );
  const staleRows = flattenAllRows(scanResults.value).filter(
    (r) => r.status === 'stale' && r.gameId > 0,
  );
  try {
    const unregisteredRows = adoptedRows.filter((r) => r.gameId === 0);
    if (unregisteredRows.length > 0 && selectedLibrary.value) {
      const addRes = await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: unregisteredRows.map((r) => r.subPath),
      });
      const inserted: { id: number; sub_path: string }[] = addRes.data.games || [];
      const idMap = new Map(inserted.map((g) => [g.sub_path, g.id]));
      const subPathToGameId: Record<string, number> = {};
      for (const row of unregisteredRows) {
        const realId = idMap.get(row.subPath);
        if (realId !== undefined) {
          row.gameId = realId;
          subPathToGameId[row.subPath] = realId;
        }
      }
      if (Object.keys(subPathToGameId).length > 0) {
        await api
          .post('/cache/adopt/migrate', { libraryId: selectedLibrary.value, subPathToGameId })
          .catch(() => {});
      }
    }

    if (adoptedRows.length > 0) {
      const games: SubmitGame[] = adoptedRows.map((row) => {
        const d = row.adoptData!;
        const source: SourceType =
          d.source && d.source !== ('auto' as string) ? d.source : 'dlsite';
        return {
          gameId: row.gameId,
          subPath: row.subPath,
          sourceType: source,
          sourceId: d.sourceId,
          sourceUrl: getSourceUrl(source, d.sourceId),
          name: d.detail.title,
          coverUrl: d.detail.coverURL || d.coverUrl,
          makers: d.detail.makers,
          genres: d.detail.genres,
          tags: d.detail.tags,
          description: d.detail.description,
          nsfw: d.detail.nsfw,
        };
      });

      const sources = games.map((g) => ({
        gameId: g.gameId,
        sourceType: g.sourceType,
        sourceId: g.sourceId,
        name: g.name,
      }));
      try {
        const conflictRes = await api.post('/games/check-conflicts', { sources });
        if (conflictRes.data.length > 0) {
          conflictData.value = conflictRes.data;
          pendingSubmitData.value = { games, staleRows };
          showConflictDialog.value = true;
          return;
        }
      } catch {
        // conflict check failure is non-critical, proceed with submission
      }

      await doSubmit(games, staleRows);
    } else {
      await doSubmit([], staleRows);
    }
  } finally {
    submitting.value = false;
  }
};

const confirmConflictSubmit = async () => {
  showConflictDialog.value = false;
  if (!pendingSubmitData.value) return;
  submitting.value = true;
  try {
    await doSubmit(pendingSubmitData.value.games, pendingSubmitData.value.staleRows);
  } finally {
    submitting.value = false;
    pendingSubmitData.value = null;
    conflictData.value = [];
  }
};

const cancelConflictSubmit = () => {
  showConflictDialog.value = false;
  pendingSubmitData.value = null;
  conflictData.value = [];
};

// The conflict dialog is persistent, but it can now also be dismissed with Escape or the
// built-in close button (the old Quasar dialog had neither). Every close goes through the
// same reset as "Cancel" so a dismissed dialog never leaves a half-pending submission
// behind.
const onConflictDialogOpen = (open: boolean) => {
  if (open) {
    showConflictDialog.value = true;
    return;
  }
  cancelConflictSubmit();
};

const openFolder = (row: ScanRow) => {
  const lib = libraries.value.find((l) => l.id === selectedLibrary.value);
  if (!lib) return;
  const fullPath = `${lib.path}\\${row.subPath}`;
  void window.electronAPI?.openPath(fullPath);
};

const getRowFolderPath = (row: ScanRow) => {
  const lib = libraries.value.find((l) => l.id === selectedLibrary.value);
  if (!lib) return null;
  return `${lib.path}\\${row.subPath}`;
};

const blacklistRow = ref<ScanRow | null>(null);
const showBlacklistDialog = computed({
  get: () => blacklistRow.value !== null,
  set: (val: boolean) => {
    if (!val) blacklistRow.value = null;
  },
});

const confirmBlacklist = async () => {
  if (!blacklistRow.value) return;
  try {
    const res = await api.get('/settings/blacklist');
    const list: string[] = JSON.parse(res.data.value);
    if (!list.includes(blacklistRow.value.subPath)) {
      list.push(blacklistRow.value.subPath);
      await api.put('/settings/blacklist', { value: JSON.stringify(list) });
    }
  } catch {
    const list = [blacklistRow.value.subPath];
    await api.put('/settings/blacklist', { value: JSON.stringify(list) });
  }
  const targetId = blacklistRow.value.gameId;
  const removeFromTree = (rows: ScanRow[]) => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      removeFromTree(r.children);
      if (r.gameId === targetId) {
        rows.splice(i, 1);
      }
    }
  };
  removeFromTree(scanResults.value);
  blacklistRow.value = null;
};

const initialized = ref(false);

watch(modelValue, (val) => {
  if (val && !initialized.value) {
    initialized.value = true;
    void fetchSettings()
      .then(() => fetchLibraries())
      .then(() => loadUnscraped());
  }
});
</script>
