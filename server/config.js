import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getDataDir = () => {
  if (process.env.GAME_LIB_DATA_DIR) {
    return process.env.GAME_LIB_DATA_DIR;
  }
  if (process.env.GAME_LIB_PROD) {
    return path.join(process.env.APPDATA, 'Game Lib');
  }
  return path.join(__dirname, '..', 'test-data');
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Ephemeral-DB detection. Test runs (e2e / manual) use an in-memory sqlite db so they
// never touch the real data file; dev must use the real file at getDataDir()/db.sqlite3.
// Ports come from config/ports.ts: dev = 19700, e2e = 19701, manual = 19702.
const DEV_API_PORT = '19700';

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
