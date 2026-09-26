<template>
  <q-card
    class="game-card cursor-pointer"
    :class="{ 'game-card--selected': selected }"
    @click="handleClick"
  >
    <div class="game-cover">
      <!-- A cover can be missing for two different reasons: the game was never scraped
           (or its source has no cover art), or cover_path is set but the file is not a
           decodable image. Both fall back to the same placeholder instead of leaving the
           tile blank - the second case used to just hide the <img> and show nothing. -->
      <img
        v-if="game.cover_path && !coverFailed"
        v-lazy-img="coverSrc"
        class="game-cover__img"
        draggable="false"
        @error="coverFailed = true"
      />
      <img
        v-else
        src="placeholder-cover.jpg"
        class="game-cover__img game-cover__placeholder"
        draggable="false"
        alt=""
      />
      <div v-if="selectable && selected" class="absolute-top-left q-pa-xs">
        <q-icon name="check_circle" color="primary" size="24px" />
      </div>
      <div v-if="duplicate" class="absolute-top-right q-pa-xs" style="z-index: 1">
        <q-icon name="content_copy" color="warning" size="18px">
          <q-tooltip>Shares a source with another game</q-tooltip>
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
import { computed, ref } from 'vue';
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

// Set when a cover file exists but is not a decodable image, so the tile falls back to the
// placeholder rather than going blank. No reset-on-change is needed: both lists key their
// items by game id (`item-key` on VirtualGrid), so an instance is never rebound to another
// game - scrolling creates fresh instances instead (measured: 32 cards -> 40 after scroll,
// with the bound game id never changing on an existing instance).
const coverFailed = ref(false);

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
    transform 0.2s cubic-bezier(0.2, 0, 0, 1),
    box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1);
  height: 100%;
  border-radius: var(--m3-shape-corner-sm);
  overflow: hidden;
}
.game-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--m3-elevation-1);
}

.game-card--selected {
  box-shadow: 0 0 0 2px var(--m3-primary) !important;
}

.game-cover {
  position: relative;
  aspect-ratio: 2.8 / 4;
  background: var(--m3-surface-container-highest);
  overflow: hidden;
}

.game-cover__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* `cover` rather than `contain`: the placeholder is decorative, so filling the tile looks
   better than letterboxing it against the surface colour. */
.game-cover__placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--m3-surface-container-highest);
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
  background: var(--m3-surface-container-highest);
}
body.body--dark .game-cover__placeholder {
  background: var(--m3-surface-container-highest) !important;
}
</style>