import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useGameListStore = defineStore('gameList', () => {
  const filteredCount = ref(0);

  return { filteredCount };
});