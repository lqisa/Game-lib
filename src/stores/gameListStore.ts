import { defineStore } from 'pinia';
import { ref } from 'vue';

// The game grid is rendered by three views (all games / favorites / archive) that share one
// component. This store holds what the left rail selected so the list page can react to a mode
// switch without either view reaching into the other's local state.
export type GameListMode = 'games' | 'favorites' | 'archived' | 'recently';

export const useGameListStore = defineStore('gameList', () => {
  const filteredCount = ref(0);
  const favoritesMode = ref(false);
  const archivedMode = ref(false);
  const mode = ref<GameListMode>('games');

  return { filteredCount, favoritesMode, archivedMode, mode };
});
