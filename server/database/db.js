import path from 'node:path';
import fs from 'node:fs';
import knex from 'knex';
import { getDataDir, isTestEnv } from '../config.js';
import { isArchivePath } from '../constants.js';

const DB_DIR = getDataDir();
const DB_PATH = path.join(DB_DIR, 'db.sqlite3');

let db;

if (isTestEnv()) {
  console.log(' * Using in-memory sqlite db (test environment).');
  db = knex({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn, done) => {
        conn.run('PRAGMA foreign_keys = ON');
        done();
      },
    },
  });
} else {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  console.log(` * Using sqlite db file: ${DB_PATH}`);
  db = knex({
    client: 'sqlite3',
    connection: { filename: DB_PATH },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 2,
      acquireTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      afterCreate: (conn, done) => {
        conn.run('PRAGMA foreign_keys = ON');
        conn.run('PRAGMA journal_mode = WAL');
        conn.run('PRAGMA cache_size = -2000', done);
      },
    },
  });
}

const closePool = async () => {
  if (db) {
    await db.destroy();
    db = null;
  }
};

const getGameDetail = async (id) => {
  const game = await db('game').where({ id }).first();
  if (!game) return null;

  const makers = await db('game_maker')
    .join('maker', 'game_maker.maker_id', 'maker.id')
    .where('game_maker.game_id', id)
    .select('maker.id', 'maker.name');

  const genres = await db('game_genre')
    .join('genre', 'game_genre.genre_id', 'genre.id')
    .where('game_genre.game_id', id)
    .select('genre.id', 'genre.name');

  const tags = await db('game_tag')
    .join('tag', 'game_tag.tag_id', 'tag.id')
    .where('game_tag.game_id', id)
    .select('tag.id', 'tag.name');

  const sources = await db('game_source')
    .where('game_id', id)
    .select('id', 'source_type', 'source_id', 'source_url', 'name');

  const library = await db('library').where({ id: game.library_id }).first();

  let duplicateSources = [];
  if (sources.length > 0) {
    const dupRows = await db('game_source as gs')
      .join('game as g', 'g.id', 'gs.game_id')
      .where(function () {
        for (const s of sources) {
          this.orWhere({ 'gs.source_type': s.source_type, 'gs.source_id': s.source_id });
        }
      })
      .whereNot('gs.game_id', id)
      .select('gs.source_type', 'gs.source_id', 'g.id as game_id', 'g.name as game_name');

    const groups = {};
    for (const row of dupRows) {
      const key = `${row.source_type}:${row.source_id}`;
      if (!groups[key])
        groups[key] = { sourceType: row.source_type, sourceId: row.source_id, games: [] };
      groups[key].games.push({ gameId: row.game_id, name: row.game_name });
    }
    duplicateSources = Object.values(groups);
  }

  const similarGames = await getSimilarGames(id);

  return {
    ...game,
    makers,
    genres,
    tags,
    sources,
    library,
    duplicateSources,
    similarGames,
  };
};

/**
 * The suspected-similar partners of one game, with everything the UI needs to compare the
 * copies at a glance: folder-or-archive, and the creation date that usually says which
 * copy is the newer download. Both are SHOWN, never acted on - the user decides, because
 * a newer creation date does not guarantee a newer version.
 */
const getSimilarGames = async (gameId) => {
  const rows = await db('game_similar')
    .where('game_id_a', gameId)
    .orWhere('game_id_b', gameId)
    .select('game_id_a', 'game_id_b', 'score');
  if (rows.length === 0) return [];

  const otherIds = rows.map((row) => (row.game_id_a === gameId ? row.game_id_b : row.game_id_a));
  const others = await db('game')
    .whereIn('id', otherIds)
    .select('id', 'name', 'cover_path', 'sub_path', 'dir_created_at');
  const byId = new Map(others.map((g) => [g.id, g]));

  const current = await db('game')
    .where({ id: gameId })
    .select('id', 'name', 'cover_path', 'sub_path', 'dir_created_at')
    .first();

  const result = [];
  if (current) {
    result.push({
      gameId: current.id,
      name: current.name,
      coverPath: current.cover_path,
      isArchive: isArchivePath(current.sub_path),
      dirCreatedAt: current.dir_created_at,
      isSelf: true,
    });
  }
  for (const row of rows) {
    const otherId = row.game_id_a === gameId ? row.game_id_b : row.game_id_a;
    const game = byId.get(otherId);
    if (!game) continue;
    result.push({
      gameId: otherId,
      name: game.name,
      coverPath: game.cover_path,
      isArchive: isArchivePath(game.sub_path),
      dirCreatedAt: game.dir_created_at,
      score: row.score,
    });
  }

  return result.sort((a, b) => {
    const da = a.dirCreatedAt ? new Date(a.dirCreatedAt).getTime() : 0;
    const db2 = b.dirCreatedAt ? new Date(b.dirCreatedAt).getTime() : 0;
    return db2 - da;
  });
};

/**
 * The single definition of "this game has been scraped".
 *
 * It has to live in one place: the list filter, the unscraped list and the batch-skip ids
 * all ask this question, and when each spelled out its own SQL they disagreed - the list
 * filter counted a hand-dropped cover as scraped while the other two did not, so a game
 * vanished from the "unscraped" filter but stayed in the scan dialog's unscraped list.
 *
 * A cover counts as scraped on purpose: the games that need a hand-dropped cover are the
 * ones no configured source carries, so there is nothing left to fetch for them.
 *
 * `cover_path` of NULL and '' both mean "no cover" - the cover repair pass already treats
 * them the same, and an empty string must not pass as a scraped game.
 */
const applyScrapedFilter = (query, scraped) => {
  const hasSource = function () {
    this.select('id').from('game_source').whereRaw('game_source.game_id = game.id');
  };
  const hasCover = function () {
    this.whereNotNull('game.cover_path').andWhere('game.cover_path', '<>', '');
  };

  if (scraped === true) {
    return query.where(function () {
      this.whereExists(hasSource).orWhere(hasCover);
    });
  }
  if (scraped === false) {
    return query.whereNotExists(hasSource).where(function () {
      this.whereNull('game.cover_path').orWhere('game.cover_path', '');
    });
  }
  return query;
};

const getGames = async ({
  page = 1,
  pageSize = 50,
  keyword = '',
  libraryIds,
  noLibrary,
  makerIds,
  genreIds,
  tagIds,
  scraped,
  duplicate,
  r18,
  favoritesOnly,
  archivedOnly,
  excludeSubPaths,
  sortBy = 'updated_at',
  sortOrder = 'desc',
} = {}) => {
  let query = db('game')
    .leftJoin('library', 'game.library_id', 'library.id')
    .select('game.*', 'library.name as library_name', 'library.path as library_path');

  const allowedSort = ['name', 'created_at', 'updated_at', 'dir_created_at'];
  const sort = allowedSort.includes(sortBy) ? sortBy : 'updated_at';
  const order = sortOrder === 'asc' ? 'asc' : 'desc';
  query = query.orderBy(`game.${sort}`, order);

  if (keyword) {
    query = query.where(function () {
      this.where('game.name', 'like', `%${keyword}%`).orWhereIn('game.id', function () {
        this.select('game_id')
          .from('game_source')
          .where('game_source.name', 'like', `%${keyword}%`);
      });
    });
  }

  if (libraryIds && libraryIds.length > 0 && noLibrary) {
    query = query.where(function () {
      this.whereIn('game.library_id', libraryIds).orWhereNull('game.library_id');
    });
  } else if (libraryIds && libraryIds.length > 0) {
    query = query.whereIn('game.library_id', libraryIds);
  } else if (noLibrary) {
    query = query.whereNull('game.library_id');
  }

  if (makerIds && makerIds.length > 0) {
    query = query
      .join('game_maker', 'game.id', 'game_maker.game_id')
      .whereIn('game_maker.maker_id', makerIds);
  }

  if (genreIds && genreIds.length > 0) {
    query = query
      .join('game_genre', 'game.id', 'game_genre.game_id')
      .whereIn('game_genre.genre_id', genreIds);
  }

  if (tagIds && tagIds.length > 0) {
    query = query
      .join('game_tag', 'game.id', 'game_tag.game_id')
      .whereIn('game_tag.tag_id', tagIds);
  }

  query = applyScrapedFilter(query, scraped);

  // Both signals mean the same thing to the user - "this game exists more than once in the
  // library" - so the filter unions them: exact re-adoption of one vendor entry, and the
  // suspected-similar cross-vendor pairs.
  const exactDuplicateIds = function () {
    this.select('gs.game_id')
      .from('game_source as gs')
      .whereIn(db.raw('(gs.source_type, gs.source_id)'), function () {
        this.select('source_type', 'source_id')
          .from('game_source')
          .groupBy('source_type', 'source_id')
          .havingRaw('COUNT(*) > 1');
      });
  };
  const similarIdsA = function () {
    this.select('game_id_a').from('game_similar');
  };
  const similarIdsB = function () {
    this.select('game_id_b').from('game_similar');
  };

  if (duplicate === true) {
    query = query.where(function () {
      this.whereIn('game.id', exactDuplicateIds)
        .orWhereIn('game.id', similarIdsA)
        .orWhereIn('game.id', similarIdsB);
    });
  } else if (duplicate === false) {
    query = query.where(function () {
      this.whereNotIn('game.id', exactDuplicateIds)
        .whereNotIn('game.id', similarIdsA)
        .whereNotIn('game.id', similarIdsB);
    });
  }

  if (r18 === true) {
    query = query.where('game.r18', 1);
  } else if (r18 === false) {
    query = query.where(function () {
      this.where('game.r18', 0).orWhereNull('game.r18');
    });
  }

  if (favoritesOnly) {
    query = query.whereIn('game.id', function () {
      this.select('game_id').from('favorite');
    });
  }

  // Archived games are the user's "played and shelved" shelf: they only surface through the
  // Archive view, so every other view (games, favorites, search, filters) subtracts them here
  // - before counting and paginating, like the sub_path exclusions below.
  if (archivedOnly) {
    query = query.whereIn('game.id', function () {
      this.select('game_id').from('archive');
    });
  } else {
    query = query.whereNotIn('game.id', function () {
      this.select('game_id').from('archive');
    });
  }

  // Blacklisted / archived sub_paths are excluded here (before counting and paginating)
  // so that `total` reflects the real number of visible games.
  if (excludeSubPaths && excludeSubPaths.length > 0) {
    query = query.whereNotIn('game.sub_path', excludeSubPaths);
  }

  const total = await query.clone().countDistinct('game.id as count').first();
  let games;
  if (pageSize > 0) {
    const offset = (page - 1) * pageSize;
    games = await query.groupBy('game.id').offset(offset).limit(pageSize);
  } else {
    games = await query.groupBy('game.id');
  }

  if (games.length > 0) {
    const gameIds = games.map((g) => g.id);
    // One pass answers both things the list needs about a game's sources: the name to show
    // (first named source wins) and whether a source exists at all. The latter decides whether
    // a missing cover can ever be repaired, so it must not be read off `sourceName` - a source
    // whose name is null would then look like no source at all.
    const sourceRows = await db('game_source')
      .whereIn('game_id', gameIds)
      .orderBy('id')
      .select('game_id', 'name');
    const nameMap = {};
    const sourceIdSet = new Set();
    for (const s of sourceRows) {
      sourceIdSet.add(s.game_id);
      if (s.name && !nameMap[s.game_id]) nameMap[s.game_id] = s.name;
    }
    const favoriteIds = await db('favorite').whereIn('game_id', gameIds).select('game_id');
    const favSet = new Set(favoriteIds.map((f) => f.game_id));
    const archivedIds = await db('archive').whereIn('game_id', gameIds).select('game_id');
    const archivedSet = new Set(archivedIds.map((a) => a.game_id));
    const similarRows = await db('game_similar')
      .where(function () {
        this.whereIn('game_id_a', gameIds).orWhereIn('game_id_b', gameIds);
      })
      .select('game_id_a', 'game_id_b');
    const similarCount = {};
    for (const row of similarRows) {
      similarCount[row.game_id_a] = (similarCount[row.game_id_a] || 0) + 1;
      similarCount[row.game_id_b] = (similarCount[row.game_id_b] || 0) + 1;
    }
    for (const g of games) {
      g.sourceName = nameMap[g.id] || null;
      // Whether a cover can be fetched at all: the repair pass resolves covers through the
      // source, so a game without one has nothing to repair, only something to scrape.
      g.hasSource = sourceIdSet.has(g.id);
      g.is_favorite = favSet.has(g.id);
      g.is_archived = archivedSet.has(g.id);
      // Folder or archive, derived from sub_path rather than stored so it cannot drift.
      g.isArchive = isArchivePath(g.sub_path);
      g.similarCount = similarCount[g.id] || 0;
    }
  }

  return { games, total: total.count, page, pageSize };
};

// Uses the same definition as the list filter and the batch-skip ids - see
// applyScrapedFilter for why that matters.
const getUnscrapedGames = async (libraryId) =>
  applyScrapedFilter(db('game').where('game.library_id', libraryId), false)
    .select('game.id', 'game.name', 'game.sub_path')
    .orderBy('game.name');

// Ids the batch scraper skips because the game is already scraped. Same definition again,
// so a game whose cover was dropped by hand is not re-scraped by a later batch run.
const getScrapedIds = async () => applyScrapedFilter(db('game'), true).pluck('game.id');

const insertGame = async (data) => db('game').insert(data);
const updateGame = async (id, data) =>
  db('game')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() });
const deleteGame = async (id) => db('game').where({ id }).del();
const batchDeleteGames = async (ids) => db('game').whereIn('id', ids).del();

const addFavorite = async (gameId) =>
  db('favorite').insert({ game_id: gameId }).onConflict('game_id').ignore();

const removeFavorite = async (gameId) => db('favorite').where({ game_id: gameId }).del();

const batchAddFavorites = async (ids) => {
  if (ids.length === 0) return;
  await db('favorite')
    .insert(ids.map((id) => ({ game_id: id })))
    .onConflict('game_id')
    .ignore();
};

const batchRemoveFavorites = async (ids) => {
  if (ids.length === 0) return;
  await db('favorite').whereIn('game_id', ids).del();
};

const addArchived = async (gameId) =>
  db('archive').insert({ game_id: gameId }).onConflict('game_id').ignore();

const removeArchived = async (gameId) => db('archive').where({ game_id: gameId }).del();

const batchAddArchived = async (ids) => {
  if (ids.length === 0) return;
  await db('archive')
    .insert(ids.map((id) => ({ game_id: id })))
    .onConflict('game_id')
    .ignore();
};

const batchRemoveArchived = async (ids) => {
  if (ids.length === 0) return;
  await db('archive').whereIn('game_id', ids).del();
};

// The Recently list is capped: only the 100 most recently opened games are kept, and the
// oldest rows are dropped as new ones come in. The cap lives here (not in the route) so every
// write path stays bounded, no matter who calls it.
const MAX_RECENT = 100;

const getRecently = async (limit = MAX_RECENT) =>
  db('recently')
    .join('game', 'recently.game_id', 'game.id')
    .leftJoin('library', 'game.library_id', 'library.id')
    // Archived games are shelved: they leave the Recently rail along with the other lists.
    .whereNotIn('game.id', function () {
      this.select('game_id').from('archive');
    })
    .select(
      'game.*',
      'recently.opened_at',
      'library.name as library_name',
      'library.path as library_path',
    )
    .orderBy('recently.opened_at', 'desc')
    .limit(limit);

const touchRecently = async (gameId) => {
  const exists = await db('game').where({ id: gameId }).first('id');
  if (!exists) return false;
  // One row per game: re-opening refreshes the timestamp instead of inserting a duplicate.
  await db('recently')
    .insert({ game_id: gameId, opened_at: db.fn.now() })
    .onConflict('game_id')
    .merge(['opened_at']);
  await pruneRecently();
  return true;
};

// Delete everything beyond the newest MAX_RECENT rows.
const pruneRecently = async () => {
  const keep = await db('recently')
    .select('game_id')
    .orderBy('opened_at', 'desc')
    .orderBy('game_id', 'desc')
    .limit(MAX_RECENT);
  if (keep.length < MAX_RECENT) return 0;
  const keepIds = keep.map((row) => row.game_id);
  return db('recently').whereNotIn('game_id', keepIds).del();
};

const clearRecently = async () => db('recently').del();

const removeRecently = async (gameId) => db('recently').where({ game_id: gameId }).del();

const insertLibrary = async (data) => db('library').insert(data);
const getLibraries = async () => db('library').select('*');
const updateLibrary = async (id, data) => db('library').where({ id }).update(data);
const deleteLibrary = async (id) => db('library').where({ id }).del();

const getSetting = async (key) => {
  const row = await db('setting').where({ key }).first();
  return row ? row.value : null;
};

const setSetting = async (key, value) => {
  return db('setting').insert({ key, value }).onConflict('key').merge();
};

const getAllSettings = async () => {
  const rows = await db('setting').select('*');
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
};

const getMakers = async () => {
  return db('maker').select('id', 'name').orderBy('name');
};

const getGenres = async () => {
  return db('genre').select('id', 'name').orderBy('name');
};

const getTags = async () => {
  return db('tag').select('id', 'name').orderBy('name');
};

const getSearchCache = async (key) => {
  const row = await db('search_cache').where({ key }).first();
  if (!row) return null;
  return { ...row, results: JSON.parse(row.results) };
};

const setSearchCache = async ({ key, source, keyword, results }) => {
  const data = {
    key,
    source,
    keyword,
    results: JSON.stringify(results),
    updated_at: db.fn.now(),
  };
  await db('search_cache').insert(data).onConflict('key').merge();
};

const batchSetSearchCache = async (items) => {
  for (const item of items) {
    const data = {
      key: item.key,
      source: item.source,
      keyword: item.keyword,
      results: JSON.stringify(item.results),
      updated_at: db.fn.now(),
    };
    await db('search_cache').insert(data).onConflict('key').merge();
  }
};

const deleteSearchCache = async (keys) => {
  if (keys.length === 0) return;
  await db('search_cache').whereIn('key', keys).del();
};

const getSearchCacheByKeywords = async (keywords) => {
  if (keywords.length === 0) return [];
  const rows = await db('search_cache').whereIn('keyword', keywords);
  return rows.map((r) => ({ ...r, results: JSON.parse(r.results) }));
};

const getAdoptCache = async (gameIds) => {
  if (gameIds.length === 0) return [];
  const rows = await db('adopt_cache').whereIn('game_id', gameIds);
  return rows.map((r) => ({
    ...r,
    makers: JSON.parse(r.makers),
    genres: JSON.parse(r.genres),
    tags: JSON.parse(r.tags),
  }));
};

const getAdoptCacheBySubPaths = async (libraryId, subPaths) => {
  if (!libraryId || subPaths.length === 0) return [];
  const rows = await db('adopt_cache')
    .where({ library_id: libraryId })
    .whereIn('sub_path', subPaths);
  return rows.map((r) => ({
    ...r,
    makers: JSON.parse(r.makers),
    genres: JSON.parse(r.genres),
    tags: JSON.parse(r.tags),
  }));
};

const getAdoptCacheMixed = async (gameIds, subPathEntries) => {
  const results = [];
  if (gameIds.length > 0) {
    results.push(...(await getAdoptCache(gameIds)));
  }
  const byLibrary = new Map();
  for (const { libraryId, subPath } of subPathEntries) {
    if (!byLibrary.has(libraryId)) byLibrary.set(libraryId, []);
    byLibrary.get(libraryId).push(subPath);
  }
  for (const [libraryId, subPaths] of byLibrary) {
    results.push(...(await getAdoptCacheBySubPaths(libraryId, subPaths)));
  }
  return results;
};

const setAdoptCache = async ({
  gameId,
  libraryId,
  subPath,
  sourceType,
  sourceId,
  sourceUrl,
  name,
  coverUrl,
  makers,
  genres,
  tags,
  description,
  nsfw,
}) => {
  const data = {
    game_id: gameId || 0,
    library_id: libraryId || 0,
    sub_path: subPath || '',
    source_type: sourceType,
    source_id: sourceId,
    source_url: sourceUrl || null,
    name: name || null,
    cover_url: coverUrl || null,
    makers: JSON.stringify(makers || []),
    genres: JSON.stringify(genres || []),
    tags: JSON.stringify(tags || []),
    description: description || null,
    // 1/0 when the vendor publishes a flag, NULL when it does not ("no opinion", not "safe").
    nsfw: typeof nsfw === 'boolean' ? (nsfw ? 1 : 0) : null,
    updated_at: db.fn.now(),
  };
  await db('adopt_cache').insert(data).onConflict(['library_id', 'sub_path']).merge();
};

const batchSetAdoptCache = async (items) => {
  for (const item of items) {
    await setAdoptCache(item);
  }
};

const deleteAdoptCache = async (gameIds) => {
  if (gameIds.length === 0) return;
  await db('adopt_cache').whereIn('game_id', gameIds).del();
};

const deleteAdoptCacheBySubPaths = async (libraryId, subPaths) => {
  if (!libraryId || subPaths.length === 0) return;
  await db('adopt_cache').where({ library_id: libraryId }).whereIn('sub_path', subPaths).del();
};

const deleteAdoptCacheMixed = async (gameIds, subPathEntries) => {
  if (gameIds.length > 0) {
    await deleteAdoptCache(gameIds);
  }
  const byLibrary = new Map();
  for (const { libraryId, subPath } of subPathEntries) {
    if (!byLibrary.has(libraryId)) byLibrary.set(libraryId, []);
    byLibrary.get(libraryId).push(subPath);
  }
  for (const [libraryId, subPaths] of byLibrary) {
    await deleteAdoptCacheBySubPaths(libraryId, subPaths);
  }
};

const migrateAdoptCacheGameId = async (libraryId, subPathToGameId) => {
  for (const [subPath, gameId] of Object.entries(subPathToGameId)) {
    await db('adopt_cache')
      .where({ library_id: libraryId, sub_path: subPath })
      .update({ game_id: gameId });
  }
};

const getDuplicateSources = async () => {
  const dupKeys = await db('game_source')
    .select('source_type', 'source_id')
    .groupBy('source_type', 'source_id')
    .havingRaw('COUNT(*) > 1');

  if (dupKeys.length === 0) return [];

  let query = db('game_source as gs')
    .join('game as g', 'g.id', 'gs.game_id')
    .select('gs.source_type', 'gs.source_id', 'gs.game_id', 'g.name as game_name');

  dupKeys.forEach((key, index) => {
    if (index === 0) {
      query = query.where({ 'gs.source_type': key.source_type, 'gs.source_id': key.source_id });
    } else {
      query = query.orWhere({ 'gs.source_type': key.source_type, 'gs.source_id': key.source_id });
    }
  });

  const rows = await query.orderBy('gs.source_type', 'gs.source_id');

  const groups = {};
  for (const row of rows) {
    const key = `${row.source_type}:${row.source_id}`;
    if (!groups[key])
      groups[key] = { sourceType: row.source_type, sourceId: row.source_id, games: [] };
    groups[key].games.push({ gameId: row.game_id, name: row.game_name });
  }

  return Object.values(groups);
};

export {
  getSimilarGames,
  db as knex,
  getGameDetail,
  getGames,
  getUnscrapedGames,
  getScrapedIds,
  insertGame,
  updateGame,
  deleteGame,
  batchDeleteGames,
  addFavorite,
  removeFavorite,
  batchAddFavorites,
  batchRemoveFavorites,
  addArchived,
  removeArchived,
  batchAddArchived,
  batchRemoveArchived,
  MAX_RECENT,
  getRecently,
  touchRecently,
  pruneRecently,
  clearRecently,
  removeRecently,
  insertLibrary,
  getLibraries,
  updateLibrary,
  deleteLibrary,
  getSetting,
  setSetting,
  getAllSettings,
  getMakers,
  getGenres,
  getTags,
  getSearchCache,
  setSearchCache,
  batchSetSearchCache,
  deleteSearchCache,
  getSearchCacheByKeywords,
  getAdoptCache,
  getAdoptCacheBySubPaths,
  getAdoptCacheMixed,
  setAdoptCache,
  batchSetAdoptCache,
  deleteAdoptCache,
  deleteAdoptCacheBySubPaths,
  deleteAdoptCacheMixed,
  migrateAdoptCacheGameId,
  getDuplicateSources,
  closePool,
};
