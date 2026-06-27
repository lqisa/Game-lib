import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getDataDir = () => {
  if (process.env.GAME_LIB_DATA_DIR) {
    return process.env.GAME_LIB_DATA_DIR
  }
  return path.join(__dirname, '..', '..', 'data')

  // for debugging build version
  // return path.join(process.env.APPDATA, 'Game Lib');
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export { getDataDir, ensureDir };
