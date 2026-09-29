import path from 'node:path';
import fs from 'node:fs';
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
    return path.join(process.env.APPDATA, 'Game Lib');
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
  if (process.env.SSE_TOKEN) return process.env.SSE_TOKEN;
  try {
    const tokenFile = path.join(getDataDir(), '.sse-token');
    if (fs.existsSync(tokenFile)) {
      return fs.readFileSync(tokenFile, 'utf-8').trim();
    }
  } catch {
    /* ignore */
  }
  return null;
};

export { getDataDir, ensureDir, isTestEnv };
