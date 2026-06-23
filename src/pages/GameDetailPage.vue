<template>
  <q-page>
    <div v-if="game" class="q-pa-md">
      <q-btn flat round icon="arrow_back" class="q-mb-md" @click="$router.push('/')" />
      <q-btn flat round icon="refresh" class="q-mb-md" @click="showScrapeDialog = true">
        <q-tooltip>Re-scrape</q-tooltip>
      </q-btn>

      <div class="row q-col-gutter-md">
        <div class="col-12 col-sm-4">
          <q-img
            v-if="game.cover_path"
            :src="`/covers/${game.cover_path}`"
            :ratio="3 / 4"
            class="rounded-borders"
          />
          <div
            v-else
            class="bg-grey-4 rounded-borders"
            style="aspect-ratio: 3/4; display: flex; align-items: center; justify-content: center"
          >
            <q-icon name="videogame_asset" size="64px" color="grey-6" />
          </div>

          <div class="text-caption text-grey q-mt-sm">
            Path: {{ game.library?.path }}\{{ game.sub_path }}
            <q-btn
              v-if="hasElectronAPI"
              flat
              round
              dense
              size="sm"
              icon="folder_open"
              color="grey-7"
              @click="openDir"
            >
              <q-tooltip>Open Directory</q-tooltip>
            </q-btn>
          </div>

          <div v-if="game.sources?.length" class="text-caption text-grey q-mt-xs">
            <span v-for="s in game.sources" :key="s.id" class="q-mr-md">
              {{ s.source_type }}: {{ s.source_id }}
              <a v-if="s.source_url" :href="s.source_url" target="_blank" class="text-blue">Link</a>
            </span>
          </div>

          <div v-if="game.duplicateSources?.length" class="q-mt-sm">
            <q-banner dense class="bg-orange-1 text-orange-9 rounded-borders">
              <template v-slot:avatar>
                <q-icon name="content_copy" color="warning" />
              </template>
              <div class="text-caption text-weight-medium">Shared Source</div>
              <div v-for="(dup, i) in game.duplicateSources" :key="i" class="q-mt-xs">
                <q-badge :color="sourceColor(dup.sourceType)" class="q-mr-xs">{{
                  dup.sourceType
                }}</q-badge>
                <span class="text-caption text-grey">{{ dup.sourceId }}</span>
                <div v-for="g in dup.games" :key="g.gameId" class="q-ml-md">
                  <router-link :to="`/game/${g.gameId}`" class="text-blue text-caption">{{
                    g.name
                  }}</router-link>
                  <span class="text-caption text-grey q-ml-xs">(ID: {{ g.gameId }})</span>
                </div>
              </div>
            </q-banner>
          </div>
        </div>

        <div class="col-12 col-sm-8">
          <div class="text-h5 q-mb-sm">{{ game.name }}</div>

          <div v-if="game.makers?.length" class="q-mb-sm">
            <span class="text-grey">Makers: </span>
            <q-chip
              v-for="m in game.makers"
              :key="m.id"
              dense
              size="sm"
              color="orange"
              text-color="white"
            >
              {{ m.name }}
            </q-chip>
          </div>

          <div v-if="game.genres?.length" class="q-mb-sm">
            <span class="text-grey">Genres: </span>
            <q-chip
              v-for="g in game.genres"
              :key="g.id"
              dense
              size="sm"
              color="blue"
              text-color="white"
            >
              {{ g.name }}
            </q-chip>
          </div>

          <div v-if="game.tags?.length" class="q-mb-sm">
            <span class="text-grey">Tags: </span>
            <q-chip
              v-for="t in game.tags"
              :key="t.id"
              dense
              size="sm"
              color="teal"
              text-color="white"
            >
              {{ t.name }}
            </q-chip>
          </div>

          <div v-if="game.description" class="q-mb-sm">
            <span class="text-grey">Description: </span>
            <div class="text-body2 q-mt-xs" style="white-space: pre-wrap">
              {{ game.description }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center text-grey q-mt-xl">
      <q-spinner-dots size="40px" />
    </div>

    <ScrapeDialog
      v-model="showScrapeDialog"
      :game-name="game?.name || ''"
      :game-id="game?.id || 0"
      :default-keyword="
        game?.sources?.[0]?.source_id ? `RJ${game.sources[0].source_id}` : undefined
      "
      @adopted="onReScrape"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../composables/useApi';
import ScrapeDialog from '../components/ScrapeDialog.vue';

interface GameDetail {
  id: number;
  name: string;
  cover_path: string | null;
  description: string | null;
  sub_path: string;
  makers: { id: number; name: string }[];
  genres: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  sources: { id: number; source_type: string; source_id: string; source_url: string | null }[];
  library: { id: number; name: string; path: string } | null;
  duplicateSources: {
    sourceType: string;
    sourceId: string;
    games: { gameId: number; name: string }[];
  }[];
}

const route = useRoute();
const game = ref<GameDetail | null>(null);
const showScrapeDialog = ref(false);

const hasElectronAPI = computed(() => !!window.electronAPI);

const sourceColor = (source: string) => {
  if (source === 'dlsite') return 'deep-purple';
  if (source === 'bangumi') return 'orange';
  if (source === 'vndb') return 'cyan';
  return 'grey';
};

const openDir = async () => {
  if (!game.value?.library?.path || !window.electronAPI) return;
  const fullPath = game.value.library.path + '\\' + game.value.sub_path;
  await window.electronAPI.openPath(fullPath);
};

const loadGame = async () => {
  const gameId = String(route.params.id);
  const res = await api.get(`/games/${gameId}`);
  game.value = res.data;
};

type SourceType = 'dlsite' | 'bangumi' | 'vndb';

interface AdoptData {
  source: SourceType;
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

const getSourceUrl = (source: SourceType, sourceId: string): string => {
  if (source === 'dlsite')
    return `https://www.dlsite.com/maniax/work/=/product_id/RJ${sourceId}.html`;
  if (source === 'bangumi') return `https://bgm.tv/subject/${sourceId}`;
  if (source === 'vndb') return `https://vndb.org/${sourceId}`;
  return '';
};

const onReScrape = async (data: AdoptData) => {
  if (!game.value) return;
  await api.post('/scraper/adopt', {
    gameId: game.value.id,
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
  await loadGame();
};

onMounted(() => {
  void loadGame();
});

watch(() => route.params.id, () => {
  void loadGame();
});
</script>