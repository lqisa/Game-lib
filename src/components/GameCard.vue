<template>
  <q-card
    class="game-card cursor-pointer"
    :class="{ 'game-card--selected': selected }"
    @click="handleClick"
  >
    <div class="game-cover">
      <img
        v-if="game.cover_path"
        v-lazy-img="coverSrc"
        class="game-cover__img"
        @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
      />
      <div v-if="!game.cover_path" class="game-cover__placeholder flex flex-center bg-grey-4 text-grey-6">
        <q-icon name="videogame_asset" size="48px" />
      </div>
      <div v-if="selectable && selected" class="absolute-top-left q-pa-xs">
        <q-icon name="check_circle" color="primary" size="24px" />
      </div>
      <div class="game-cover__title">
        <div class="text-subtitle2 ellipsis game-cover__name">{{ game.name }}</div>
      </div>
    </div>
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

const props = withDefaults(defineProps<{
  game: Game
  selectable?: boolean
  selected?: boolean
}>(), {
  selectable: false,
  selected: false,
})

const emit = defineEmits<{
  click: []
  select: [e: MouseEvent]
}>()

const coverSrc = computed(() => {
  if (props.game.cover_path) {
    return `/covers/${props.game.cover_path}`
  }
  return ''
})

const handleClick = (e: MouseEvent) => {
  if (props.selectable) {
    emit('select', e)
  } else {
    emit('click')
  }
}
</script>

<style scoped>
.game-card {
  position: relative;
  user-select: none;
  transition: transform 0.15s, box-shadow 0.15s;
}
.game-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.game-card--selected {
  box-shadow: 0 0 0 2px #1976d2;
}

.game-cover {
  position: relative;
  aspect-ratio: 3 / 4;
  background: #e0e0e0;
  overflow: hidden;
}

.game-cover__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.game-cover__placeholder {
  width: 100%;
  height: 100%;
}

.game-cover__name {
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.game-cover__title {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
}
</style>