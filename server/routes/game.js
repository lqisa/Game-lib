import express from 'express';
import * as db from '../database/db.js';
import { scanDirectory } from '../scanner.js';

const getBlacklist = async () => {
  const row = await db.knex('setting').where({ key: 'blacklist' }).first();
  if (!row) return [];
  try {
    return JSON.parse(row.value);
  } catch {
    return [];
  }
};

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const {
      page,
      pageSize,
      keyword,
      libraryIds,
      makerIds,
      genreIds,
      tagIds,
      scraped,
      sortBy,
      sortOrder,
    } = req.query;
    const result = await db.getGames({
      page: page !== undefined ? Number(page) : 1,
      pageSize: pageSize !== undefined ? Number(pageSize) : 50,
      keyword: keyword || '',
      libraryIds: libraryIds ? String(libraryIds).split(',').map(Number) : undefined,
      makerIds: makerIds ? String(makerIds).split(',').map(Number) : undefined,
      genreIds: genreIds ? String(genreIds).split(',').map(Number) : undefined,
      tagIds: tagIds ? String(tagIds).split(',').map(Number) : undefined,
      scraped: scraped === 'true' ? true : scraped === 'false' ? false : undefined,
      sortBy: sortBy || 'updated_at',
      sortOrder: sortOrder || 'desc',
    });
    const blacklist = await getBlacklist();
    if (blacklist.length > 0) {
      const set = new Set(blacklist);
      result.games = result.games.filter((g) => !set.has(g.sub_path));
      result.total = result.games.length;
    }
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
    if (blacklist.length > 0) {
      const set = new Set(blacklist);
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
    for (const [, group] of groups) {
      const batchGameIds = group.batchGames.map((g) => g.gameId);
      const hasIntraBatchConflict = batchGameIds.length > 1;

      // Query database for other games already using this source
      const existing = await db
        .knex('game_source as gs')
        .join('game as g', 'g.id', 'gs.game_id')
        .where({ 'gs.source_type': group.sourceType, 'gs.source_id': group.sourceId })
        .whereNotIn('gs.game_id', batchGameIds)
        .select('gs.game_id', 'g.name as game_name');

      if (hasIntraBatchConflict || existing.length > 0) {
        const games = [];
        for (const bg of group.batchGames) {
          games.push({ gameId: bg.gameId, name: bg.name });
        }
        for (const r of existing) {
          games.push({ gameId: r.game_id, name: r.game_name });
        }
        conflicts.push({
          sourceType: group.sourceType,
          sourceId: group.sourceId,
          games,
        });
      }
    }

    res.send(conflicts);
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
    if (!name || !library_id || !sub_path) {
      return res.status(400).send({ error: 'name, library_id, sub_path are required' });
    }
    const [id] = await db.insertGame({ name, library_id, sub_path, cover_path, description });
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

    const allDirs = scanDirectory(library.path);
    const blacklist = await getBlacklist();
    const filteredDirs = blacklist.length > 0
      ? allDirs.filter((d) => !new Set(blacklist).has(d))
      : allDirs;

    const existingGames = await db
      .knex('game')
      .where({ library_id: libraryId })
      .select('id', 'name', 'sub_path');
    const existingPaths = new Set(existingGames.map((g) => g.sub_path));

    const newDirs = filteredDirs.filter((d) => !existingPaths.has(d));

    const dirSet = new Set(filteredDirs);
    const removedGames = existingGames.filter((g) => !dirSet.has(g.sub_path));

    res.send({ allDirs: filteredDirs, newDirs, removedGames });
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

    const rows = dirs.map((d) => ({
      name: d,
      library_id: libraryId,
      sub_path: d,
    }));

    if (rows.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await db.knex('game').insert(rows.slice(i, i + BATCH_SIZE));
      }
    }

    res.status(201).send({ added: rows.length });
  } catch (err) {
    next(err);
  }
});

export default router;