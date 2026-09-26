<template>
  <q-layout view="lHh Lpr lFf">
    <q-header>
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          @click="drawer = !drawer"
          style="color: var(--m3-on-surface-variant)"
        />
        <q-toolbar-title>
          Game Lib<template v-if="$route.path === '/' && gameListStore.favoritesMode">
            - Favorites</template
          >
          <span v-if="showGameCount" class="q-ml-sm" style="color: var(--m3-on-surface-variant)"
            >({{ filteredCount }})</span
          >
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
            <q-tooltip anchor="center right" self="center left" :offset="[8, 0]"
              >Game Lib</q-tooltip
            >
          </div>
          <div
            class="m3-nav-item"
            :class="{ 'm3-nav-item--active': gameListStore.favoritesMode && $route.path === '/' }"
            @click="navigateTo('/', true)"
          >
            <q-icon name="star" class="m3-nav-icon" />
            <span class="m3-nav-label">Favorites</span>
            <q-tooltip anchor="center right" self="center left" :offset="[8, 0]"
              >Favorites</q-tooltip
            >
          </div>
          <div
            class="m3-nav-item"
            :class="{ 'm3-nav-item--active': $route.path === '/recently' }"
            @click="void router.push('/recently')"
          >
            <q-icon name="history" class="m3-nav-icon" />
            <span class="m3-nav-label">Recently</span>
            <q-tooltip anchor="center right" self="center left" :offset="[8, 0]"
              >Recently Opened</q-tooltip
            >
          </div>
          <div
            class="m3-nav-item"
            :class="{ 'm3-nav-item--active': $route.path === '/settings' }"
            @click="void router.push('/settings')"
          >
            <q-icon name="settings" class="m3-nav-icon" />
            <span class="m3-nav-label">Settings</span>
            <q-tooltip anchor="center right" self="center left" :offset="[8, 0]"
              >Settings</q-tooltip
            >
          </div>
        </div>
        <div class="m3-nav-item" @click="dark = !dark">
          <q-icon :name="dark ? 'dark_mode' : 'light_mode'" class="m3-nav-icon" />
          <span class="m3-nav-label">{{ dark ? 'Dark' : 'Light' }}</span>
          <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">{{
            dark ? 'Switch to Light' : 'Switch to Dark'
          }}</q-tooltip>
        </div>
        <div v-if="hasElectronAPI" class="m3-nav-item" @click="enterLightweightMode">
          <q-icon name="power_settings_new" class="m3-nav-icon" />
          <span class="m3-nav-label">Exit</span>
          <q-tooltip anchor="center right" self="center left" :offset="[8, 0]"
            >Enter Lightweight Mode</q-tooltip
          >
        </div>
      </div>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>

    <q-page-sticky position="bottom-right" :offset="[16, 16]">
      <q-btn fab icon="assignment" color="primary" @click="showTaskPanel = true">
        <q-badge v-if="taskStore.runningCount > 0" color="red" floating>{{
          taskStore.runningCount
        }}</q-badge>
        <q-tooltip>Tasks</q-tooltip>
      </q-btn>
    </q-page-sticky>

    <TaskPanel v-model="showTaskPanel" />
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useGameListStore } from '../stores/gameListStore';
import { useTaskStore } from '../stores/taskStore';
import TaskPanel from '../components/TaskPanel.vue';

const $q = useQuasar();
const router = useRouter();
const route = useRoute();
const drawer = ref(true);

const gameListStore = useGameListStore();
const taskStore = useTaskStore();
const showTaskPanel = ref(false);
const filteredCount = computed(() => gameListStore.filteredCount);

// The count describes the game list, so it is only shown on the list route
// (both the normal and the favorites view) - not on the detail or settings pages.
const showGameCount = computed(() => route.path === '/');

const hasElectronAPI = computed(() => !!window.electronAPI);

const navigateTo = (path: string, favorites: boolean) => {
  gameListStore.favoritesMode = favorites;
  // Record which rail entry owns the list page, so the list can reset view-only state
  // (selection mode in particular) instead of leaking it across Games and Favorites.
  gameListStore.mode = favorites ? 'favorites' : 'games';
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

onMounted(() => {
  void taskStore.connectSSE();

  if (window.electronAPI) {
    window.electronAPI.onMoveInProgress?.(() => {
      $q.dialog({
        title: 'Task In Progress',
        message:
          'A file task (move / extract / compress) is still running. Closing now may leave it half-finished. Force quit?',
        cancel: true,
        persistent: true,
      }).onOk(() => {
        void window.electronAPI?.forceQuit?.();
      });
    });
  }
});
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
  transition:
    background 0.2s cubic-bezier(0.2, 0, 0, 1),
    color 0.2s cubic-bezier(0.2, 0, 0, 1);
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
