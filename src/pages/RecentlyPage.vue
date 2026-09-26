<template>
  <q-page style="overflow: hidden; display: flex; flex-direction: column;">
    <div class="row items-center q-gutter-sm q-px-md q-py-sm" style="border-bottom: 1px solid var(--m3-outline-variant);">
      <q-icon name="history" size="24px" style="color: var(--m3-primary);" />
      <span class="text-subtitle2" style="color: var(--m3-on-surface);">Recently Opened</span>
      <span v-if="games.length > 0" class="text-caption" style="color: var(--m3-on-surface-variant);">
        ({{ games.length }})
      </span>
      <q-space />
      <q-btn
        flat
        round
        icon="refresh"
        style="color: var(--m3-on-surface-variant);"
        :loading="loading"
        @click="loadRecently"
      >
        <q-tooltip>Refresh</q-tooltip>
      </q-btn>
      <q-btn
        v-if="games.length > 0"
        flat
        icon="clear_all"
        label="Clear"
        class="m3-btn--text"
        @click="confirmClearDialog = true"
      />
    </div>

    <div
      ref="gridContainer"
      class="q-pa-md"
      style="flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column;"
    >
      <VirtualGrid
        v-if="games.length > 0"
        ref="virtualGrid"
        class="virtual-grid-wrapper"
        :items="games"
        :item-key="(g: GameItem) => g.id"
        :row-height="rowHeight"
        :gutter="16"
        :buffer-rows="3"
      >
        <template #default="{ item: game }">
          <div :data-game-id="game.id" style="display: flex; flex-direction: column; height: 100%;">
            <GameCard
              :game="game"
              class="recently-card"
              @click="goDetail(game.id)"
            />
            <div class="recently-meta row items-center no-wrap q-mt-xs">
              <q-icon name="schedule" size="14px" class="q-mr-xs" />
              <span class="text-caption ellipsis" :title="formatOpenedAt(game.opened_at)">
                {{ formatOpenedAt(game.opened_at) }}
              </span>
              <q-space />
              <q-btn
                v-if="hasElectronAPI"
                flat
                round
                dense
                size="sm"
                icon="folder_open"
                style="color: var(--m3-on-surface-variant);"
                @click.stop="openDir(game)"
              >
                <q-tooltip>Open Directory</q-tooltip>
              </q-btn>
              <q-btn
                flat
                round
                dense
                size="sm"
                icon="close"
                style="color: var(--m3-on-surface-variant);"
                @click.stop="removeEntry(game.id)"
              >
                <q-tooltip>Remove from Recently</q-tooltip>
              </q-btn>
            </div>
          </div>
        </template>
      </VirtualGrid>

      <div v-if="games.length === 0 && !loading" class="text-center q-mt-xl" style="color: var(--m3-on-surface-variant);">
        <q-icon name="history" size="64px" />
        <div class="text-h6 q-mt-sm" style="color: var(--m3-on-surface);">Nothing opened yet</div>
        <div class="text-body2">Games whose folder or archive you open show up here.</div>
      </div>

      <div v-if="loading && games.length > 0" class="flex flex-center q-pa-md">
        <q-spinner-dots size="32px" color="primary" />
      </div>
    </div>

    <q-dialog v-model="confirmClearDialog" persistent>
      <q-card>
        <q-card-section class="row items-center">
          <q-icon name="warning" size="lg" class="q-mr-sm" style="color: var(--m3-error);" />
          <span style="color: var(--m3-on-surface);">Clear the whole Recently list?</span>
        </q-card-section>
        <q-card-section class="text-caption q-pt-none" style="color: var(--m3-on-surface-variant);">
          Only the history is cleared. The games themselves are not touched.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat class="m3-btn--text" label="Cancel" v-close-popup />
          <q-btn
            unelevated
            style="background: var(--m3-error) !important; color: var(--m3-on-error) !important;"
            label="Clear"
            @click="doClear"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import api from '../composables/useApi';
import { getGridCols, useViewportWidth } from '../composables/useGridLayout';
import GameCard from '../components/GameCard.vue';
import VirtualGrid from '../components/VirtualGrid.vue';

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
const confirmClearDialog = ref(false);

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

const doClear = async () => {
  try {
    await api.delete('/recently');
    games.value = [];
  } catch {
    // non-critical: the list is unchanged
  } finally {
    confirmClearDialog.value = false;
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

<style scoped>
.virtual-grid-wrapper {
  transition: opacity 0.15s ease;
}
.recently-meta {
  height: 28px;
  color: var(--m3-on-surface-variant);
}
</style>
