import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useGameListStore = defineStore('gameList', () => {
  const filteredCount = ref(0);
  const favoritesMode = ref(false);

  return { filteredCount, favoritesMode };
});