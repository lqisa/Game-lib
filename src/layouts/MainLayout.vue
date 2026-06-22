<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="drawer = !drawer" />
        <q-toolbar-title>Game Lib</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="drawer"
      show-if-above
      bordered
      :width="56"
      :breakpoint="0"
    >
      <q-list>
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
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const drawer = ref(true)
</script>