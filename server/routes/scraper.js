import express from 'express';
import * as db from '../database/db.js';
import { triggerSimilarScan } from '../similar-classifier.js';
import { searchDLSite, searchDLSiteDetailed, fetchDLSiteDetail } from '../scraper/dlsite.js';
import { searchBangumi, fetchBangumiDetail } from '../scraper/bangumi.js';
import { searchVNDB, fetchVNDBDetail } from '../scraper/vndb.js';
import { searchSteam, fetchSteamDetail } from '../scraper/steam.js';
import { searchDMM, fetchDMMDetail } from '../scraper/dmm.js';
import { checkExit } from '../scraper/region-check.js';
import { downloadCover } from '../scraper/cover.js';
import { applyVendorR18 } from '../r18.js';
import {
  bestMatch,
  detectLanguage,
  SOURCE_TYPES,
  DEFAULT_MATCH_PRIORITY,
  DEFAULT_MATCH_THRESHOLD,
} from '../scraper/match.js';

const router = express.Router();

const getBangumiToken = async () => {
  return (await db.getSetting('bangumi_token')) || '';
};

// Defaults live in scraper/match.js so the migration seed, this fallback and the
// Settings page cannot drift apart.

/**
 * Source priority + similarity threshold for a detected language.
 * Stored in `setting` so it is tunable from the Settings page.
 */
const getMatchConfig = async (lang) => {
  const [priorityRaw, thresholdRaw] = await Promise.all([
    db.getSetting(`match_priority_${lang}`),
    db.getSetting('match_threshold'),
  ]);

  let priority = DEFAULT_MATCH_PRIORITY[lang] || DEFAULT_MATCH_PRIORITY.ja;
  if (priorityRaw) {
    try {
      const parsed = JSON.parse(priorityRaw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((s) => SOURCE_TYPES.includes(s));
        if (valid.length > 0) priority = valid;
      }
    } catch {
      /* malformed value: keep the default */
    }
  }

  const threshold = Number(thresholdRaw);
  return {
    priority,
    threshold:
      Number.isFinite(threshold) && threshold > 0 && threshold <= 1
        ? threshold
        : DEFAULT_MATCH_THRESHOLD,
  };
};

const searchBySource = async (source, keyword, token) => {
  if (source === 'dlsite') return searchDLSite(keyword);
  if (source === 'dmm') return searchDMM(keyword);
  if (source === 'bangumi') return searchBangumi(keyword, token);
  if (source === 'vndb') return searchVNDB(keyword);
  if (source === 'steam') return searchSteam(keyword);
  return [];
};

// DMM is the only source that can fail for a reason the user has to act on
// (its pages are region-gated, so a non-Japanese proxy exit silently loses data).
// Surface those as a distinct, actionable response instead of a generic 500.
const sendDmmError = (err, res, next) => {
  if (err?.code === 'DMM_REGION_BLOCKED' || err?.code === 'DMM_SELECTOR_MISSING') {
    return res.status(503).send({ error: err.message, code: err.code });
  }
  next(err);
};

router.post('/dlsite/search', async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' });
    }
    // The region notice is returned alongside the results: DLsite filters some works
    // by IP without saying so, and this is the only place the UI can learn about it.
    const { results, region } = await searchDLSiteDetailed(keyword);
    res.send({ results, region });
  } catch (err) {
    next(err);
  }
});

/**
 * Report the network exit as seen by the sources.
 *
 * Deliberately its own endpoint so the UI can check the proxy on demand (settings page,
 * or when a search comes back empty) without running a real search. DLsite reports the
 * country on every response; DMM has no such header, so its exit is probed by whether
 * a known page is reachable.
 */
router.get('/region', async (_req, res, next) => {
  try {
    res.send(await checkExit());
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
    // A not-found product is ambiguous (absent vs region-filtered); pass the region
    // hint through so the UI can say which one to check.
    if (err?.code === 'DLSITE_NOT_FOUND') {
      return res
        .status(404)
        .send({ error: err.message, code: err.code, region: err.region || null });
    }
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
    console.error('[bangumi/search]', err.response?.status, err.response?.data || err.message);
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
    console.error('[bangumi/fetch]', err.response?.status, err.response?.data || err.message);
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

router.post('/steam/search', async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' });
    }
    const results = await searchSteam(keyword);
    res.send({ results });
  } catch (err) {
    next(err);
  }
});

router.post('/steam/fetch', async (req, res, next) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).send({ error: 'id is required' });
    }
    const detail = await fetchSteamDetail(id);
    if (!detail) {
      return res.status(404).send({ error: 'detail not found' });
    }
    res.send(detail);
  } catch (err) {
    next(err);
  }
});

router.post('/dmm/search', async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' });
    }
    const results = await searchDMM(keyword);
    res.send({ results });
  } catch (err) {
    console.error('[dmm/search]', err.code || err.message);
    sendDmmError(err, res, next);
  }
});

router.post('/dmm/fetch', async (req, res, next) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).send({ error: 'id is required' });
    }
    const detail = await fetchDMMDetail(id);
    if (!detail) {
      return res.status(404).send({ error: 'detail not found' });
    }
    res.send(detail);
  } catch (err) {
    console.error('[dmm/fetch]', err.code || err.message);
    sendDmmError(err, res, next);
  }
});

router.post('/auto/search', async (req, res, next) => {
  try {
    const { keyword, name } = req.body;
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' });
    }
    const searchName = name || keyword;
    const language = detectLanguage(searchName);
    const { priority, threshold } = await getMatchConfig(language);
    const token = await getBangumiToken();

    // Sources are tried one at a time, in the configured priority order for this
    // language. The first source that produces a result scoring at or above the
    // threshold wins; if none does we still return the first non-empty result list
    // so the user can pick a match by hand.
    let fallback = null;

    for (const source of priority) {
      let results = [];
      try {
        results = await searchBySource(source, keyword, token);
      } catch (err) {
        // A source failing must not abort the whole search, but it must not vanish
        // either - a silently skipped source looks identical to "no results".
        console.warn(`[auto/search] source "${source}" failed:`, err.code || err.message);
        continue;
      }
      if (!Array.isArray(results) || results.length === 0) continue;

      if (!fallback) fallback = { source, results };

      const match = bestMatch(searchName, results, threshold);
      if (match) {
        return res.send({
          source,
          results,
          matched: match.result,
          score: match.score,
          reason: match.reason,
          language,
          threshold,
        });
      }
    }

    res.send({
      source: fallback ? fallback.source : null,
      results: fallback ? fallback.results : [],
      matched: null,
      language,
      threshold,
    });
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

const adoptOne = async (data, trx, predownloadedCover) => {
  const { gameId, sourceType, sourceId, sourceUrl, name, makers, genres, tags, description } = data;

  const coverPath =
    predownloadedCover !== undefined
      ? predownloadedCover
      : await downloadCover(data.coverUrl, sourceType, sourceId);

  const d = trx || db.knex;
  await d('game')
    .where({ id: gameId })
    .update({ description, cover_path: coverPath, updated_at: db.knex.fn.now() });
  // Vendor metadata decides R18 at adoption time where it can; everything else stays
  // unknown for the classifier pass.
  await applyVendorR18(d, gameId, sourceType, data.nsfw);

  await d('game_source').where({ game_id: gameId }).del();

  await d('game_source')
    .insert({
      game_id: gameId,
      source_type: sourceType,
      source_id: sourceId,
      source_url: sourceUrl || null,
      name: name || null,
      // Keep the cover URL so a cover that failed to download can be retried later
      // without scraping the whole entry again (see routes/cover.js).
      raw_data: JSON.stringify({ coverUrl: data.coverUrl || null }),
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
    const coverPath = await downloadCover(req.body.coverUrl, sourceType, sourceId);
    await db.knex.transaction(async (trx) => {
      await adoptOne(req.body, trx, coverPath);
    });
    const game = await db.getGameDetail(gameId);
    res.send(game);
    triggerSimilarScan();
  } catch (err) {
    next(err);
  }
});

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

    const COVER_CONCURRENCY = 10;
    const coverLimit = pLimit(COVER_CONCURRENCY);

    const coverResults = await Promise.all(
      games.map((game) =>
        coverLimit(async () => {
          if (!game.gameId || !game.sourceType || !game.sourceId) {
            return {
              gameId: game.gameId || null,
              coverPath: null,
              error: 'gameId, sourceType, sourceId required',
            };
          }
          try {
            const coverPath = await downloadCover(game.coverUrl, game.sourceType, game.sourceId);
            return { gameId: game.gameId, coverPath, error: null };
          } catch (err) {
            return { gameId: game.gameId, coverPath: null, error: err.message };
          }
        }),
      ),
    );

    const coverMap = new Map(coverResults.map((r) => [r.gameId, r]));

    const DB_CONCURRENCY = 3;
    const dbLimit = pLimit(DB_CONCURRENCY);

    const results = await Promise.all(
      games.map((game) =>
        dbLimit(async () => {
          const { gameId, sourceType, sourceId } = game;
          const coverResult = coverMap.get(gameId);

          if (!gameId || !sourceType || !sourceId) {
            return {
              gameId: gameId || null,
              success: false,
              error: 'gameId, sourceType, sourceId required',
            };
          }
          if (coverResult?.error === 'gameId, sourceType, sourceId required') {
            return { gameId, success: false, error: coverResult.error };
          }

          try {
            await db.knex.transaction(async (trx) => {
              const coverPath = coverResult?.coverPath || null;
              const { sourceUrl, name, makers, genres, tags, description } = game;

              await trx('game')
                .where({ id: gameId })
                .update({ description, cover_path: coverPath, updated_at: db.knex.fn.now() });

              await trx('game_source').where({ game_id: gameId }).del();

              await trx('game_source')
                .insert({
                  game_id: gameId,
                  source_type: sourceType,
                  source_id: sourceId,
                  source_url: sourceUrl || null,
                  name: name || null,
                  // Same as the single-adopt path: keep the cover URL so a download that
                  // failed (network, app closed mid-run) can be retried later without
                  // re-scraping. This matters most for DMM, whose cover path cannot be
                  // rebuilt from the id alone.
                  raw_data: JSON.stringify({ coverUrl: game.coverUrl || null }),
                })
                .onConflict(['game_id', 'source_type', 'source_id'])
                .merge(['source_url', 'name', 'raw_data']);

              if (Array.isArray(makers) && makers.length > 0) {
                const makerIds = await insertMakersTrx(makers, trx);
                await trx('game_maker').where({ game_id: gameId }).del();
                if (makerIds.length > 0) {
                  await trx('game_maker').insert(
                    makerIds.map((m) => ({ game_id: gameId, maker_id: m })),
                  );
                }
              }

              if (Array.isArray(genres) && genres.length > 0) {
                const genreIds = await insertNamesTrx('genre', genres, trx);
                await trx('game_genre').where({ game_id: gameId }).del();
                if (genreIds.length > 0) {
                  await trx('game_genre').insert(
                    genreIds.map((g) => ({ game_id: gameId, genre_id: g })),
                  );
                }
              }

              if (Array.isArray(tags) && tags.length > 0) {
                const tagIds = await insertNamesTrx('tag', tags, trx);
                await trx('game_tag').where({ game_id: gameId }).del();
                if (tagIds.length > 0) {
                  await trx('game_tag').insert(tagIds.map((t) => ({ game_id: gameId, tag_id: t })));
                }
              }
            });
            return { gameId, success: true };
          } catch (err) {
            return { gameId, success: false, error: err.message };
          }
        }),
      ),
    );

    res.send({ results });
    triggerSimilarScan();
  } catch (err) {
    next(err);
  }
});

export default router;
