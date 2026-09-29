import * as db from './database/db.js';

/**
 * R18 flagging. Three sources write `game.r18`, in priority order:
 *   vendor  - free and reliable where it exists: the DMM and DLsite scrapers only talk to
 *             those sites' adult sections, so anything they return is R18 outright; Steam
 *             entries here are the all-ages releases. Bangumi carries a per-subject nsfw
 *             flag instead of a per-vendor rule, so it arrives as an explicit value.
 *   ml      - the in-app NSFW classifier (nsfwjs, run in the renderer over the local
 *             covers). Only ever fills in games that are still unknown.
 *   manual  - a later override, not implemented yet.
 *
 * NULL means "unknown", which is exactly what the classifier pass targets. Vendor
 * metadata outranks the model, so a guess never overwrites a vendor decision.
 */

const VENDOR_R18 = { dmm: 1, dlsite: 1, steam: 0 };

export const vendorR18For = (sourceType) =>
  Object.prototype.hasOwnProperty.call(VENDOR_R18, sourceType) ? VENDOR_R18[sourceType] : null;

/**
 * Write the R18 columns for one game at adoption time. `explicitNsfw` is a per-entry flag
 * from vendor metadata (Bangumi's subject nsfw); when it is absent the per-vendor rule
 * applies, and when neither exists the game stays unknown for the classifier pass.
 */
export const applyVendorR18 = async (trx, gameId, sourceType, explicitNsfw) => {
  const r18 = typeof explicitNsfw === 'boolean' ? (explicitNsfw ? 1 : 0) : vendorR18For(sourceType);
  if (r18 === null || r18 === undefined) return false;
  await trx('game').where({ id: gameId }).update({ r18, r18_source: 'vendor' });
  return true;
};

/**
 * Games the NSFW pass still has to look at: no vendor decision yet AND a local cover to
 * classify. A game without a cover cannot be classified from nothing - it stays unknown
 * and keeps its placeholder.
 */
export const getUnknownR18Games = async (limit = 500) =>
  db
    .knex('game')
    .whereNull('r18')
    .whereNotNull('cover_path')
    .where('cover_path', '<>', '')
    .select('id', 'cover_path')
    .limit(limit);

/**
 * Store classifier results from the renderer. Only rows still unknown are written, and
 * unknown games are skipped silently rather than rejected - the client may have raced
 * with an adoption that filled the flag in.
 */
export const storeDetectionResults = async (results) => {
  let updated = 0;
  let skipped = 0;
  const r18Count = results.filter((r) => r.r18 === 1).length;
  const safeCount = results.filter((r) => r.r18 === 0).length;
  console.log(`[r18] storing ${results.length} results (r18=${r18Count}, safe=${safeCount})`);
  await db.knex.transaction(async (trx) => {
    for (const { gameId, r18 } of results) {
      if (!Number.isInteger(gameId) || (r18 !== 0 && r18 !== 1)) {
        skipped++;
        continue;
      }
      const count = await trx('game')
        .where({ id: gameId })
        .whereNull('r18')
        .update({ r18, r18_source: 'ml' });
      updated += count;
    }
  });
  return { updated, skipped };
};
