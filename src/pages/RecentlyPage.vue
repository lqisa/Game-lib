<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
      <History class="text-primary size-5" />
      <span class="text-sm font-medium">Recently Opened</span>
      <span v-if="games.length > 0" class="text-muted-foreground text-xs"
        >({{ games.length }})</span
      >
      <div class="flex-1" />
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" :disabled="loading" @click="loadRecently">
            <RefreshCw :class="['size-4', loading && 'animate-spin']" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh</TooltipContent>
      </Tooltip>
      <Button v-if="games.length > 0" variant="ghost" size="sm" @click="onClear">
        <Eraser class="size-4" />
        Clear
      </Button>
    </div>

    <div ref="gridContainer" class="relative flex min-h-0 flex-1 flex-col p-4">
      <VirtualGrid
        v-if="games.length > 0"
        ref="virtualGrid"
        :items="games"
        :item-key="(g: GameItem) => g.id"
        :row-height="rowHeight"
        :gutter="16"
        :buffer-rows="3"
      >
        <template #default="{ item: game }">
          <div :data-game-id="game.id" class="flex h-full flex-col">
            <GameCard :game="game" @click="goDetail(game.id)" />
            <div class="text-muted-foreground mt-1 flex h-7 items-center gap-1 text-xs">
              <Clock class="size-3.5 shrink-0" />
              <span class="truncate" :title="formatOpenedAt(game.opened_at)">
                {{ formatOpenedAt(game.opened_at) }}
              </span>
              <div class="flex-1" />
              <Tooltip v-if="hasElectronAPI">
                <TooltipTrigger as-child>
                  <Button variant="ghost" size="icon-sm" @click.stop="openDir(game)">
                    <FolderOpen class="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open Directory</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button variant="ghost" size="icon-sm" @click.stop="removeEntry(game.id)">
                    <X class="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove from Recently</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </template>
      </VirtualGrid>

      <div
        v-if="games.length === 0 && !loading"
        class="text-muted-foreground flex flex-1 flex-col items-center justify-center text-center"
      >
        <History class="size-16 opacity-40" />
        <div class="text-foreground mt-3 text-lg font-medium">Nothing opened yet</div>
        <div class="mt-1 text-sm">Games whose folder or archive you open show up here.</div>
      </div>

      <div v-if="loading && games.length > 0" class="flex justify-center p-4">
        <Loader2 class="text-primary size-6 animate-spin" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Clock, Eraser, FolderOpen, History, Loader2, RefreshCw, X } from '@lucide/vue';

import api from '../composables/useApi';
import { confirm } from '../composables/useConfirm';
import { getGridCols, useViewportWidth } from '../composables/useGridLayout';
import GameCard from '../components/GameCard.vue';
import VirtualGrid from '../components/VirtualGrid.vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface GameItem {
  id: number;
  name: string;
  cover_path: string | null;
  library_name: string;
  library_id: number | null;
  sub_path: string;
  library_path: string;
  opened_at: string;
  sourceName?: string | null;
}

const router = useRouter();
const games = ref<GameItem[]>([]);
const loading = ref(false);

const hasElectronAPI = computed(() => !!window.electronAPI);

const gridContainer = ref<HTMLElement | null>(null);
const virtualGrid = ref<{ scrollTo: (top: number) => void } | null>(null);
const viewportWidth = useViewportWidth();

const CARD_ASPECT = 2.8 / 4;
const META_HEIGHT = 28;
const rowHeight = computed(() => {
  const containerW = (gridContainer.value?.clientWidth ?? 1200) - 32;
  const c = getGridCols(viewportWidth.value);
  const gutter = 16;
  const colW = (containerW - gutter * (c - 1)) / c;
  return Math.ceil(colW / CARD_ASPECT) + META_HEIGHT;
});

const loadRecently = async () => {
  loading.value = true;
  try {
    const res = await api.get('/recently');
    games.value = res.data.games;
  } finally {
    loading.value = false;
  }
};

const goDetail = (id: number) => {
  void router.push(`/game/${id}`);
};

const isAbsolute = (p: string) => /^[a-zA-Z]:/.test(p) || p.startsWith('\\\\');

const fullPathOf = (game: GameItem) => {
  if (isAbsolute(game.sub_path)) return game.sub_path;
  if (game.library_path) return `${game.library_path}\\${game.sub_path}`;
  return '';
};

const openDir = async (game: GameItem) => {
  const fullPath = fullPathOf(game);
  if (!fullPath) return;
  await window.electronAPI?.openPath(fullPath);
  // Opening from this page counts as opening the game, so bump it to the top of the list.
  try {
    await api.post(`/recently/${game.id}`);
    games.value = [...(await api.get('/recently')).data.games];
  } catch {
    // non-critical: the list is simply not reordered
  }
};

const removeEntry = async (id: number) => {
  const snapshot = games.value;
  games.value = games.value.filter((g) => g.id !== id);
  try {
    await api.delete(`/recently/${id}`);
  } catch {
    games.value = snapshot;
  }
};

const onClear = async () => {
  const ok = await confirm({
    title: 'Clear the whole Recently list?',
    message: 'Only the history is cleared. The games themselves are not touched.',
    okLabel: 'Clear',
    destructive: true,
  });
  if (!ok) return;
  try {
    await api.delete('/recently');
    games.value = [];
  } catch {
    // non-critical: the list is unchanged
  }
};

// SQLite stores `CURRENT_TIMESTAMP` as UTC without a timezone marker, so the string has to be
// tagged as UTC before parsing - otherwise a game opened two minutes ago reads as two hours old.
const formatOpenedAt = (value: string) => {
  if (!value) return '';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

onMounted(() => {
  void loadRecently();
});
</script>
