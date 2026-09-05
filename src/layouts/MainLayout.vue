<template>
  <q-layout view="lHh Lpr lFf">
    <q-header>
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="drawer = !drawer" style="color: var(--m3-on-surface-variant);" />
        <q-toolbar-title>
          Game Lib<template v-if="gameListStore.favoritesMode"> - Favorites</template>
          <span class="q-ml-sm text-caption" style="color: var(--m3-on-surface-variant);">({{ filteredCount }})</span>
        </q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above :width="80" :breakpoint="0" class="m3-nav-rail">
      <div class="column full-height items-center m3-nav-rail-inner">
        <div class="col column items-center">
          <div
            class="m3-nav-item"
            :class="{ 'm3-nav-item--active': !gameListStore.favoritesMode && $route.path === '/' }"
            @click="navigateTo('/', false)"
          >
            <q-icon name="videogame_asset" class="m3-nav-icon" />
            <span class="m3-nav-label">Games</span>
            <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">Game Lib</q-tooltip>
          </div>
          <div
            class="m3-nav-item"
            :class="{ 'm3-nav-item--active': gameListStore.favoritesMode && $route.path === '/' }"
            @click="navigateTo('/', true)"
          >
            <q-icon name="star" class="m3-nav-icon" />
            <span class="m3-nav-label">Favorites</span>
            <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">Favorites</q-tooltip>
          </div>
          <div
            class="m3-nav-item"
            :class="{ 'm3-nav-item--active': $route.path === '/settings' }"
            @click="void router.push('/settings')"
          >
            <q-icon name="settings" class="m3-nav-icon" />
            <span class="m3-nav-label">Settings</span>
            <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">Settings</q-tooltip>
          </div>
        </div>
        <div
          class="m3-nav-item"
          @click="dark = !dark"
        >
          <q-icon :name="dark ? 'dark_mode' : 'light_mode'" class="m3-nav-icon" />
          <span class="m3-nav-label">{{ dark ? 'Dark' : 'Light' }}</span>
          <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">{{ dark ? 'Switch to Light' : 'Switch to Dark' }}</q-tooltip>
        </div>
        <div
          v-if="hasElectronAPI"
          class="m3-nav-item"
          @click="enterLightweightMode"
        >
          <q-icon name="power_settings_new" class="m3-nav-icon" />
          <span class="m3-nav-label">Exit</span>
          <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">Enter Lightweight Mode</q-tooltip>
        </div>
      </div>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useGameListStore } from '../stores/gameListStore';

const $q = useQuasar();
const router = useRouter();
const drawer = ref(true);

const gameListStore = useGameListStore();
const filteredCount = computed(() => gameListStore.filteredCount);

const hasElectronAPI = computed(() => !!window.electronAPI);

const navigateTo = (path: string, favorites: boolean) => {
  gameListStore.favoritesMode = favorites;
  void router.push(path);
};

const stored = localStorage.getItem('dark');
if (stored !== null) {
  $q.dark.set(stored === 'true');
  document.documentElement.classList.toggle('body--dark', stored === 'true');
}

const dark = computed({
  get: () => $q.dark.isActive,
  set: (val: boolean) => {
    $q.dark.set(val);
    document.documentElement.classList.toggle('body--dark', val);
    localStorage.setItem('dark', String(val));
  },
});

const enterLightweightMode = async () => {
  if (!window.electronAPI) return;
  await window.electronAPI.enterLightweightMode();
};
</script>

<style>
.m3-nav-rail {
  overflow-x: hidden !important;
  background: var(--m3-surface) !important;
  border-right: 1px solid var(--m3-outline-variant) !important;
  box-shadow: none !important;
}
.m3-nav-rail .q-drawer__content {
  overflow-x: hidden !important;
}

.m3-nav-rail-inner {
  padding: 8px 0;
  gap: 4px;
}

.m3-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 56px;
  padding: 4px 0;
  border-radius: var(--m3-shape-corner-lg);
  cursor: pointer;
  color: var(--m3-on-surface-variant);
  transition: background 0.2s cubic-bezier(0.2, 0, 0, 1), color 0.2s cubic-bezier(0.2, 0, 0, 1);
  user-select: none;
}

.m3-nav-item:hover {
  background: rgba(103, 80, 164, 0.08);
}

.m3-nav-item.m3-nav-item--active {
  color: var(--m3-on-secondary-container);
  background: var(--m3-secondary-container);
}

.m3-nav-icon {
  font-size: 24px;
  width: 24px;
  height: 24px;
}

.m3-nav-label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-align: center;
  line-height: 1.2;
  white-space: nowrap;
  margin-top: 4px;
}
</style>