import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { API_PORTS } from './ports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getProjectRoot = () => {
  let cur = __dirname;
  for (let i = 0; i < 6; i++) {
    const pkgPath = path.join(cur, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'game-lib') return cur;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(__dirname, '..');
};

const getDataDir = () => {
  if (process.env.GAME_LIB_DATA_DIR) {
    return process.env.GAME_LIB_DATA_DIR;
  }
  if (process.env.GAME_LIB_PROD) {
    // %APPDATA% only exists on Windows. Self-hosted deployments (NAS, Linux boxes)
    // where a standalone prod server runs without the Electron shell fall back to
    // a dot-folder in the home directory - GAME_LIB_DATA_DIR still wins over both.
    if (process.env.APPDATA) {
      return path.join(process.env.APPDATA, 'Game Lib');
    }
    return path.join(os.homedir(), '.game-lib');
  }
  return path.join(getProjectRoot(), 'test-data');
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Ephemeral-DB detection. Test runs (e2e / manual) use an in-memory sqlite db so they
// never touch the real data file; dev must use the real file at getDataDir()/db.sqlite3.
// Ports: see server/ports.js — dev=19700, test=19701, prod=19770.
const DEV_API_PORT = String(API_PORTS.dev);

const isTestEnv = () => {
  const apiPort = process.env.VITE_API_PORT || '';
  return (
    process.env.PLAYWRIGHT_TEST === 'true' ||
    process.env.NODE_ENV === 'test' ||
    (apiPort.startsWith('1970') && apiPort !== DEV_API_PORT)
  );
};

export const getSseToken = () => {
  // The Electron shell generates the token and passes it through the
  // environment when it hosts this server in-process; the renderer receives it
  // through preload and appends it to the SSE url.
  //
  // The old `.sse-token` file fallback was removed: only non-Electron processes
  // (dev:server, standalone) could end up reading it, and those are exactly the
  // servers whose clients are plain browsers - which have no way to obtain the
  // token. It protected nothing and silently blocked the task stream in every
  // browser-based dev/deployment flow.
  return process.env.SSE_TOKEN || null;
};

export { getDataDir, ensureDir, isTestEnv };
