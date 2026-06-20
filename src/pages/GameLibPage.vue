<template>
  <q-page>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md q-gutter-sm">
        <q-input
          v-model="keyword"
          label="Search"
          outlined
          dense
          clearable
          style="max-width: 300px"
          @keyup.enter="searchGames"
        >
          <template v-slot:append>
            <q-icon name="search" />
          </template>
        </q-input>
        <q-btn color="primary" label="Scan & Scrape" @click="showScanner = true" />
      </div>

      <div class="row q-col-gutter-md">
        <div v-for="game in games" :key="game.id" class="col-6 col-sm-4 col-md-3 col-lg-2">
          <GameCard :game="game" />
        </div>
      </div>

      <div v-if="games.length === 0 && !loading" class="text-center text-grey q-mt-xl">
        <q-icon name="videogame_asset" size="64px" />
        <div class="text-h6 q-mt-sm">No games found</div>
        <div class="text-body2">Add a game library in Settings, then scan for games.</div>
      </div>

      <div class="flex flex-center q-mt-md" v-if="total > pageSize">
        <q-pagination
          v-model="page"
          :max="Math.ceil(total / pageSize)"
          :max-pages="7"
          direction-links
          @update:model-value="loadGames"
        />
      </div>
    </div>

    <ScannerDialog v-model="showScanner" @done="loadGames" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../composables/useApi'
import GameCard from '../components/GameCard.vue'
import ScannerDialog from '../components/ScannerDialog.vue'

interface GameItem {
  id: number; name: string; cover_path: string | null
  library_name: string; library_id: number; sub_path: string
}

const games = ref<GameItem[]>([])
const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = 24
const total = ref(0)
const showScanner = ref(false)

const loadGames = async () => {
  loading.value = true
  try {
    const res = await api.get('/games', {
      params: {
        page: page.value,
        pageSize,
        keyword: keyword.value || undefined,
      },
    })
    games.value = res.data.games
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

const searchGames = () => {
  page.value = 1
  void loadGames()
}

onMounted(() => {
  void loadGames()
})
</script>