import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import { rendererConfig } from './config/vite.renderer.ts';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Three builds in one config, matching the repo's three source directories:
 *
 *   main    - src-electron/electron-main.ts   -> out/main/index.mjs   (ESM; it embeds the Express server)
 *   preload - src-electron/electron-preload.ts -> out/preload/electron-preload.cjs
 *             (CJS on purpose: sandboxed preload scripts must not be ESM)
 *   renderer - src/ (Vue SPA)                 -> out/renderer/
 *
 * The renderer config lives in config/vite.renderer.ts because plain
 * `pnpm dev:frontend` (vite.config.ts) reuses exactly the same aliases/proxy.
 */
export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolvePath('./src-electron/electron-main.ts'),
        output: {
          format: 'es',
          entryFileNames: 'index.mjs',
        },
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolvePath('./src-electron/electron-preload.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'electron-preload.cjs',
        },
      },
    },
  },
  renderer: rendererConfig,
});
