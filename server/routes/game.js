import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import * as db from '../database/db.js';
import { scanDirectory, expandDirectory } from '../scanner.js';
import { ARCHIVE_EXTENSIONS, VOLUME_PATTERNS } from '../constants.js';
import {
  createTask,
  executeMoveTask,
  executeExtractTask,
  executeCompressTask,
  activeTaskForGame,
} from '../tasks.js';

// Settings that hold a list of paths. Anything that is not a JSON array is treated as
// empty: a client can write an arbitrary value via PUT /api/settings/:key, and spreading
// a JSON string (e.g. "abc") would otherwise yield single characters instead of paths.
const getPathListSetting = async (key) => {
  const row = await db.knex('setting').where({ key }).first();
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getBlacklist = () => getPathListSetting('blacklist');
const getArchivedArchives = () => getPathListSetting('archived_archives');
const getArchivedFolders = () => getPathListSetting('archived_folders');

const isArchiveFile = (name) => {
  const ext = path.extname(name).toLowerCase();
  if (ARCHIVE_EXTENSIONS.has(ext)) return true;
  return VOLUME_PATTERNS.some((p) => p.test(name));
};

const shouldCompress = (sourcePath) => {
  if (!fs.existsSync(sourcePath)) {
    return { compress: false, reason: 'not_exists' };
  }
  const stat = fs.statSync(sourcePath);
  if (!stat.isDirectory()) {
    if (isArchiveFile(sourcePath)) {
      return { compress: false, reason: 'already_archive' };
    }
    return { compress: false, reason: 'not_directory' };
  }
  const children = fs.readdirSync(sourcePath, { withFileTypes: true });
  const hasArchiveChild = children.some((c) => c.isFile() && isArchiveFile(c.name));
  if (hasArchiveChild) {
    return { compress: false, reason: 'contains_archives' };
  }
  return { compress: true, reason: 'needs_compression' };
};

import { COVERS_DIR, imageExtension } from '../scraper/cover.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const {
      page,
      pageSize,
      keyword,
      libraryIds,
      noLibrary,
      makerIds,
      genreIds,
      tagIds,
      scraped,
      duplicate,
      favoritesOnly,
      sortBy,
      sortOrder,
    } = req.query;

    const blacklist = await getBlacklist();
    const archived = await getArchivedArchives();
    const archivedFolders = await getArchivedFolders();
    const excludeSubPaths = [...blacklist, ...archived, ...archivedFolders];

    const result = await db.getGames({
      page: page !== undefined ? Number(page) : 1,
      pageSize: pageSize !== undefined ? Number(pageSize) : 50,
      keyword: keyword || '',
      libraryIds: libraryIds ? String(libraryIds).split(',').map(Number) : undefined,
      noLibrary: noLibrary === 'true',
      makerIds: makerIds ? String(makerIds).split(',').map(Number) : undefined,
      genreIds: genreIds ? String(genreIds).split(',').map(Number) : undefined,
      tagIds: tagIds ? String(tagIds).split(',').map(Number) : undefined,
      scraped: scraped === 'true' ? true : scraped === 'false' ? false : undefined,
      duplicate: duplicate === 'yes' ? true : duplicate === 'no' ? false : undefined,
      favoritesOnly: favoritesOnly === 'true',
      excludeSubPaths,
      sortBy: sortBy || 'updated_at',
      sortOrder: sortOrder || 'desc',
    });
    res.send(result);
  } catch (err) {
    next(err);
  }
});

router.get('/makers', async (req, res, next) => {
  try {
    const makers = await db.getMakers();
    res.send(makers);
  } catch (err) {
    next(err);
  }
});

router.get('/genres', async (req, res, next) => {
  try {
    const genres = await db.getGenres();
    res.send(genres);
  } catch (err) {
    next(err);
  }
});

router.get('/tags', async (req, res, next) => {
  try {
    const tags = await db.getTags();
    res.send(tags);
  } catch (err) {
    next(err);
  }
});

router.get('/unscraped', async (req, res, next) => {
  try {
    const { libraryId } = req.query;
    if (!libraryId) {
      return res.status(400).send({ error: 'libraryId is required' });
    }
    const games = await db.getUnscrapedGames(Number(libraryId));
    const blacklist = await getBlacklist();
    const archived = await getArchivedArchives();
    const archivedFolders = await getArchivedFolders();
    const excludeList = [...blacklist, ...archived, ...archivedFolders];
    if (excludeList.length > 0) {
      const set = new Set(excludeList);
      const filtered = games.filter((g) => !set.has(g.sub_path));
      return res.send(filtered);
    }
    res.send(games);
  } catch (err) {
    next(err);
  }
});

router.get('/duplicates', async (req, res, next) => {
  try {
    const duplicates = await db.getDuplicateSources();
    res.send(duplicates);
  } catch (err) {
    next(err);
  }
});

router.post('/check-conflicts', async (req, res, next) => {
  try {
    const { sources } = req.body;
    if (!Array.isArray(sources)) {
      return res.status(400).send({ error: 'sources array is required' });
    }
    if (sources.length === 0) {
      return res.send([]);
    }

    // Group submitted sources by (sourceType, sourceId) to detect intra-batch conflicts
    const groups = new Map();
    for (const s of sources) {
      if (!s.sourceType || !s.sourceId) continue;
      const key = `${s.sourceType}:${s.sourceId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          sourceType: s.sourceType,
          sourceId: String(s.sourceId),
          batchGames: [],
        });
      }
      groups.get(key).batchGames.push({ gameId: s.gameId, name: s.name });
    }

    const conflicts = [];

    // Single batch query to fetch all existing sources at once (fixes N+1 performance issue)
    const allSourceKeys = Array.from(groups.keys());
    if (allSourceKeys.length > 0) {
      let query = db.knex('game_source as gs').join('game as g', 'g.id', 'gs.game_id');

      allSourceKeys.forEach((key, index) => {
        const [sourceType, sourceId] = key.split(':');
        if (index === 0) {
          query = query.where({ 'gs.source_type': sourceType, 'gs.source_id': sourceId });
        } else {
          query = query.orWhere({ 'gs.source_type': sourceType, 'gs.source_id': sourceId });
        }
      });

      const allExisting = await query.select(
        'gs.source_type',
        'gs.source_id',
        'gs.game_id',
        'g.name as game_name',
      );

      // Group results by source key for O(1) lookup
      const existingMap = new Map();
      for (const row of allExisting) {
        const key = `${row.source_type}:${row.source_id}`;
        if (!existingMap.has(key)) {
          existingMap.set(key, []);
        }
        existingMap.get(key).push({ gameId: row.game_id, name: row.game_name });
      }

      for (const [key, group] of groups) {
        const batchGameIds = group.batchGames.map((g) => g.gameId);
        const hasIntraBatchConflict = batchGameIds.length > 1;

        // Filter out batch games from existing results
        const batchSet = new Set(batchGameIds);
        const existing = (existingMap.get(key) || []).filter((e) => !batchSet.has(e.gameId));

        if (hasIntraBatchConflict || existing.length > 0) {
          const games = [];
          for (const bg of group.batchGames) {
            games.push({ gameId: bg.gameId, name: bg.name });
          }
          for (const e of existing) {
            games.push({ gameId: e.gameId, name: e.name });
          }
          conflicts.push({
            sourceType: group.sourceType,
            sourceId: group.sourceId,
            games,
          });
        }
      }
    }

    res.send(conflicts);
  } catch (err) {
    next(err);
  }
});

// Ids of games that already count as scraped. The batch scraper uses this to skip games
// that were scraped (or given a cover) by hand while the batch was still running.
// Must stay above '/:id'.
router.get('/scraped-ids', async (_req, res, next) => {
  try {
    res.send(await db.getScrapedIds());
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const game = await db.getGameDetail(Number(req.params.id));
    if (!game) {
      return res.status(404).send({ error: 'Game not found' });
    }
    res.send(game);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, library_id, sub_path, cover_path, description } = req.body;
    if (!name || !sub_path) {
      return res.status(400).send({ error: 'name and sub_path are required' });
    }
    if (!library_id && !/^[a-zA-Z]:|^\\/.test(sub_path)) {
      return res
        .status(400)
        .send({ error: 'sub_path must be absolute when library_id is not provided' });
    }

    let dirCreatedAt = null;
    try {
      const fullPath = library_id
        ? path.join(
            (await db.knex('library').where({ id: library_id }).first())?.path || '',
            sub_path,
          )
        : sub_path;
      dirCreatedAt = fs.statSync(fullPath).birthtime;
    } catch {
      // ignore if path not accessible
    }

    const [id] = await db.insertGame({
      name,
      library_id,
      sub_path,
      cover_path,
      description,
      dir_created_at: dirCreatedAt,
    });
    const game = await db.getGameDetail(id);
    res.status(201).send(game);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, cover_path, description } = req.body;
    await db.updateGame(Number(id), { name, cover_path, description });
    const game = await db.getGameDetail(Number(id));
    res.send(game);
  } catch (err) {
    next(err);
  }
});

// Drop-a-cover support for games no configured source carries. The dropped file is
// validated by its content, never by its name, and the stored extension comes from that
// same check - so a renamed executable, or an .svg (which can carry script and would be
// served from our own origin), cannot end up stored as a cover.
router.put('/:id/manual-cover', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { imagePath } = req.body;

    if (!imagePath || typeof imagePath !== 'string' || !fs.existsSync(imagePath)) {
      return res.status(400).send({ error: 'Invalid image path' });
    }

    const image = fs.readFileSync(imagePath);
    const ext = imageExtension(image);
    if (!ext) {
      return res.status(400).send({ error: 'Not a supported image file' });
    }

    const game = await db.getGameDetail(id);
    if (!game) {
      return res.status(404).send({ error: 'Game not found' });
    }

    // cover_path holds the bare file name; the client builds the URL by prefixing
    // /covers/ (see getCoversUrl), and /covers is a static mount. Storing a prefixed
    // path here yields /covers//covers/<name> and a 404.
    const previous = game.cover_path;
    // A bare timestamp collides when two drops land in the same millisecond.
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = `manual_${id}_${stamp}${ext}`;
    fs.writeFileSync(path.join(COVERS_DIR, filename), image);

    await db.updateGame(id, { cover_path: filename });

    // Only a previous manual file is ours to remove: a scraped cover is named after its
    // source and can be shared by several games.
    if (previous && previous !== filename && previous.startsWith('manual_')) {
      try {
        fs.rmSync(path.join(COVERS_DIR, previous), { force: true });
      } catch (err) {
        // The new cover is already in place, so this is untidiness rather than a failure.
        console.warn(`[manual-cover] could not remove old cover ${previous}:`, err.message);
      }
    }

    res.send(await db.getGameDetail(id));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.deleteGame(Number(req.params.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/batch-delete', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).send({ error: 'ids must be an array' });
    }
    await db.batchDeleteGames(ids);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/:id/favorite', async (req, res, next) => {
  try {
    await db.addFavorite(Number(req.params.id));
    res.status(200).send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/favorite', async (req, res, next) => {
  try {
    await db.removeFavorite(Number(req.params.id));
    res.status(200).send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/batch-favorite', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).send({ error: 'ids must be an array' });
    }
    await db.batchAddFavorites(ids);
    res.status(200).send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/batch-unfavorite', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).send({ error: 'ids must be an array' });
    }
    await db.batchRemoveFavorites(ids);
    res.status(200).send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/scan', async (req, res, next) => {
  try {
    const { libraryId } = req.body;
    if (!libraryId) {
      return res.status(400).send({ error: 'libraryId is required' });
    }
    const library = await db.knex('library').where({ id: libraryId }).first();
    if (!library) {
      return res.status(404).send({ error: 'Library not found' });
    }

    const { dirs, archives } = scanDirectory(library.path);
    const blacklist = await getBlacklist();
    const archived = await getArchivedArchives();
    const archivedFolders = await getArchivedFolders();
    const excludeList = [...blacklist, ...archived, ...archivedFolders];
    const excludeSet = new Set(excludeList);
    const filteredDirs = excludeList.length > 0 ? dirs.filter((d) => !excludeSet.has(d)) : dirs;
    const filteredArchives =
      excludeList.length > 0 ? archives.filter((a) => !excludeSet.has(a)) : archives;

    const existingGames = await db
      .knex('game')
      .where({ library_id: libraryId })
      .select('id', 'name', 'sub_path');
    const existingPaths = new Set(existingGames.map((g) => g.sub_path));

    const newDirs = filteredDirs.filter((d) => !existingPaths.has(d));
    const newArchives = filteredArchives.filter((a) => !existingPaths.has(a));

    const allNewEntries = [...newDirs, ...newArchives];
    const dirSet = new Set(filteredDirs);
    const archiveSet = new Set(filteredArchives);
    const allCurrentPaths = new Set([...dirSet, ...archiveSet]);
    const removedGames = existingGames.filter((g) => !allCurrentPaths.has(g.sub_path));

    res.send({
      allDirs: filteredDirs,
      archives: filteredArchives,
      newDirs: allNewEntries,
      removedGames,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/scan/add', async (req, res, next) => {
  try {
    const { libraryId, dirs } = req.body;
    if (!libraryId || !Array.isArray(dirs)) {
      return res.status(400).send({ error: 'libraryId and dirs are required' });
    }

    const library = await db.knex('library').where({ id: libraryId }).first();
    const libPath = library ? library.path : '';

    const rows = dirs.map((d) => {
      let dirCreatedAt = null;
      if (libPath) {
        try {
          const fullPath = path.join(libPath, d);
          dirCreatedAt = fs.statSync(fullPath).birthtime;
        } catch {
          // ignore if path not accessible
        }
      }
      return {
        name: d.includes('/') || d.includes('\\') ? path.basename(d, path.extname(d)) : d,
        library_id: libraryId,
        sub_path: d,
        dir_created_at: dirCreatedAt,
      };
    });

    const inserted = [];
    if (rows.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const ids = await db
          .knex('game')
          .insert(rows.slice(i, i + BATCH_SIZE), ['id', 'name', 'sub_path']);
        inserted.push(...ids);
      }
    }

    res.status(201).send({ added: rows.length, games: inserted });
  } catch (err) {
    next(err);
  }
});

router.post('/scan/expand', async (req, res, next) => {
  try {
    const { libraryId, subPath } = req.body;
    if (!libraryId || !subPath) {
      return res.status(400).send({ error: 'libraryId and subPath are required' });
    }
    const library = await db.knex('library').where({ id: libraryId }).first();
    if (!library) {
      return res.status(404).send({ error: 'Library not found' });
    }

    const fullPath = path.join(library.path, subPath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).send({ error: 'Directory not found' });
    }

    const { dirs, archives, hasSubDirs } = expandDirectory(fullPath);

    const prefixedDirs = dirs.map((d) => subPath + '/' + d);
    const prefixedArchives = archives.map((a) => subPath + '/' + a);

    const allPaths = [...prefixedDirs, ...prefixedArchives];
    const existingRows =
      allPaths.length > 0
        ? await db
            .knex('game')
            .where({ library_id: libraryId })
            .whereIn('sub_path', allPaths)
            .select('sub_path')
        : [];
    const existingPaths = new Set(existingRows.map((r) => r.sub_path));

    res.send({
      dirs: prefixedDirs,
      archives: prefixedArchives,
      hasSubDirs,
      existingPaths: [...existingPaths],
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/relocate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPath, moveFiles, force, compressFiles } = req.body;
    if (!newPath || typeof newPath !== 'string') {
      return res.status(400).send({ error: 'newPath is required' });
    }

    const game = await db
      .knex('game')
      .where({ id: Number(id) })
      .first();
    if (!game) {
      return res.status(404).send({ error: 'Game not found' });
    }

    // Relocate is a per-game singleton. A second one while a task is still running would
    // fight over the same files and the same game row (e.g. re-extracting into the target
    // directory another extraction is still filling). Tasks live in memory, so this state
    // needs no persistence.
    const busyTask = activeTaskForGame(Number(id));
    if (busyTask) {
      return res.status(409).send({
        error: 'A task is already running for this game',
        busy: true,
        busyTaskId: busyTask.id,
        busyTaskType: busyTask.type,
      });
    }

    const normalizePath = (p) => p.replace(/\//g, '\\').replace(/\\+$/, '');
    const normalizedNew = normalizePath(newPath);

    // Path traversal validation
    if (!path.isAbsolute(normalizedNew) || normalizedNew.includes('..')) {
      return res
        .status(400)
        .send({ error: 'Invalid path: must be absolute and cannot contain ..' });
    }

    const currentFullPath = game.library_id
      ? normalizePath(
          (await db.knex('library').where({ id: game.library_id }).first())?.path || '',
        ) +
        '\\' +
        normalizePath(game.sub_path)
      : normalizePath(game.sub_path);

    if (normalizedNew.toLowerCase() === currentFullPath.toLowerCase()) {
      return res.status(400).send({ error: 'New path is the same as current path' });
    }

    let newLibraryId = null;
    let newSubPath = normalizedNew;

    const libraries = await db.getLibraries();
    for (const lib of libraries) {
      const libNorm = normalizePath(lib.path);
      if (normalizedNew.toLowerCase().startsWith(libNorm.toLowerCase() + '\\')) {
        newLibraryId = lib.id;
        newSubPath = normalizedNew.substring(libNorm.length + 1);
        break;
      }
    }

    // Handle compression if requested - check rules first (will skip for archives)
    if (compressFiles) {
      const compressCheck = shouldCompress(currentFullPath);
      if (!compressCheck.compress) {
        return res
          .status(400)
          .send({
            error: `Compression not needed: ${compressCheck.reason}`,
            compressSkipped: true,
            reason: compressCheck.reason,
          });
      }

      // Ensure target has .rar extension
      const destArchive = normalizedNew.toLowerCase().endsWith('.rar')
        ? normalizedNew
        : normalizedNew + '.rar';

      // Check if target archive already exists
      const destExists = fs.existsSync(destArchive);
      if (destExists && !force) {
        return res.status(409).send({ error: 'Target archive already exists', conflict: true });
      }

      const task = createTask('compress', {
        source: currentFullPath,
        dest: destArchive,
        gameId: Number(id),
        sourceDir: currentFullPath,
        destArchive,
        sourceSubPath: game.sub_path,
      });

      void executeCompressTask(
        task.id,
        currentFullPath,
        destArchive,
        Number(id),
        newLibraryId,
        path.basename(destArchive),
        game.sub_path,
      );

      return res.send({ operation: 'compress', taskId: task.id });
    }

    // Archive source: extraction is mandatory when target is directory
    const ext = path.extname(currentFullPath).toLowerCase();
    const isArchive = ARCHIVE_EXTENSIONS.has(ext);

    if (isArchive) {
      const destExists = fs.existsSync(normalizedNew);
      if (destExists) {
        const stat = fs.statSync(normalizedNew);
        if (!stat.isDirectory()) {
          return res.status(400).send({ error: 'Target path exists but is not a directory' });
        }
        const files = fs.readdirSync(normalizedNew);
        if (files.length > 0 && !force) {
          return res
            .status(409)
            .send({ error: 'Target path already exists and is not empty', conflict: true });
        }
      } else {
        fs.mkdirSync(normalizedNew, { recursive: true });
      }

      const task = createTask('extract', {
        source: currentFullPath,
        dest: normalizedNew,
        gameId: Number(id),
        archivePath: currentFullPath,
        archiveSubPath: game.sub_path,
      });

      void executeExtractTask(
        task.id,
        currentFullPath,
        normalizedNew,
        Number(id),
        newLibraryId,
        newSubPath,
      );

      return res.send({ operation: 'extract', taskId: task.id });
    }

    if (!moveFiles) {
      await db.updateGame(Number(id), { library_id: newLibraryId, sub_path: newSubPath });
      const updated = await db.getGameDetail(Number(id));
      return res.send({ ...updated, operation: 'update_only', taskId: null });
    }

    // Handle compression if requested - check rules BEFORE isArchive check
    if (compressFiles) {
      const compressCheck = shouldCompress(currentFullPath);
      if (!compressCheck.compress) {
        return res
          .status(400)
          .send({
            error: `Compression not needed: ${compressCheck.reason}`,
            compressSkipped: true,
            reason: compressCheck.reason,
          });
      }

      // Ensure target has .rar extension
      const destArchive = normalizedNew.toLowerCase().endsWith('.rar')
        ? normalizedNew
        : normalizedNew + '.rar';

      // Check if target archive already exists
      const destExists = fs.existsSync(destArchive);
      if (destExists && !force) {
        return res.status(409).send({ error: 'Target archive already exists', conflict: true });
      }

      const task = createTask('compress', {
        source: currentFullPath,
        dest: destArchive,
        gameId: Number(id),
        sourceDir: currentFullPath,
        destArchive,
        sourceSubPath: game.sub_path,
      });

      void executeCompressTask(
        task.id,
        currentFullPath,
        destArchive,
        Number(id),
        newLibraryId,
        path.basename(destArchive),
        game.sub_path,
      );

      return res.send({ operation: 'compress', taskId: task.id });
    }

    const sourceExists = fs.existsSync(currentFullPath);
    if (!sourceExists) {
      await db.updateGame(Number(id), { library_id: newLibraryId, sub_path: newSubPath });
      const updated = await db.getGameDetail(Number(id));
      return res.send({ ...updated, operation: 'update_only', taskId: null });
    }

    const destExists = fs.existsSync(normalizedNew);
    if (destExists) {
      const files = fs.readdirSync(normalizedNew);
      if (files.length > 0 && !force) {
        return res
          .status(409)
          .send({ error: 'Target path already exists and is not empty', conflict: true });
      }
    }

    const sourceDrive = currentFullPath.substring(0, 1).toLowerCase();
    const destDrive = normalizedNew.substring(0, 1).toLowerCase();
    const sourceDir = path.dirname(currentFullPath).toLowerCase();
    const destDir = path.dirname(normalizedNew).toLowerCase();
    const sameDirectory = sourceDrive === destDrive && sourceDir === destDir;

    if (sameDirectory) {
      const destExists = fs.existsSync(normalizedNew);
      if (destExists) {
        const files = fs.readdirSync(normalizedNew);
        if (files.length > 0 && !force) {
          return res
            .status(409)
            .send({ error: 'Target path already exists and is not empty', conflict: true });
        }
      }
      try {
        await fs.promises.rename(currentFullPath, normalizedNew);
        await db.updateGame(Number(id), { library_id: newLibraryId, sub_path: newSubPath });
        const updated = await db.getGameDetail(Number(id));
        return res.send({ ...updated, operation: 'move', taskId: null });
      } catch (err) {
        return res.status(500).send({ error: `Rename failed: ${err.message}` });
      }
    }

    const task = createTask('move', {
      source: currentFullPath,
      dest: normalizedNew,
      gameId: Number(id),
    });

    void executeMoveTask(
      task.id,
      currentFullPath,
      normalizedNew,
      Number(id),
      newLibraryId,
      newSubPath,
    );

    res.send({ operation: 'move', taskId: task.id });
  } catch (err) {
    next(err);
  }
});

export default router;
