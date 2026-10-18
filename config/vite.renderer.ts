import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import type { UserConfig } from 'vite';

const API_PORT = process.env.VITE_API_PORT || '19700';
const FRONTEND_PORT = Number.parseInt(process.env.VITE_FRONTEND_PORT || '9000', 10);

/**
 * Renderer (SPA) config shared by:
 *   - the Electron build (electron.vite.config.ts, renderer section)
 *   - plain `pnpm dev:frontend` (vite.config.ts)
 *
 * Both dev flows must see the same aliases and the same /api + /covers proxy,
 * because the frontend builds every backend url as same-origin
 * (src/composables/useExpressUrl.ts) - in dev the Vite dev server is what makes
 * that work, in production the Express server serves the SPA itself.
 */
export const rendererConfig: UserConfig = {
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  server: {
    port: FRONTEND_PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
      '/covers': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../out/renderer', import.meta.url)),
    emptyOutDir: true,
    // Electron-vite only auto-detects an index.html under src/renderer; this
    // project keeps it at the repo root, so the entry is declared explicitly.
    rolldownOptions: {
      input: fileURLToPath(new URL('../index.html', import.meta.url)),
    },
  },
};
