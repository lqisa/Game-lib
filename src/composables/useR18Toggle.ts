import { ref } from 'vue';

// UI preference for hiding R18 covers, stored the same way as the dark-mode toggle. The
// ref lives at module level so the nav rail and every card share one value.
const KEY = 'hideR18';
const hideR18 = ref(localStorage.getItem(KEY) === '1');

export const useR18Toggle = () => {
  const setHideR18 = (value: boolean) => {
    hideR18.value = value;
    localStorage.setItem(KEY, value ? '1' : '0');
    console.log(`[r18-toggle] hideR18 = ${value}`);
  };
  return { hideR18, setHideR18 };
};