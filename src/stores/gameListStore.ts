import { defineStore } from 'pinia';
import { ref } from 'vue';

// The game grid is rendered by two views (all games / favorites) that share one component.
// This store holds what the left rail selected so the list page can react to a mode switch
// without either view reaching into the other's local state.
export type GameListMode = 'games' | 'favorites' | 'recently';

export const useGameListStore = defineStore('gameList', () => {
  const filteredCount = ref(0);
  const favoritesMode = ref(false);
  const mode = ref<GameListMode>('games');

  return { filteredCount, favoritesMode, mode };
});
