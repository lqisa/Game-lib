/**
 * Which database a maintenance script may touch.
 *
 * These scripts write to the library, and the data directory is chosen by environment variables:
 * a bare `node server/scripts/<script>.js` run inside the repo resolves to `test-data/`, which is
 * the dev copy. So the target has to be named explicitly - `GAME_LIB_PROD=1`,
 * `GAME_LIB_DATA_DIR=<dir>` or `--data-dir <dir>` - and test-data is refused unless the caller adds
 * `--allow-test-data` on purpose.
 *
 * The chosen directory is exported as GAME_LIB_DATA_DIR *before* the caller imports
 * `database/db.js`, because that module fixes its pool on import. That is also why the flag names a
 * directory rather than a file: db.js always opens `<dir>/db.sqlite3`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../config.js';

const flagValue = (argv, name) => {
  const at = argv.indexOf(name);
  return at === -1 ? null : (argv[at + 1] ?? null);
};

export const resolveTargetDatabase = (argv = process.argv.slice(2)) => {
  const explicitDir = flagValue(argv, '--data-dir');
  const fromEnv = process.env.GAME_LIB_DATA_DIR || null;
  const prod = process.env.GAME_LIB_PROD === '1';

  if (!explicitDir && !fromEnv && !prod) {
    throw new Error(
      'Refusing to guess which library to write to. Name it explicitly:\n' +
        '  GAME_LIB_PROD=1            the packaged app data dir (%APPDATA%/Game Lib)\n' +
        '  GAME_LIB_DATA_DIR=<dir>    any other data directory\n' +
        '  --data-dir <dir>           same, for a throwaway copy\n' +
        'test-data/ (the dev copy) additionally needs --allow-test-data.',
    );
  }

  const dataDir = explicitDir ? path.resolve(explicitDir) : getDataDir();
  const dbPath = path.join(dataDir, 'db.sqlite3');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`no database at ${dbPath} (the flag names a data directory, not a file)`);
  }

  const isTestData = /(^|[\\/])test-data([\\/]|$)/.test(dataDir);
  if (isTestData && !argv.includes('--allow-test-data')) {
    throw new Error(
      `${dbPath} is the dev/test copy. Add --allow-test-data if that is really the library you mean.`,
    );
  }

  // db.js reads this on import, so --data-dir works the same way the environment variables do.
  process.env.GAME_LIB_DATA_DIR = dataDir;
  return { dataDir, dbPath, isTestData };
};

/** A consistent snapshot next to the database, taken with SQLite's own backup (not a file copy). */
export const backupDatabase = async (knex, dbPath) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${dbPath}.backup-${stamp}`;
  try {
    await knex.raw('VACUUM INTO ?', [backupPath]);
  } catch {
    // Older SQLite builds do not take a bound parameter there; the path is ours, not user input.
    await knex.raw(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  }
  if (!fs.existsSync(backupPath)) {
    throw new Error(`the backup was not written to ${backupPath} - refusing to write`);
  }
  return backupPath;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
