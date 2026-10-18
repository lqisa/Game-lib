<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-52">
      <template v-if="archivedMode">
        <ContextMenuItem @select="$emit('unarchive', game.id)">
          <ArchiveRestore class="text-muted-foreground" />
          Unarchive
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          class="text-destructive!"
          @select="$emit('delete-game', game.id)"
        >
          <Trash2 />
          Delete Game
        </ContextMenuItem>
      </template>

      <template v-else-if="favoritesMode">
        <ContextMenuItem @select="$emit('unfavorite', game.id)">
          <HeartOff class="text-muted-foreground" />
          Remove from Favorites
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="$emit('archive', game.id)">
          <Archive class="text-muted-foreground" />
          Archive
        </ContextMenuItem>
      </template>

      <template v-else>
        <ContextMenuItem @select="$emit('toggle-favorite', game.id)">
          <Star
            :class="game.is_favorite ? 'fill-current text-destructive' : 'text-muted-foreground'"
          />
          {{ game.is_favorite ? 'Remove from Favorites' : 'Add to Favorites' }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="$emit('archive', game.id)">
          <Archive class="text-muted-foreground" />
          Archive
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          class="text-destructive!"
          @select="$emit('delete-game', game.id)"
        >
          <Trash2 />
          Delete Game
        </ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import { Archive, ArchiveRestore, HeartOff, Star, Trash2 } from '@lucide/vue';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

/**
 * Right-click menu for a game tile - the reka-ui (shadcn) ContextMenu port of
 * the old q-menu based component. It wraps the tile it belongs to (the default
 * slot becomes the trigger), so GameLibPage no longer tracks menu coordinates.
 */
interface GameItem {
  id: number;
  name: string;
  is_favorite: boolean;
}

defineProps<{
  game: GameItem;
  favoritesMode: boolean;
  archivedMode: boolean;
}>();

defineEmits<{
  'delete-game': [id: number];
  'toggle-favorite': [id: number];
  unfavorite: [id: number];
  archive: [id: number];
  unarchive: [id: number];
}>();
</script>
