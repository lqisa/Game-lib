import fs from 'node:fs';
import path from 'node:path';
import { NON_GAME_DIRS, ARCHIVE_EXTENSIONS, VOLUME_PATTERNS } from './constants.js';

const isArchiveEntry = (name) => {
  const ext = path.extname(name).toLowerCase();
  if (ARCHIVE_EXTENSIONS.has(ext)) return true;
  return VOLUME_PATTERNS.some((p) => p.test(name));
};

const scanDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return { dirs: [], archives: [] };
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const archives = entries
    .filter((e) => e.isFile())
    .filter((e) => isArchiveEntry(e.name))
    .map((e) => e.name);

  return { dirs, archives: deduplicateArchives(archives) };
};

const expandDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return { dirs: [], archives: [], hasSubDirs: {} };
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const archives = entries
    .filter((e) => e.isFile())
    .filter((e) => isArchiveEntry(e.name))
    .map((e) => e.name);

  const hasSubDirs = {};
  for (const d of dirs) {
    const subPath = path.join(dirPath, d);
    try {
      hasSubDirs[d] = fs.readdirSync(subPath, { withFileTypes: true }).some((e) => e.isDirectory());
    } catch {
      hasSubDirs[d] = false;
    }
  }

  return {
    dirs: filterGameDirs(dirs),
    archives: deduplicateArchives(archives),
    hasSubDirs,
  };
};

const deduplicateArchives = (archiveNames) => {
  const map = new Map();
  for (const name of archiveNames) {
    let baseName = null;
    for (const pattern of VOLUME_PATTERNS) {
      const match = name.match(pattern);
      if (match) {
        baseName = match[1];
        break;
      }
    }
    if (baseName) {
      if (!map.has(baseName)) map.set(baseName, name);
    } else {
      const ext = path.extname(name);
      map.set(name.slice(0, -ext.length), name);
    }
  }
  return [...map.values()];
};

const filterGameDirs = (dirNames) => {
  return dirNames.filter((d) => !NON_GAME_DIRS.has(d.toLowerCase()));
};

export { scanDirectory, expandDirectory, deduplicateArchives, filterGameDirs, isArchiveEntry };