import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { vLazyImg } from './composables/vLazyImg';
import { initTheme } from './composables/useTheme';
import './css/app.css';

// Sync the theme state with the class index.html already applied to <html>
// (it runs before first paint to avoid a light flash; this hydrates the ref).
initTheme();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.directive('lazy-img', vLazyImg);
app.mount('#app');
