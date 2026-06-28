import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import axios from 'axios';
import * as db from '../database/db.js';
import { getDataDir } from '../config.js';

const router = express.Router();

const COVERS_DIR = path.join(getDataDir(), 'covers');

if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}

const downloadCover = async (coverUrl, source, sourceId) => {
  if (!coverUrl) return null;
  try {
    const ext = coverUrl.match(/\.(jpg|jpeg|png|webp)/)?.[1] || 'jpg';
    const filename = `search_${source}_${sourceId}.${ext}`;
    const filePath = path.join(COVERS_DIR, filename);
    if (fs.existsSync(filePath)) return `/covers/${filename}`;
    const response = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 15000 });
    fs.writeFileSync(filePath, response.data);
    return `/covers/${filename}`;
  } catch (err) {
    console.error('search cover download failed:', err.message);
    return null;
  }
};

const processResultsCovers = async (results, source) => {
  const processed = [];
  for (const r of results) {
    const localCover = await downloadCover(r.coverUrl, source, r.id);
    processed.push({ ...r, coverUrl: localCover || r.coverUrl });
  }
  return processed;
};

router.get('/search', async (req, res, next) => {
  try {
    const { key } = req.query;
    if (!key) {
      return res.status(400).send({ error: 'key is required' });
    }
    const cached = await db.getSearchCache(key);
    if (!cached) {
      return res.send({ hit: false });
    }
    res.send({ hit: true, data: cached });
  } catch (err) {
    next(err);
  }
});

router.post('/search', async (req, res, next) => {
  try {
    const { key, source, keyword, results } = req.body;
    if (!key || !source || !keyword || !results) {
      return res.status(400).send({ error: 'key, source, keyword, results are required' });
    }
    const processedResults = await processResultsCovers(results, source);
    await db.setSearchCache({ key, source, keyword, results: processedResults });
    res.send({ ok: true, results: processedResults });
  } catch (err) {
    next(err);
  }
});

router.post('/search/batch', async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).send({ error: 'items array is required' });
    }
    const processedItems = [];
    for (const item of items) {
      const processedResults = await processResultsCovers(item.results, item.source);
      processedItems.push({ ...item, results: processedResults });
    }
    await db.batchSetSearchCache(processedItems);
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/search', async (req, res, next) => {
  try {
    const { keys } = req.query;
    if (!keys) {
      return res.status(400).send({ error: 'keys is required' });
    }
    const keyArray = String(keys).split(',');
    await db.deleteSearchCache(keyArray);
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/search/preload', async (req, res, next) => {
  try {
    const { keywords } = req.body;
    if (!Array.isArray(keywords)) {
      return res.status(400).send({ error: 'keywords array is required' });
    }
    const entries = await db.getSearchCacheByKeywords(keywords);
    res.send({ entries });
  } catch (err) {
    next(err);
  }
});

router.get('/adopt', async (req, res, next) => {
  try {
    const { gameIds, libraryId, subPaths } = req.query;
    const gameIdList = gameIds ? String(gameIds).split(',').map(Number).filter((n) => !isNaN(n) && n > 0) : [];
    const subPathList = subPaths ? String(subPaths).split(',') : [];
    const libId = libraryId ? Number(libraryId) : 0;

    if (gameIdList.length === 0 && subPathList.length === 0) {
      return res.send({ entries: [] });
    }

    const subPathEntries = libId > 0 ? subPathList.map((sp) => ({ libraryId: libId, subPath: sp })) : [];
    const entries = await db.getAdoptCacheMixed(gameIdList, subPathEntries);
    res.send({ entries });
  } catch (err) {
    next(err);
  }
});

router.post('/adopt', async (req, res, next) => {
  try {
    const { gameId, libraryId, subPath, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description } = req.body;
    if (!sourceType || !sourceId) {
      return res.status(400).send({ error: 'sourceType, sourceId are required' });
    }
    if (!gameId && !libraryId && !subPath) {
      return res.status(400).send({ error: 'gameId or libraryId + subPath is required' });
    }
    await db.setAdoptCache({ gameId, libraryId, subPath, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description });
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/adopt/migrate', async (req, res, next) => {
  try {
    const { libraryId, subPathToGameId } = req.body;
    if (!libraryId || !subPathToGameId || typeof subPathToGameId !== 'object') {
      return res.status(400).send({ error: 'libraryId and subPathToGameId are required' });
    }
    await db.migrateAdoptCacheGameId(libraryId, subPathToGameId);
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/adopt/batch', async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).send({ error: 'items array is required' });
    }
    await db.batchSetAdoptCache(items);
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/adopt', async (req, res, next) => {
  try {
    const { gameIds, libraryId, subPaths } = req.query;
    const gameIdList = gameIds ? String(gameIds).split(',').map(Number).filter((n) => !isNaN(n) && n > 0) : [];
    const subPathList = subPaths ? String(subPaths).split(',') : [];
    const libId = libraryId ? Number(libraryId) : 0;

    if (gameIdList.length === 0 && subPathList.length === 0) {
      return res.send({ ok: true });
    }

    const subPathEntries = libId > 0 ? subPathList.map((sp) => ({ libraryId: libId, subPath: sp })) : [];
    await db.deleteAdoptCacheMixed(gameIdList, subPathEntries);
    res.send({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;