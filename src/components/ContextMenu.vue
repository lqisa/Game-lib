<template>
  <q-menu
    context-menu
    anchor="bottom left"
    self="top left"
    class="m3-context-menu"
    @hide="$emit('close')"
  >
    <q-list dense style="min-width: 180px; padding: 8px 0;">
      <template v-if="favoritesMode">
        <q-item clickable v-close-popup class="m3-menu-item" @click="$emit('unfavorite', game.id)">
          <q-item-section avatar>
            <q-icon name="heart_broken" style="color: var(--m3-error);" />
          </q-item-section>
          <q-item-section>Unfavorite</q-item-section>
        </q-item>
      </template>
      <template v-else>
        <q-item clickable v-close-popup class="m3-menu-item" @click="$emit('toggle-favorite', game.id)">
          <q-item-section avatar>
            <q-icon :name="game.is_favorite ? 'star' : 'star_border'" :style="{ color: game.is_favorite ? 'var(--m3-error)' : 'var(--m3-on-surface-variant)' }" />
          </q-item-section>
          <q-item-section>{{ game.is_favorite ? 'Remove from Favorites' : 'Add to Favorites' }}</q-item-section>
        </q-item>
        <q-separator />
        <q-item clickable v-close-popup class="m3-menu-item" @click="$emit('delete-game', game.id)">
          <q-item-section avatar>
            <q-icon name="delete" style="color: var(--m3-error);" />
          </q-item-section>
          <q-item-section>Delete Game</q-item-section>
        </q-item>
      </template>
    </q-list>
  </q-menu>
</template>

<script setup lang="ts">
interface GameItem {
  id: number;
  name: string;
  is_favorite: boolean;
}

defineProps<{
  game: GameItem;
  favoritesMode: boolean;
}>();

defineEmits<{
  close: [];
  'delete-game': [id: number];
  'toggle-favorite': [id: number];
  unfavorite: [id: number];
}>();
</script>

<style>
.m3-context-menu {
  border-radius: var(--m3-shape-corner-md) !important;
  background: var(--m3-surface-container) !important;
  border: 1px solid var(--m3-outline-variant) !important;
  box-shadow: var(--m3-elevation-2) !important;
}

.m3-menu-item {
  border-radius: var(--m3-shape-corner-sm) !important;
  margin: 0 8px !important;
  padding: 8px 12px !important;
  min-height: 48px !important;
  color: var(--m3-on-surface) !important;
}

.m3-menu-item:hover {
  background: rgba(103, 80, 164, 0.08) !important;
}
</style>