import { createRouter, createWebHashHistory } from 'vue-router';
import routes from './routes';

/**
 * Hash history on purpose: the SPA is served by the Express server in the
 * packaged app, and a standalone deployment may sit behind any host/path/port
 * (NAS, another PC). Hash routes need no server-side rewrite rules, so deep
 * links work everywhere without configuration.
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { left: 0, top: 0 },
});

export default router;
