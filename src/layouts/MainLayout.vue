<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="drawer = !drawer" />
        <q-toolbar-title>Game Lib</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered :width="56" :breakpoint="0" class="sidebar-no-scroll">
      <div class="column full-height">
        <q-list class="col">
          <q-item clickable v-ripple to="/" exact>
            <q-item-section avatar>
              <q-icon name="videogame_asset" />
            </q-item-section>
            <q-item-section>Game Lib</q-item-section>
            <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">Game Lib</q-tooltip>
          </q-item>
          <q-item clickable v-ripple to="/settings">
            <q-item-section avatar>
              <q-icon name="settings" />
            </q-item-section>
            <q-item-section>Setting</q-item-section>
            <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">Setting</q-tooltip>
          </q-item>
        </q-list>
        <q-item clickable v-ripple @click="dark = !dark">
          <q-item-section avatar>
            <q-icon :name="dark ? 'dark_mode' : 'light_mode'" />
          </q-item-section>
          <q-item-section>{{ dark ? 'Dark' : 'Light' }}</q-item-section>
          <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">{{ dark ? 'Switch to Light' : 'Switch to Dark' }}</q-tooltip>
        </q-item>
        <q-item v-if="hasElectronAPI" clickable v-ripple @click="enterLightweightMode">
          <q-item-section avatar>
            <q-icon name="power_settings_new" />
          </q-item-section>
          <q-item-section>Lightweight</q-item-section>
          <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">Enter Lightweight Mode</q-tooltip>
        </q-item>
      </div>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';

const $q = useQuasar();
const drawer = ref(true);

const hasElectronAPI = computed(() => !!window.electronAPI);

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
.sidebar-no-scroll {
  overflow-x: hidden !important;
}
.sidebar-no-scroll .q-drawer__content {
  overflow-x: hidden !important;
}
</style>