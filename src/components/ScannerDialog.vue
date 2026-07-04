<template>
  <q-dialog v-model="modelValue" persistent maximized>
    <q-card class="column">
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle1">Scan & Scrape</div>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section class="q-pa-md col" style="position: relative; overflow: hidden">
        <q-inner-loading :showing="scanning" label="Scanning..." label-class="text-grey-8" />
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
          <q-btn
            color="primary"
            label="Scan"
            @click="scanDir"
            :disable="!selectedLibrary"
            :loading="scanning"
          />
          <q-btn
            v-if="!scraping"
            color="secondary"
            label="Scrape All"
            @click="startBatchScrape"
            :disable="!hasPending"
          />
          <q-btn
            v-else
            :color="scrapePaused ? 'positive' : 'orange'"
            :label="`${scrapeDone} / ${scrapeTotal}`"
            @click="togglePause"
          >
            <q-tooltip>{{ scrapePaused ? 'Click to resume' : 'Click to pause' }}</q-tooltip>
          </q-btn>
          <q-btn
            color="warning"
            label="Force Refresh"
            @click="forceRefresh"
            :disable="totalCount === 0"
          />
          <q-btn
            color="positive"
            label="Submit"
            @click="submitAdopted"
            :disable="adoptedCount === 0 && staleCount === 0"
            :loading="submitting"
          >
            <q-badge v-if="adoptedCount > 0" color="white" text-color="positive" floating>{{
              adoptedCount
            }}</q-badge>
          </q-btn>
          <q-badge v-if="staleCount > 0" color="negative" class="text-body2">
            {{ staleCount }} to delete
          </q-badge>
          <q-badge v-else-if="totalCount > 0" color="grey-7" class="text-body2">
            {{ totalCount }} unscraped
          </q-badge>
          <q-space />
          <q-input
            v-model="searchKeyword"
            dense
            outlined
            clearable
            debounce="100"
            placeholder="Search..."
            style="min-width: 180px"
          >
            <template v-slot:prepend>
              <q-icon name="search" />
            </template>
          </q-input>
          <q-btn
            flat
            round
            :icon="compact ? 'view_stream' : 'view_list'"
            :color="compact ? 'grey' : 'primary'"
            @click="compact = !compact"
          >
            <q-tooltip>{{ compact ? 'Compact view (48px)' : 'Large view (260px)' }}</q-tooltip>
          </q-btn>
        </div>

        <div class="scan-header q-px-md" :class="{ 'scan-header--compact': compact }">
          <div class="scan-header__cover"></div>
          <div class="scan-header__cell scan-header__cell--sortable" @click="toggleSort('name')">
            <span>Name</span>
            <q-icon
              v-if="sortBy === 'name'"
              :name="sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'"
              size="14px"
            />
          </div>
          <div class="scan-header__cell scan-header__cell--sortable" @click="toggleSort('status')">
            <span>Status</span>
            <q-icon
              v-if="sortBy === 'status'"
              :name="sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'"
              size="14px"
            />
          </div>
          <div class="scan-header__cell scan-header__cell--sortable" @click="toggleSort('action')">
            <span>Action</span>
            <q-icon
              v-if="sortBy === 'action'"
              :name="sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'"
              size="14px"
            />
          </div>
        </div>

        <q-virtual-scroll
          :items="sortedResults"
          :virtual-scroll-item-size="rowHeight"
          style="height: calc(100vh - 170px)"
        >
          <template v-slot="{ item: row }">
            <div
              class="scan-row q-px-md"
              :class="{
                'scan-row--stale': row.status === 'stale',
                'scan-row--compact': compact,
              }"
              :style="{ paddingLeft: `${24 + row.depth * 24}px` }"
            >
              <div class="scan-row__cover">
                <div v-if="row.searchResult?.coverUrl" class="scan-row__cover-wrap">
                  <img
                    :src="row.searchResult.coverUrl"
                    class="scan-row__cover-img"
                    loading="lazy"
                    @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
                  />
                  <q-icon
                    name="image"
                    size="16px"
                    color="grey"
                    class="scan-row__cover-placeholder"
                  />
                  <q-tooltip
                    anchor="top left"
                    self="top left"
                    :offset="[8, 0]"
                    transition-show="fade"
                    transition-hide="fade"
                    class="tooltip-cover-preview"
                  >
                    <img
                      :src="row.searchResult.coverUrl"
                      style="
                        width: 240px;
                        max-height: 320px;
                        object-fit: contain;
                        border-radius: 4px;
                        display: block;
                      "
                      loading="lazy"
                    />
                  </q-tooltip>
                </div>
                <div v-else class="scan-row__cover-empty flex flex-center">
                  <q-icon :name="row.isArchive ? 'archive' : 'folder'" :size="compact ? '16px' : '48px'" color="grey" />
                </div>
              </div>

              <div class="scan-row__info">
                <div class="row items-center no-wrap">
                  <q-btn
                    v-if="row.hasChildren !== false && !row.isArchive"
                    flat
                    round
                    dense
                    size="xs"
                    :icon="row.expanded ? 'expand_more' : 'chevron_right'"
                    :loading="row.loading && row.children.length === 0"
                    @click="expandRow(row)"
                    class="q-mr-xs"
                    style="flex-shrink: 0"
                  >
                    <q-tooltip>{{ row.expanded ? 'Collapse' : 'Expand scan' }}</q-tooltip>
                  </q-btn>
                  <span v-else style="width: 28px; flex-shrink: 0"></span>
                  <span class="text-body2 ellipsis">
                    {{ row.name }}
                    <q-tooltip anchor="top left" self="bottom left">{{ row.subPath }}</q-tooltip>
                  </span>
                  <q-icon
                    name="folder_open"
                    size="xs"
                    color="grey"
                    class="q-ml-xs cursor-pointer"
                    @click="openFolder(row)"
                  >
                    <q-tooltip>Open Folder</q-tooltip>
                  </q-icon>
                </div>
                <div v-if="row.searchResult" class="row items-center no-wrap q-mt-xs">
                  <q-badge
                    v-if="row.source"
                    :color="sourceColor(row.source)"
                    class="q-mr-xs"
                    label-style="font-size:10px"
                    >{{ row.source }}</q-badge
                  >
                  <span class="text-caption ellipsis">{{ row.searchResult.name }}</span>
                  <span class="text-caption text-grey q-ml-sm" style="flex-shrink: 0">{{
                    row.searchResult.id
                  }}</span>
                </div>
              </div>

              <div class="scan-row__status">
                <q-badge v-if="row.status === 'adopted'" color="positive">Adopted</q-badge>
                <q-badge v-else-if="row.status === 'searching'" color="warning"
                  >Searching...</q-badge
                >
                <q-badge v-else-if="row.status === 'error'" color="negative">Failed</q-badge>
                <q-badge v-else-if="row.status === 'searched'" color="blue">Searched</q-badge>
                <q-badge v-else-if="row.status === 'stale'" color="negative">Stale</q-badge>
                <q-badge v-else color="grey">Pending</q-badge>
              </div>

              <div class="scan-row__actions">
                <template v-if="row.status === 'stale'">
                  <span class="text-grey-5 text-italic text-caption">Directory not found</span>
                </template>
                <template v-else>
                  <q-btn
                    size="sm"
                    color="primary"
                    label="Reselect"
                    flat
                    :disable="row.status !== 'searched' && row.status !== 'adopted'"
                    @click="openScrapeDialog(row)"
                    style="min-width: 56px"
                  />
                  <q-btn
                    v-if="row.status === 'pending' || row.status === 'error'"
                    size="sm"
                    color="primary"
                    label="Scrape"
                    @click="openScrapeDialog(row)"
                    class="q-ml-xs"
                    style="min-width: 64px"
                  />
                  <q-btn
                    v-else-if="row.status === 'searched'"
                    size="sm"
                    color="positive"
                    label="Adopt"
                    :loading="row.loading"
                    @click="quickAdopt(row)"
                    class="q-ml-xs"
                    style="min-width: 64px"
                  />
                  <q-btn
                    v-else-if="row.status === 'adopted'"
                    size="sm"
                    color="negative"
                    label="Cancel"
                    @click="discardRow(row)"
                    class="q-ml-xs"
                    style="min-width: 64px"
                  />
                  <q-btn
                    size="xs"
                    color="grey-7"
                    icon="block"
                    flat
                    round
                    class="q-ml-xs"
                    @click="blacklistRow = row"
                  >
                    <q-tooltip>Add to blacklist</q-tooltip>
                  </q-btn>
                </template>
              </div>
            </div>
          </template>
        </q-virtual-scroll>
      </q-card-section>
    </q-card>

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

    <q-dialog v-model="showConflictDialog" persistent>
      <q-card style="min-width: 500px; max-width: 80vw">
        <q-card-section>
          <div class="text-h6 text-warning">
            <q-icon name="warning" class="q-mr-sm" />
            Source Conflict Detected
          </div>
          <div class="text-body2 q-mt-sm">
            The following sources are already used by other games. Submitting will share the source.
            Do you want to continue?
          </div>
        </q-card-section>
        <q-card-section style="max-height: 50vh; overflow: auto">
          <div v-for="(conflict, i) in conflictData" :key="i" class="q-mb-md">
            <div class="text-body2 text-weight-medium">
              <q-badge :color="sourceColor(conflict.sourceType as SourceType)" class="q-mr-xs">{{
                conflict.sourceType
              }}</q-badge>
              ID: {{ conflict.sourceId }}
            </div>
            <div
              v-for="game in conflict.games"
              :key="game.gameId"
              class="text-caption q-ml-md q-mt-xs"
            >
              <q-icon name="sports_esports" size="xs" class="q-mr-xs" />
              {{ game.name }} (ID: {{ game.gameId }})
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="negative" @click="cancelConflictSubmit" />
          <q-btn flat label="Confirm Submit" color="primary" @click="confirmConflictSubmit" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showBlacklistDialog" persistent>
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6 text-warning">
            <q-icon name="warning" class="q-mr-sm" />
            Add to Blacklist
          </div>
          <div class="text-body2 q-mt-sm">
            Add <strong>{{ blacklistRow?.subPath }}</strong> to blacklist? This directory will be excluded from all scan results and game lists.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn flat label="Confirm" color="negative" @click="confirmBlacklist" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import api from '../composables/useApi';
import { splitKeyword, segmentsCache } from '../composables/useSplitKeyword';
import ScrapeDialog from './ScrapeDialog.vue';
import type { SourceType, SearchResult, DetailResult, AdoptData } from '../types/scrape';

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

const sourceColor = (source: SourceType) => {
  if (source === 'dlsite') return 'deep-purple';
  if (source === 'bangumi') return 'orange';
  if (source === 'vndb') return 'cyan';
  if (source === 'steam') return 'blue-grey';
  return 'grey';
};

const getSourceUrl = (source: SourceType, sourceId: string): string => {
  if (source === 'dlsite')
    return `https://www.dlsite.com/maniax/work/=/product_id/${sourceId}.html`;
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

const normalizeName = (name: string) => name.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\u3005-\u3006\u30FC]/g, '').replace(/\s+/g, ' ').trim();

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
const adoptedCount = computed(() => flattenAllRows(scanResults.value).filter((r) => r.status === 'adopted').length);
const staleCount = computed(() => flattenAllRows(scanResults.value).filter((r) => r.status === 'stale').length);
const totalCount = computed(() => flattenAllRows(scanResults.value).length);

let scrapeConcurrency = 4;

const fetchSettings = async () => {
  try {
    const res = await api.get('/settings/scrape_concurrency');
    scrapeConcurrency = parseInt(res.data.value, 10) || 4;
  } catch {
    scrapeConcurrency = 4;
  }
};

const fetchLibraries = async () => {
  const res = await api.get('/libraries');
  libraries.value = res.data;
  if (!selectedLibrary.value && libraries.value.length > 0) {
    selectedLibrary.value = libraries.value[0]!.id;
  }
};

const loadUnscraped = async () => {
  if (!selectedLibrary.value) {
    scanResults.value = [];
    return;
  }
  const res = await api.get('/games/unscraped', { params: { libraryId: selectedLibrary.value } });
  const archiveExtRe = /\.(7z|zip)\.\d+$|\.part\d+\.rar$|\.rar(\.\d+)?$|\.(zip|7z|rar)$/i;
  scanResults.value = res.data.map((g: { id: number; name: string; sub_path: string }) => {
    const isArchive = archiveExtRe.test(g.name);
    const cleanName = isArchive ? g.name.replace(archiveExtRe, '') : g.name;
    return { name: cleanName, subPath: g.sub_path, status: 'pending' as const, searchResult: null, adoptData: null, searchKeyword: cleanName, source: null as SourceType | null, loading: false, gameId: g.id, children: [], expanded: false, isArchive, depth: 0, hasChildren: null };
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
    const adoptByGameId = new Map(entries.filter((e) => e.game_id > 0).map((e): [number, AdoptCacheEntry] => [e.game_id, e]));
    const adoptBySubPath = new Map(entries.filter((e) => e.sub_path).map((e): [string, AdoptCacheEntry] => [e.sub_path, e]));
    for (const row of allRows) {
      const cached = row.gameId > 0 ? adoptByGameId.get(row.gameId) : adoptBySubPath.get(row.subPath);
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
            searchKeyword: isArchive ? g.name.replace(/\.(7z|zip)\.\d+$|\.part\d+\.rar$|\.rar(\.r\d+)?$|\.(zip|7z|rar)$/i, '') : g.name,
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
      const newRows = scanResults.value.filter(
        (r) => addedGames.some((g) => g.id === r.gameId),
      );
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
          const adoptRes = await api.get('/cache/adopt', { params: { gameIds: newGameIds.join(',') } });
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
          ? displayName.replace(/\.(7z|zip)\.\d+$|\.part\d+\.rar$|\.rar(\.r\d+)?$|\.(zip|7z|rar)$/i, '')
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
          const adoptBySubPath = new Map(adoptEntries.map((e): [string, AdoptCacheEntry] => [e.sub_path, e]));
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
  api.post('/cache/adopt', {
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
  }).catch(() => {});
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
    api.delete('/cache/adopt', { params: { libraryId: selectedLibrary.value, subPaths: row.subPath } }).catch(() => {});
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
  const rows = flattenAllRows(scanResults.value).filter((r) => r.status === 'pending' || r.status === 'error');
  if (rows.length === 0) return;

  scrapeDone.value = 0;
  scrapeTotal.value = rows.length;
  scraping.value = true;
  const limit = scrapeConcurrency;

  for (let i = 0; i < rows.length; i += limit) {
    if (!scraping.value) break;
    while (scrapePaused.value) {
      await new Promise((r) => setTimeout(r, 200));
    }
    const chunk = rows.slice(i, i + limit);
    await Promise.all(
      chunk.map(async (row) => {
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
              row.searchResult = cached[0] ?? null;
              if (row.searchResult && normalizeName(row.searchResult.name) === normalizeName(row.name)) {
                row.status = 'searched';
                await quickAdopt(row);
              } else {
                row.status = 'searched';
              }
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
              row.searchResult = results[0] ?? null;
              if (row.searchResult && normalizeName(row.searchResult.name) === normalizeName(row.name)) {
                row.status = 'searched';
                await quickAdopt(row);
              } else {
                row.status = 'searched';
              }
            } else {
              row.status = 'error';
            }
          }
        } catch {
          row.status = 'error';
        } finally {
          row.loading = false;
          scrapeDone.value++;
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
      await api.delete('/cache/adopt', { params: { gameIds: realIdRows.map((r) => r.gameId).join(',') } });
    }
    if (tempIdRows.length > 0 && selectedLibrary.value) {
      await api.delete('/cache/adopt', { params: { libraryId: selectedLibrary.value, subPaths: tempIdRows.map((r) => r.subPath).join(',') } });
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
      const r = rows[i]!;
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
  const adoptedRows = flattenAllRows(scanResults.value).filter((r) => r.status === 'adopted' && r.adoptData);
  const staleRows = flattenAllRows(scanResults.value).filter((r) => r.status === 'stale' && r.gameId > 0);
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
        await api.post('/cache/adopt/migrate', { libraryId: selectedLibrary.value, subPathToGameId }).catch(() => {});
      }
    }

    if (adoptedRows.length > 0) {
      const games: SubmitGame[] = adoptedRows.map((row) => {
        const d = row.adoptData!;
        const source: SourceType = (d.source && d.source !== ('auto' as string)) ? d.source : 'dlsite';
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
  set: (val: boolean) => { if (!val) blacklistRow.value = null; },
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
      const r = rows[i]!;
      removeFromTree(r.children);
      if (r.gameId === targetId) {
        rows.splice(i, 1);
      }
    }
  };
  removeFromTree(scanResults.value);
  blacklistRow.value = null;
};

watch(modelValue, (val) => {
  if (val) {
    void fetchSettings()
      .then(() => fetchLibraries())
      .then(() => loadUnscraped());
  }
});
</script>

<style scoped>
.scan-header {
  display: grid;
  grid-template-columns: 180px 1fr 70px 200px;
  gap: 0 12px;
  align-items: center;
  height: 36px;
  padding: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  background: #f5f5f5;
  position: sticky;
  top: 0;
  z-index: 1;
}
.scan-header--compact {
  grid-template-columns: 40px 1fr 60px 180px;
  gap: 0 8px;
}
.scan-header__cover {
  width: 100%;
  height: 100%;
}
.scan-header__cell {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.54);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.scan-header__cell--sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.15s;
}
.scan-header__cell--sortable:hover {
  color: var(--q-primary);
}

.scan-row {
  display: grid;
  grid-template-columns: 180px 1fr 70px 200px;
  gap: 0 12px;
  align-items: center;
  height: 260px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.scan-row:hover {
  background: rgba(0, 0, 0, 0.04);
}
.scan-row__cover {
  flex-shrink: 0;
}
.scan-row__cover-wrap {
  position: relative;
  width: 180px;
  height: 240px;
  border-radius: 6px;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.scan-row__cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  z-index: 1;
}
.scan-row__cover-empty {
  width: 180px;
  height: 240px;
  border-radius: 6px;
  background: #e0e0e0;
}
.scan-row--stale {
  background: rgba(255, 0, 0, 0.08);
}
.scan-row__cover-placeholder {
  pointer-events: none;
  z-index: 0;
}
.scan-row__info {
  min-width: 0;
  overflow: hidden;
}
.scan-row__status,
.scan-row__actions {
  display: flex;
  align-items: center;
}
.scan-row--compact {
  grid-template-columns: 40px 1fr 60px 180px;
  gap: 0 8px;
  height: 48px;
  padding: 0;
}
.scan-row--compact .scan-row__cover-wrap {
  width: 40px;
  height: 40px;
  border-radius: 4px;
}
.scan-row--compact .scan-row__cover-img {
  border-radius: 4px;
}
.scan-row--compact .scan-row__cover-empty {
  width: 40px;
  height: 40px;
  border-radius: 4px;
}
</style>

<style>
.tooltip-cover-preview {
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

body.body--dark .scan-header {
  background: #1a1a1a;
  border-bottom-color: rgba(255, 255, 255, 0.12);
}
body.body--dark .scan-header__cell {
  color: rgba(255, 255, 255, 0.54);
}
body.body--dark .scan-row {
  border-bottom-color: rgba(255, 255, 255, 0.12);
}
body.body--dark .scan-row:hover {
  background: rgba(255, 255, 255, 0.06);
}
body.body--dark .scan-row__cover-wrap,
body.body--dark .scan-row__cover-empty {
  background: #2a2a2a;
}
body.body--dark .scan-row--stale {
  background: rgba(255, 60, 60, 0.12);
}
</style>