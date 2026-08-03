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
        draggable="false"
        @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
      />
      <div
        v-if="!game.cover_path"
        class="game-cover__placeholder flex flex-center bg-grey-4 text-grey-6"
      >
        <q-icon name="videogame_asset" size="48px" />
      </div>
      <div v-if="selectable && selected" class="absolute-top-left q-pa-xs">
        <q-icon name="check_circle" color="primary" size="24px" />
      </div>
      <div v-if="duplicate" class="absolute-top-right q-pa-xs" style="z-index: 1">
        <q-icon name="content_copy" color="warning" size="18px">
          <q-tooltip>与其他游戏共享来源</q-tooltip>
        </q-icon>
      </div>
      <div class="game-cover__title">
        <div class="text-subtitle2 ellipsis game-cover__name">
          {{ game.sourceName || game.name }}
          <q-tooltip
            v-if="game.sourceName"
            anchor="bottom middle"
            self="top middle"
          >
            {{ game.name }}
          </q-tooltip>
        </div>
      </div>
    </div>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useExpressUrl } from '../composables/useExpressUrl';

interface Game {
  id: number;
  name: string;
  cover_path: string | null;
  library_name: string;
  library_path: string;
  sub_path: string;
  sourceName?: string | null;
}

const props = withDefaults(
  defineProps<{
    game: Game;
    selectable?: boolean;
    selected?: boolean;
    duplicate?: boolean;
  }>(),
  {
    selectable: false,
    selected: false,
    duplicate: false,
  },
);

const emit = defineEmits<{
  click: [];
  select: [e: MouseEvent];
}>();

const { getCoversUrl } = useExpressUrl();

const coverSrc = computed(() => {
  if (props.game.cover_path) {
    return getCoversUrl(props.game.cover_path);
  }
  return '';
});

const handleClick = (e: MouseEvent) => {
  if (props.selectable) {
    emit('select', e);
  } else {
    emit('click');
  }
};
</script>

<style scoped>
.game-card {
  position: relative;
  user-select: none;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
  height: 100%;
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
  aspect-ratio: 2.8 / 4;
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

<style>
body.body--dark .game-cover {
  background: #2a2a2a;
}
body.body--dark .game-cover__placeholder {
  background: #2a2a2a !important;
  color: rgba(255, 255, 255, 0.5) !important;
}
</style>