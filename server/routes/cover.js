import express from 'express';
import * as db from '../database/db.js';
import {
  coverExists,
  downloadCover,
  resolveCoverUrl,
  fetchCoverUrlFromSource,
  DETAIL_FETCH_SOURCES,
} from '../scraper/cover.js';

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

/**
 * Re-download covers that are missing on disk, so a cover lost to a network failure or to the
 * app being closed mid-scrape heals itself instead of needing a manual re-scrape.
 *
 * body: { gameIds?: number[], limit?: number }
 *   gameIds - check only these games (the ones the list is showing). Omit to scan for games
 *             that have no cover_path at all.
 *   limit   - how many covers to download in this call (default 8, max 30).
 *
 * returns { repaired: [{gameId, coverPath}], missing, attempted, hopelessIds, noSource }
 *   noSource    - ids from the request with no game_source row. Nothing can be resolved for them,
 *                 so this is said per game: a request-level counter cannot tell "nothing to go on"
 *                 from "the download failed", which left callers asking about the same game on
 *                 every list load.
 *   hopelessIds - ids whose source offers nothing to derive a URL from and nothing to re-read.
 *                 Also per game, and deliberately narrow: anything that might work on a later pass
 *                 stays out, so a caller crossing these off cannot lose a repairable game.
 */
router.post('/repair', async (req, res, next) => {
  try {
    const limit = Math.min(30, Math.max(1, Number(req.body?.limit) || 8));
    const requestedIds = Array.isArray(req.body?.gameIds)
      ? req.body.gameIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : null;

    if (requestedIds && requestedIds.length === 0) {
      return res.send({ repaired: [], missing: 0, attempted: 0, hopelessIds: [], noSource: [] });
    }

    // LEFT JOIN, not JOIN: a game that was never scraped has no row to join to, and it still
    // has to come back - it is exactly the case the caller has to be told apart.
    let query = db
      .knex('game as g')
      .leftJoin('game_source as gs', 'gs.game_id', 'g.id')
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

    const sourcedIds = new Set(rows.filter((row) => row.sourceType).map((row) => row.gameId));
    const noSource = requestedIds
      ? requestedIds.filter((id) => !sourcedIds.has(id))
      : [...new Set(rows.filter((row) => !row.sourceType).map((row) => row.gameId))];

    // Only rows whose file is actually absent need work, and only a row with a source can
    // have one: re-reading a source-less game is a network call that can never produce a cover.
    const repairable = rows.filter((row) => row.sourceType && !coverExists(row.coverPath));

    // One entry per game. Several sources are alternatives for the same cover, so treating them as
    // separate rows downloaded the same file twice in parallel and let the loser write last. A row
    // that can build its URL without a network read is preferred, so picking one source does not
    // lock the game to a vendor whose URL is dead.
    const byGame = new Map();
    for (const row of repairable) {
      const kept = byGame.get(row.gameId);
      if (!kept) {
        byGame.set(row.gameId, row);
        continue;
      }
      const keptResolves = resolveCoverUrl(kept.sourceType, kept.sourceId, kept.rawData);
      if (!keptResolves && resolveCoverUrl(row.sourceType, row.sourceId, row.rawData)) {
        byGame.set(row.gameId, row);
      }
    }
    const candidates = [...byGame.values()];
    const batch = candidates.filter((row) => !recentlyFailed(row.gameId)).slice(0, limit);

    let detailFetchesLeft = MAX_DETAIL_FETCHES;
    const hopelessIds = [];
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
        recentFailures.set(row.gameId, Date.now());
        // Only say "this can never be resolved" when that is actually what happened: the source has
        // no URL to derive and no entry that could be re-read. A failed download, a failed re-read
        // and a row that never got its turn at the detail quota can all work next time, and calling
        // those hopeless would make the caller cross them off for good.
        if (!recorded && !DETAIL_FETCH_SOURCES.has(row.sourceType)) hopelessIds.push(row.gameId);
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

    res.send({ repaired, missing, attempted: batch.length, hopelessIds, noSource });
  } catch (err) {
    next(err);
  }
});

export default router;
