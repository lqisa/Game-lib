<template>
  <router-view />
</template>

<style>
body.body--dark ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
body.body--dark ::-webkit-scrollbar-track {
  background: #1d1d1d;
}
body.body--dark ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}
body.body--dark ::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.35);
}
</style>