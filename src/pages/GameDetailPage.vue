<template>
  <q-page>
    <div v-if="game" class="q-pa-md">
      <q-btn flat round icon="arrow_back" class="q-mb-md" @click="$router.push('/')" />

      <div class="row q-col-gutter-md">
        <div class="col-12 col-sm-4">
          <q-img
            v-if="game.cover_path"
            :src="`/covers/${game.cover_path}`"
            :ratio="3 / 4"
            class="rounded-borders"
          />
          <div v-else class="bg-grey-4 rounded-borders" style="aspect-ratio: 3/4; display: flex; align-items: center; justify-content: center;">
            <q-icon name="videogame_asset" size="64px" color="grey-6" />
          </div>
        </div>

        <div class="col-12 col-sm-8">
          <div class="text-h5 q-mb-sm">{{ game.name }}</div>

          <div v-if="game.makers?.length" class="q-mb-sm">
            <span class="text-grey">Makers: </span>
            <q-chip v-for="m in game.makers" :key="m.id" dense size="sm" color="orange" text-color="white">
              {{ m.name }}
            </q-chip>
          </div>

          <div v-if="game.genres?.length" class="q-mb-sm">
            <span class="text-grey">Genres: </span>
            <q-chip v-for="g in game.genres" :key="g.id" dense size="sm" color="blue" text-color="white">
              {{ g.name }}
            </q-chip>
          </div>

          <div v-if="game.tags?.length" class="q-mb-sm">
            <span class="text-grey">Tags: </span>
            <q-chip v-for="t in game.tags" :key="t.id" dense size="sm" color="teal" text-color="white">
              {{ t.name }}
            </q-chip>
          </div>

          <div v-if="game.description" class="q-mb-sm">
            <span class="text-grey">Description: </span>
            <div class="text-body2 q-mt-xs" style="white-space: pre-wrap">{{ game.description }}</div>
          </div>

          <q-separator class="q-my-md" />

          <div class="text-caption text-grey">
            Path: {{ game.library?.path }}\{{ game.sub_path }}
          </div>

          <div v-if="game.sources?.length" class="text-caption text-grey q-mt-xs">
            <span v-for="s in game.sources" :key="s.id" class="q-mr-md">
              {{ s.source_type }}: {{ s.source_id }}
              <a v-if="s.source_url" :href="s.source_url" target="_blank" class="text-blue">Link</a>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center text-grey q-mt-xl">
      <q-spinner-dots size="40px" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../composables/useApi'

const route = useRoute()
const router = useRouter()
const game = ref<any>(null)

onMounted(async () => {
  const res = await api.get(`/games/${route.params.id}`)
  game.value = res.data
})
</script>