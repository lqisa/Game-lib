import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import axios from 'axios';
import * as db from '../database/db.js';
import { searchDLSite, fetchDLSiteDetail } from '../scraper/dlsite.js';
import { searchBangumi, fetchBangumiDetail } from '../scraper/bangumi.js';
import { searchVNDB, fetchVNDBDetail } from '../scraper/vndb.js';
import { getDataDir } from '../config.js';

const router = express.Router();

const COVERS_DIR = path.join(getDataDir(), 'covers');

if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}

const getBangumiToken = async () => {
  return (await db.getSetting('bangumi_token')) || '';
};

router.post('/dlsite/search', async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' });
    }
    const results = await searchDLSite(keyword);
    res.send({ results });
  } catch (err) {
    next(err);
  }
});

router.post('/dlsite/fetch', async (req, res, next) => {
  try {
    const code = req.body.rjcode || req.body.id;
    if (!code) {
      return res.status(400).send({ error: 'rjcode or id is required' });
    }
    const detail = await fetchDLSiteDetail(code);
    res.send(detail);
  } catch (err) {
    next(err);
  }
});

router.post('/bangumi/search', async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' });
    }
    const token = await getBangumiToken();
    const results = await searchBangumi(keyword, token);
    res.send({ results });
  } catch (err) {
    next(err);
  }
});

router.post('/bangumi/fetch', async (req, res, next) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).send({ error: 'id is required' });
    }
    const token = await getBangumiToken();
    const detail = await fetchBangumiDetail(id, token);
    if (!detail) {
      return res.status(404).send({ error: 'detail not found' });
    }
    res.send(detail);
  } catch (err) {
    next(err);
  }
});

router.post('/vndb/search', async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' });
    }
    const results = await searchVNDB(keyword);
    res.send({ results });
  } catch (err) {
    next(err);
  }
});

router.post('/vndb/fetch', async (req, res, next) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).send({ error: 'id is required' });
    }
    const detail = await fetchVNDBDetail(id);
    if (!detail) {
      return res.status(404).send({ error: 'detail not found' });
    }
    res.send(detail);
  } catch (err) {
    next(err);
  }
});

router.post('/auto/search', async (req, res, next) => {
  try {
    const { keyword, name } = req.body;
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' });
    }
    const searchName = name || keyword;
    const hasRJ = /RJ\d+/.test(searchName);
    const letterCount = (searchName.match(/[a-zA-Z]/g) || []).length;
    const isMostlyEnglish = searchName.length > 0 && letterCount / searchName.length >= 0.9;
    const sources = hasRJ
      ? ['dlsite', 'bangumi', 'vndb']
      : isMostlyEnglish
        ? ['vndb', 'bangumi', 'dlsite']
        : ['bangumi', 'dlsite', 'vndb'];

    const token = await getBangumiToken();

    for (const source of sources) {
      try {
        let results = [];
        if (source === 'dlsite') {
          results = await searchDLSite(keyword);
        } else if (source === 'bangumi') {
          results = await searchBangumi(keyword, token);
        } else if (source === 'vndb') {
          results = await searchVNDB(keyword);
        }
        if (results.length > 0) {
          return res.send({ source, results });
        }
      } catch {
        continue;
      }
    }

    res.send({ source: null, results: [] });
  } catch (err) {
    next(err);
  }
});

router.post('/dlsite/batch', async (req, res, next) => {
  try {
    const { games } = req.body;
    if (!Array.isArray(games)) {
      return res.status(400).send({ error: 'games is required' });
    }
    const results = [];
    for (const game of games) {
      try {
        const keyword = game.keyword || game.name;
        const searchResults = await searchDLSite(keyword);
        if (searchResults.length > 0) {
          const detail = await fetchDLSiteDetail(searchResults[0].rjcode);
          results.push({ gameId: game.id, success: true, data: detail });
        } else {
          results.push({ gameId: game.id, success: false, error: 'not found' });
        }
      } catch (err) {
        results.push({ gameId: game.id, success: false, error: err.message });
      }
    }
    res.send(results);
  } catch (err) {
    next(err);
  }
});

const downloadCover = async (coverUrl, sourceType, sourceId) => {
  if (!coverUrl) return null;
  try {
    const ext = coverUrl.match(/\.(jpg|jpeg|png|webp)/)?.[1] || 'jpg';
    const filename = `${sourceType}_${sourceId}.${ext}`;
    const filePath = path.join(COVERS_DIR, filename);
    const response = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 15000 });
    fs.writeFileSync(filePath, response.data);
    return filename;
  } catch (err) {
    console.error('cover download failed:', err.message);
    return null;
  }
};

const adoptOne = async (data, trx) => {
  const {
    gameId,
    sourceType,
    sourceId,
    sourceUrl,
    name,
    coverUrl,
    makers,
    genres,
    tags,
    description,
  } = data;

  const coverPath = await downloadCover(coverUrl, sourceType, sourceId);

  const d = trx || db.knex;
  await d('game')
    .where({ id: gameId })
    .update({ description, cover_path: coverPath, updated_at: db.knex.fn.now() });

  await d('game_source')
    .insert({
      game_id: gameId,
      source_type: sourceType,
      source_id: sourceId,
      source_url: sourceUrl || null,
      name: name || null,
      raw_data: null,
    })
    .onConflict(['game_id', 'source_type', 'source_id'])
    .merge(['source_url', 'name', 'raw_data']);

  if (Array.isArray(makers) && makers.length > 0) {
    const makerIds = await insertMakersTrx(makers, d);
    await d('game_maker').where({ game_id: gameId }).del();
    if (makerIds.length > 0) {
      await d('game_maker').insert(makerIds.map((m) => ({ game_id: gameId, maker_id: m })));
    }
  }

  if (Array.isArray(genres) && genres.length > 0) {
    const genreIds = await insertNamesTrx('genre', genres, d);
    await d('game_genre').where({ game_id: gameId }).del();
    if (genreIds.length > 0) {
      await d('game_genre').insert(genreIds.map((g) => ({ game_id: gameId, genre_id: g })));
    }
  }

  if (Array.isArray(tags) && tags.length > 0) {
    const tagIds = await insertNamesTrx('tag', tags, d);
    await d('game_tag').where({ game_id: gameId }).del();
    if (tagIds.length > 0) {
      await d('game_tag').insert(tagIds.map((t) => ({ game_id: gameId, tag_id: t })));
    }
  }
};

const insertMakersTrx = async (names, d) => {
  if (names.length === 0) return [];
  const existing = await d('maker').whereIn('name', names).select('id', 'name');
  const existingMap = new Map(existing.map((r) => [r.name, r.id]));
  const newNames = names.filter((n) => !existingMap.has(n));
  if (newNames.length > 0) {
    const rows = await d('maker').insert(
      newNames.map((name) => ({ name })),
      ['id', 'name'],
    );
    for (const row of rows) existingMap.set(row.name, row.id);
  }
  return names.map((n) => existingMap.get(n));
};

const insertNamesTrx = async (table, names, d) => {
  if (names.length === 0) return [];
  const existing = await d(table).whereIn('name', names).select('id', 'name');
  const existingMap = new Map(existing.map((r) => [r.name, r.id]));
  const newNames = names.filter((n) => !existingMap.has(n));
  if (newNames.length > 0) {
    const rows = await d(table).insert(
      newNames.map((name) => ({ name })),
      ['id', 'name'],
    );
    for (const row of rows) existingMap.set(row.name, row.id);
  }
  return names.map((n) => existingMap.get(n));
};

router.post('/adopt', async (req, res, next) => {
  try {
    const { gameId, sourceType, sourceId } = req.body;
    if (!gameId || !sourceType || !sourceId) {
      return res.status(400).send({ error: 'gameId, sourceType, sourceId required' });
    }
    await db.knex.transaction(async (trx) => {
      await adoptOne(req.body, trx);
    });
    const game = await db.getGameDetail(gameId);
    res.send(game);
  } catch (err) {
    next(err);
  }
});

const CONCURRENCY = 5;

const pLimit = (concurrency) => {
  let running = 0;
  const queue = [];
  const next = () => {
    if (queue.length === 0 || running >= concurrency) return;
    running++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        running--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

router.post('/adopt/batch', async (req, res, next) => {
  try {
    const { games } = req.body;
    if (!Array.isArray(games)) {
      return res.status(400).send({ error: 'games is required' });
    }
    const limit = pLimit(CONCURRENCY);
    const results = await Promise.all(
      games.map((game) =>
        limit(async () => {
          const { gameId, sourceType, sourceId } = game;
          if (!gameId || !sourceType || !sourceId) {
            return {
              gameId: gameId || null,
              success: false,
              error: 'gameId, sourceType, sourceId required',
            };
          }
          try {
            await db.knex.transaction(async (trx) => {
              await adoptOne(game, trx);
            });
            return { gameId, success: true };
          } catch (err) {
            return { gameId, success: false, error: err.message };
          }
        }),
      ),
    );
    res.send({ results });
  } catch (err) {
    next(err);
  }
});

export default router;