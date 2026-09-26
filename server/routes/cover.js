import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import * as db from '../database/db.js';
import { COVERS_DIR, coverExists, downloadCover, resolveCoverUrl, fetchCoverUrlFromSource } from '../scraper/cover.js';

const router = express.Router();

// Covers that genuinely do not exist on the source would otherwise be retried on every list
// load. Remember recent failures for a while so we do not hammer the sources.
const recentFailures = new Map();
const FAILURE_TTL = 10 * 60 * 1000;

// Re-reading an entry from the source costs a network call, so only a few per repair call.
const MAX_DETAIL_FETCHES = 3;

const recentlyFailed = (gameId) => {
  const at = recentFailures.get(gameId);
  if (!at) return false;
  if (Date.now() - at > FAILURE_TTL) {
    recentFailures.delete(gameId);
    return false;
  }
  return true;
};

const mapWithConcurrency = async (items, concurrency, worker) => {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
};

router.get('/:filename', (req, res) => {
  const filePath = path.join(COVERS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send({ error: 'Cover not found' });
  }
  res.sendFile(filePath);
});

/**
 * Re-download covers that are missing on disk, so a cover lost to a network failure or to the
 * app being closed mid-scrape heals itself instead of needing a manual re-scrape.
 *
 * body: { gameIds?: number[], limit?: number }
 *   gameIds - check only these games (the ones the list is showing). Omit to scan for games
 *             that have no cover_path at all.
 *   limit   - how many covers to download in this call (default 8, max 30).
 *
 * returns { repaired: [{gameId, coverPath}], missing, attempted, unresolvable }
 */
router.post('/repair', async (req, res, next) => {
  try {
    const limit = Math.min(30, Math.max(1, Number(req.body?.limit) || 8));
    const requestedIds = Array.isArray(req.body?.gameIds)
      ? req.body.gameIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : null;

    if (requestedIds && requestedIds.length === 0) {
      return res.send({ repaired: [], missing: 0, attempted: 0, unresolvable: 0 });
    }

    let query = db.knex('game as g')
      .join('game_source as gs', 'gs.game_id', 'g.id')
      .select(
        'g.id as gameId',
        'g.cover_path as coverPath',
        'gs.source_type as sourceType',
        'gs.source_id as sourceId',
        'gs.raw_data as rawData',
      );

    if (requestedIds) {
      query = query.whereIn('g.id', requestedIds);
    } else {
      query = query.where((qb) => qb.whereNull('g.cover_path').orWhere('g.cover_path', ''));
    }

    const rows = await query;

    // Only rows whose file is actually absent need work, and skip ones we failed on recently.
    const candidates = rows.filter((row) => !coverExists(row.coverPath));
    const batch = candidates.filter((row) => !recentlyFailed(row.gameId)).slice(0, limit);

    let detailFetchesLeft = MAX_DETAIL_FETCHES;
    let unresolvable = 0;
    const bangumiToken = (await db.getSetting('bangumi_token')) || '';

    const results = await mapWithConcurrency(batch, 3, async (row) => {
      // Cheap first: a URL recorded at adopt time, or the deterministic DLsite one.
      const recorded = resolveCoverUrl(row.sourceType, row.sourceId, row.rawData);
      let coverPath = recorded ? await downloadCover(recorded, row.sourceType, row.sourceId) : null;

      // A recorded URL can be dead - the work moved, the path went stale, or the host now
      // answers an error page (which downloadCover rejects). Re-reading the entry is the
      // only way such a row ever heals, so this runs after a *failed download* too, not
      // just when no URL was recorded at all. Without it a row with a stale URL would
      // retry the same dead URL forever and never recover.
      if (!coverPath && detailFetchesLeft > 0) {
        detailFetchesLeft -= 1;
        const fresh = await fetchCoverUrlFromSource(row.sourceType, row.sourceId, bangumiToken);
        if (fresh && fresh !== recorded) {
          coverPath = await downloadCover(fresh, row.sourceType, row.sourceId);
        }
      }

      if (!coverPath) {
        // "No URL anywhere" is genuinely unresolvable; a failed download is just a failure.
        if (!recorded) unresolvable += 1;
        recentFailures.set(row.gameId, Date.now());
        return null;
      }
      await db.knex('game').where({ id: row.gameId }).update({ cover_path: coverPath });
      return { gameId: row.gameId, coverPath };
    });

    const repaired = results.filter(Boolean);
    const missing = candidates.length - repaired.length;

    if (repaired.length > 0) {
      console.log(` * Repaired ${repaired.length} cover(s)`);
    }

    res.send({ repaired, missing, attempted: batch.length, unresolvable });
  } catch (err) {
    next(err);
  }
});

export default router;
