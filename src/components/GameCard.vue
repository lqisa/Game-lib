<template>
  <div
    class="game-card bg-card relative h-full cursor-pointer overflow-hidden rounded-lg border transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"
    :class="selected ? 'ring-primary ring-2' : ''"
    @click="handleClick"
  >
    <!-- The cover doubles as its own backdrop (see .game-cover::before), exposed as a
         custom property because the URL only exists at runtime. -->
    <div
      class="game-cover relative aspect-[2.8/4] overflow-hidden"
      :style="{ '--cover-url': coverFill }"
    >
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
        src="/placeholder-cover.jpg"
        class="game-cover__img game-cover__placeholder"
        draggable="false"
        alt=""
      />
      <div v-if="r18Hidden" class="game-cover__r18-label">18+</div>

      <div
        v-if="!hideR18 && game.r18 === 1 && !(selectable && selected)"
        class="absolute top-1 left-1 z-[3]"
      >
        <Badge variant="destructive" class="h-4 rounded-sm px-1 text-[10px]">18+</Badge>
      </div>
      <div v-if="selectable && selected" class="absolute top-1 left-1 z-[2]">
        <CheckCircle2 class="text-primary size-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
      </div>
      <div
        v-if="duplicate || game.similarCount"
        class="absolute top-1 right-1 z-[2] flex flex-col items-end gap-1"
      >
        <Tooltip v-if="duplicate">
          <TooltipTrigger as-child>
            <Copy class="text-warning size-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
          </TooltipTrigger>
          <TooltipContent>Shares a source with another game</TooltipContent>
        </Tooltip>
        <Tooltip v-if="game.similarCount">
          <TooltipTrigger as-child>
            <Merge class="text-warning size-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
          </TooltipTrigger>
          <TooltipContent
            >Suspected duplicate: a similar name exists under another vendor</TooltipContent
          >
        </Tooltip>
      </div>

      <div class="game-cover__title">
        <Tooltip v-if="game.sourceName">
          <TooltipTrigger as-child>
            <div class="truncate text-[13px] font-medium">{{ game.sourceName }}</div>
          </TooltipTrigger>
          <TooltipContent side="bottom" class="max-w-80">{{ game.name }}</TooltipContent>
        </Tooltip>
        <div v-else class="truncate text-[13px] font-medium">{{ game.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CheckCircle2, Copy, Merge } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useExpressUrl } from '@/composables/useExpressUrl';
import { useR18Toggle } from '@/composables/useR18Toggle';

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
  coverMissing?: boolean;
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
// placeholder rather than going blank. It must be cleared when the cover changes: the grid keys
// its items by game id, so the instance survives a repair - and a re-download usually lands on
// the very same file name, which leaves cover_path unchanged. `coverMissing` going false is that
// same "the file is back" signal coming from the list.
const coverFailed = ref(false);

watch([() => props.game.cover_path, () => props.game.coverMissing], () => {
  coverFailed.value = false;
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
/* Frosted-glass base for the letterbox bars a non-portrait cover leaves: the cover itself,
   blurred and lifted, so the tile reads as one pane of glass tinted by the artwork.
   The blur is a `filter` on this layer rather than `backdrop-filter` on the artwork. Both
   give the same picture here, but `backdrop-filter` re-samples whatever is behind it on
   every frame, while this is painted once and then cached by the compositor.
   `inset` + `scale` overshoot the tile so the blur's soft edge falls outside the visible
   area instead of showing as a halo. */
.game-cover {
  background-color: var(--muted);
  background-image: linear-gradient(165deg, var(--muted) 0%, var(--background) 100%);
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
  object-fit: cover;
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

.game-cover__title {
  position: absolute;
  z-index: 2;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: #fff;
}

.game-cover__title :deep(*) {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
</style>
