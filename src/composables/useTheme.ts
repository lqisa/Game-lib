import { computed, readonly, ref } from 'vue';

/**
 * Theme state - the replacement for Quasar's $q.dark.
 *
 * The `dark` class on <html> is the single source of truth for CSS (the token
 * block in app.css and Tailwind's `dark:` variant). An inline script in
 * index.html applies the stored value before first paint; initTheme() hydrates
 * this state afterwards, and setThemeMode() keeps both in sync.
 */
const STORAGE_KEY = 'game-lib-theme';

export type ThemeMode = 'light' | 'dark';

const current = ref<ThemeMode>('light');
let initialized = false;

const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

const readStored = (): ThemeMode | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
};

const apply = (mode: ThemeMode) => {
  current.value = mode;
  document.documentElement.classList.toggle('dark', mode === 'dark');
};

export const setThemeMode = (mode: ThemeMode) => {
  apply(mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore (storage can be unavailable) */
  }
};

/** Called once from main.ts, before mount. */
export const initTheme = () => {
  if (initialized) return;
  initialized = true;
  apply(readStored() ?? (systemPrefersDark() ? 'dark' : 'light'));
};

export const useTheme = () => ({
  mode: readonly(current),
  isDark: computed(() => current.value === 'dark'),
  setMode: setThemeMode,
  toggle: () => setThemeMode(current.value === 'dark' ? 'light' : 'dark'),
});
