/**
 * Standalone server entry - the deployment mode without the Electron shell.
 *
 * Runs the API and serves the built frontend from a single Express process, so
 * the exact same build artifacts power three clients:
 *
 *   - the packaged Electron app (in-process server, loopback only)
 *   - a dev machine            (`pnpm dev:server` / `pnpm dev:frontend`)
 *   - a home server / NAS      (this file; LAN-reachable)
 *
 * Usage:
 *   node server/standalone.js [--frontend <dir>]
 *
 * Env:
 *   GAME_LIB_HOST      listen address   (default 0.0.0.0 - LAN reachable)
 *   GAME_LIB_PORT      listen port      (default 19770, or $PORT)
 *   GAME_LIB_DATA_DIR  data directory   (recommended outside Electron, otherwise
 *                                        GAME_LIB_PROD=1 uses %APPDATA%/Game Lib
 *                                        on Windows and ~/.game-lib elsewhere)
 *
 * Security note: the API has no authentication. Anyone who can reach the port
 * can view and modify the library on this machine. Only run it on a trusted
 * network, or put a reverse proxy with auth in front of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { initDatabase } from './database/init.js';
import { initProxy } from './scraper/axios.js';
import { API_PORTS, resolveApiPort, resolveListenHost } from './ports.js';
import { getDataDir } from './config.js';
import { startBackgroundWorkers } from './background-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argumentFrontend = (() => {
  const index = process.argv.indexOf('--frontend');
  return index >= 0 ? process.argv[index + 1] : undefined;
})();

/**
 * Finds the built SPA. Candidates are tried in order: an explicit argument or
 * env var first, then the two build-output layouts this repo has used - the
 * electron-vite renderer output and the legacy Quasar dist/spa.
 */
const resolveFrontendDir = () => {
  const candidates = [
    argumentFrontend,
    process.env.GAME_LIB_FRONTEND_DIR,
    path.resolve(__dirname, '..', 'out', 'renderer'),
    path.resolve(__dirname, '..', 'dist', 'spa'),
  ].filter((dir) => Boolean(dir));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
};

await initDatabase();
await initProxy();
startBackgroundWorkers();

const frontendDir = resolveFrontendDir();
const app = createApp(frontendDir);

const host = resolveListenHost('0.0.0.0');
const port = resolveApiPort(API_PORTS.prod);

app.listen(port, host, () => {
  console.log(` * Game Lib server running on http://${host}:${port}`);
  console.log(` * Data directory: ${getDataDir()}`);
  if (frontendDir) {
    console.log(` * Serving frontend from ${frontendDir}`);
  } else {
    console.warn(' * No frontend build found (API only). Build the app or pass --frontend <dir>.');
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.warn(
      ' * LAN access is enabled and the API has no authentication - trusted networks only.',
    );
  }
});
