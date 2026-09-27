<template>
  <q-card
    class="game-card cursor-pointer"
    :class="{ 'game-card--selected': selected }"
    @click="handleClick"
  >
    <!-- The cover doubles as its own backdrop (see .game-cover::before), exposed as a
         custom property because the URL only exists at runtime. -->
    <div class="game-cover" :style="{ '--cover-url': coverFill }">
      <!-- A cover can be missing for two different reasons: the game was never scraped
           (or its source has no cover art), or cover_path is set but the file is not a
           decodable image. Both fall back to the same placeholder instead of leaving the
           tile blank - the second case used to just hide the <img> and show nothing. -->
      <img
        v-if="game.cover_path && !coverFailed && !r18Hidden"
        v-lazy-img="coverSrc"
        class="game-cover__img"
        draggable="false"
        @error="coverFailed = true"
      />
      <img
        v-else-if="r18Hidden && game.cover_path && !coverFailed"
        v-lazy-img="coverSrc"
        class="game-cover__img game-cover__r18-blur"
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
      <div v-if="r18Hidden" class="game-cover__r18-label">18+</div>
      <div
        v-if="!hideR18 && game.r18 === 1 && !(selectable && selected)"
        class="absolute-top-left q-pa-xs"
        style="z-index: 3"
      >
        <q-badge color="deep-orange" label="18+" />
      </div>
      <div v-if="selectable && selected" class="absolute-top-left q-pa-xs" style="z-index: 2">
        <q-icon name="check_circle" color="primary" size="24px" />
      </div>
      <div
        v-if="duplicate || game.similarCount"
        class="absolute-top-right q-pa-xs"
        style="z-index: 2"
      >
        <q-icon v-if="duplicate" name="content_copy" color="warning" size="18px">
          <q-tooltip>Shares a source with another game</q-tooltip>
        </q-icon>
        <q-icon v-if="game.similarCount" name="merge_type" color="warning" size="18px">
          <q-tooltip>Suspected duplicate: a similar name exists under another vendor</q-tooltip>
        </q-icon>
      </div>
      <div class="game-cover__title">
        <div class="text-subtitle2 ellipsis game-cover__name">
          {{ game.sourceName || game.name }}
          <q-tooltip v-if="game.sourceName" anchor="bottom middle" self="top middle">
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
import { useR18Toggle } from '../composables/useR18Toggle';

interface Game {
  id: number;
  name: string;
  cover_path: string | null;
  library_name: string;
  library_path: string;
  sub_path: string;
  sourceName?: string | null;
  similarCount?: number;
  isArchive?: boolean;
  r18?: number | null;
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
const { hideR18 } = useR18Toggle();

// Hiding an R18 cover now uses frosted-glass blur instead of a placeholder: the image
// still loads (for both the <img> and the backdrop), but is rendered with a heavy blur
// filter and a centered "18+" label. A dedicated placeholder image can replace it later.
const r18Hidden = computed(() => hideR18.value && props.game.r18 === 1);

const coverSrc = computed(() => {
  if (props.game.cover_path) {
    return getCoversUrl(props.game.cover_path);
  }
  return '';
});

const coverFill = computed(() => (coverSrc.value ? `url("${coverSrc.value}")` : 'none'));

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
}
.game-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--m3-elevation-1);
}

.game-card--selected {
  box-shadow: 0 0 0 2px var(--m3-primary) !important;
}

/* Frosted-glass base for the letterbox bars a non-portrait cover leaves: the cover itself,
   blurred and lifted, so the tile reads as one pane of glass tinted by the artwork.
   The blur is a `filter` on this layer rather than `backdrop-filter` on the artwork. Both
   give the same picture here, but `backdrop-filter` re-samples whatever is behind it on
   every frame, while this is painted once and then cached by the compositor.
   `inset` + `scale` overshoot the tile so the blur's soft edge falls outside the visible
   area instead of showing as a halo. */
.game-cover {
  position: relative;
  aspect-ratio: 2.8 / 4;
  background-color: var(--m3-surface-container-highest);
  background-image: linear-gradient(
    165deg,
    var(--m3-surface-container) 0%,
    var(--m3-surface-dim) 100%
  );
  overflow: hidden;
}

.game-cover::before {
  content: '';
  position: absolute;
  inset: -14%;
  z-index: 0;
  background-image: var(--cover-url, none);
  background-size: cover;
  background-position: center;
  filter: blur(24px) saturate(1.6) brightness(0.6);
  transform: scale(1.16);
}

/* Above the backdrop, but below the title overlay. */
.game-cover__img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* `cover` rather than `contain`: the placeholder is decorative, so filling the tile looks
   better than letterboxing it against the backdrop. */
.game-cover__placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--m3-surface-container-highest);
}

.game-cover__r18-blur {
  filter: blur(20px) saturate(0.4) brightness(0.5);
  transform: scale(1.2);
}

.game-cover__r18-label {
  position: absolute;
  z-index: 3;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 28px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  user-select: none;
}

.game-cover__name {
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.game-cover__title {
  position: absolute;
  z-index: 2;
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