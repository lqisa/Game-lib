<template>
  <q-menu
    context-menu
    anchor="bottom left"
    self="top left"
    @hide="$emit('close')"
  >
    <q-list dense style="min-width: 160px">
      <template v-if="favoritesMode">
        <q-item clickable v-close-popup @click="$emit('unfavorite', game.id)">
          <q-item-section avatar>
            <q-icon name="heart_broken" color="orange" />
          </q-item-section>
          <q-item-section>Unfavorite</q-item-section>
        </q-item>
      </template>
      <template v-else>
        <q-item clickable v-close-popup @click="$emit('toggle-favorite', game.id)">
          <q-item-section avatar>
            <q-icon :name="game.is_favorite ? 'star' : 'star_border'" :color="game.is_favorite ? 'orange' : ''" />
          </q-item-section>
          <q-item-section>{{ game.is_favorite ? 'Remove from Favorites' : 'Add to Favorites' }}</q-item-section>
        </q-item>
        <q-separator />
        <q-item clickable v-close-popup @click="$emit('delete-game', game.id)">
          <q-item-section avatar>
            <q-icon name="delete" color="negative" />
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