<template>
  <q-card class="game-card cursor-pointer" @click="$router.push(`/game/${game.id}`)">
    <q-img
      :src="coverSrc"
      :ratio="16 / 9"
      class="game-cover"
    >
      <template v-slot:error>
        <div class="absolute-full flex flex-center bg-grey-4 text-grey-6">
          <q-icon name="videogame_asset" size="48px" />
        </div>
      </template>
    </q-img>
    <q-card-section class="q-pa-sm">
      <div class="text-subtitle2 ellipsis">{{ game.name }}</div>
      <div class="text-caption text-grey ellipsis row items-center no-wrap">
        <span class="col ellipsis">{{ game.library_name }}</span>
        <q-btn
          v-if="hasElectronAPI"
          flat
          round
          dense
          size="xs"
          icon="folder_open"
          color="grey-7"
          @click.stop="openDir"
        >
          <q-tooltip>Open Directory</q-tooltip>
        </q-btn>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Game {
  id: number
  name: string
  cover_path: string | null
  library_name: string
  library_path: string
  sub_path: string
}

const props = defineProps<{ game: Game }>()

const coverSrc = computed(() => {
  if (props.game.cover_path) {
    return `/covers/${props.game.cover_path}`
  }
  return ''
})

const hasElectronAPI = computed(() => !!window.electronAPI)

const openDir = async () => {
  if (!window.electronAPI) return
  const fullPath = props.game.library_path + '\\' + props.game.sub_path
  await window.electronAPI.openPath(fullPath)
}
</script>

<style scoped>
.game-card {
  transition: transform 0.15s;
}
.game-card:hover {
  transform: translateY(-2px);
}
.game-cover {
  min-height: 120px;
}
</style>