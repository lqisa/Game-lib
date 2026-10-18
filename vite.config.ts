import { defineConfig } from 'vite';
import { rendererConfig } from './config/vite.renderer.ts';

// `pnpm dev:frontend` - runs the SPA alone against an already-running backend
// (pnpm dev:server). The Electron build uses the same rendererConfig through
// electron.vite.config.ts.
export default defineConfig(rendererConfig);
