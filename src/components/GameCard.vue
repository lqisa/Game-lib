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
      <div class="text-caption text-grey ellipsis">{{ game.library_name }}</div>
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
}

const props = defineProps<{ game: Game }>()

const coverSrc = computed(() => {
  if (props.game.cover_path) {
    return `/covers/${props.game.cover_path}`
  }
  return ''
})
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