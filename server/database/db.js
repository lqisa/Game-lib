import path from 'node:path';
import fs from 'node:fs';
import knex from 'knex';
import { getDataDir } from '../config.js';

const DB_DIR = getDataDir();
const DB_PATH = path.join(DB_DIR, 'db.sqlite3');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = knex({
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

  return { ...game, makers, genres, tags, sources, library, duplicateSources };
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
      this.where('game.name', 'like', `%${keyword}%`)
        .orWhereIn('game.id', function () {
          this.select('game_id').from('game_source')
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

  if (scraped === true) {
    query = query.whereExists(function () {
      this.select('id').from('game_source').whereRaw('game_source.game_id = game.id');
    });
  } else if (scraped === false) {
    query = query.whereNotExists(function () {
      this.select('id').from('game_source').whereRaw('game_source.game_id = game.id');
    });
  }

  if (duplicate === true) {
    query = query.whereIn('game.id', function () {
      this.select('gs.game_id').from('game_source as gs')
        .whereIn(
          db.raw('(gs.source_type, gs.source_id)'),
          function () {
            this.select('source_type', 'source_id').from('game_source')
              .groupBy('source_type', 'source_id')
              .havingRaw('COUNT(*) > 1');
          }
        );
    });
  } else if (duplicate === false) {
    query = query.whereNotIn('game.id', function () {
      this.select('gs.game_id').from('game_source as gs')
        .whereIn(
          db.raw('(gs.source_type, gs.source_id)'),
          function () {
            this.select('source_type', 'source_id').from('game_source')
              .groupBy('source_type', 'source_id')
              .havingRaw('COUNT(*) > 1');
          }
        );
    });
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
    const sourceNames = await db('game_source')
      .whereIn('game_id', gameIds)
      .whereNotNull('name')
      .orderBy('id')
      .select('game_id', 'name');
    const nameMap = {};
    for (const s of sourceNames) {
      if (!nameMap[s.game_id]) nameMap[s.game_id] = s.name;
    }
    for (const g of games) {
      g.sourceName = nameMap[g.id] || null;
    }
  }

  return { games, total: total.count, page, pageSize };
};

const getUnscrapedGames = async (libraryId) => {
  return db('game')
    .leftJoin('game_source', 'game.id', 'game_source.game_id')
    .where('game.library_id', libraryId)
    .whereNull('game_source.id')
    .select('game.id', 'game.name', 'game.sub_path')
    .orderBy('game.name');
};

const insertGame = async (data) => db('game').insert(data);
const updateGame = async (id, data) =>
  db('game')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() });
const deleteGame = async (id) => db('game').where({ id }).del();
const batchDeleteGames = async (ids) => db('game').whereIn('id', ids).del();
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

const insertGameSource = async (data) => {
  return db('game_source')
    .insert(data)
    .onConflict(['game_id', 'source_type', 'source_id'])
    .merge(['source_url', 'raw_data']);
};

const insertMakers = async (names) => {
  if (names.length === 0) return [];
  const existing = await db('maker').whereIn('name', names).select('id', 'name');
  const existingMap = new Map(existing.map((r) => [r.name, r.id]));
  const newNames = names.filter((n) => !existingMap.has(n));
  if (newNames.length > 0) {
    const rows = await db('maker').insert(
      newNames.map((name) => ({ name })),
      ['id', 'name'],
    );
    for (const row of rows) existingMap.set(row.name, row.id);
  }
  return names.map((n) => existingMap.get(n));
};

const insertGenres = async (names) => {
  if (names.length === 0) return [];
  const existing = await db('genre').whereIn('name', names).select('id', 'name');
  const existingMap = new Map(existing.map((r) => [r.name, r.id]));
  const newNames = names.filter((n) => !existingMap.has(n));
  if (newNames.length > 0) {
    const rows = await db('genre').insert(
      newNames.map((name) => ({ name })),
      ['id', 'name'],
    );
    for (const row of rows) existingMap.set(row.name, row.id);
  }
  return names.map((n) => existingMap.get(n));
};

const insertTags = async (names) => {
  if (names.length === 0) return [];
  const existing = await db('tag').whereIn('name', names).select('id', 'name');
  const existingMap = new Map(existing.map((r) => [r.name, r.id]));
  const newNames = names.filter((n) => !existingMap.has(n));
  if (newNames.length > 0) {
    const rows = await db('tag').insert(
      newNames.map((name) => ({ name })),
      ['id', 'name'],
    );
    for (const row of rows) existingMap.set(row.name, row.id);
  }
  return names.map((n) => existingMap.get(n));
};

const syncGameMakers = async (gameId, makerIds) => {
  await db('game_maker').where({ game_id: gameId }).del();
  if (makerIds.length > 0) {
    await db('game_maker').insert(makerIds.map((m) => ({ game_id: gameId, maker_id: m })));
  }
};

const syncGameGenres = async (gameId, genreIds) => {
  await db('game_genre').where({ game_id: gameId }).del();
  if (genreIds.length > 0) {
    await db('game_genre').insert(genreIds.map((g) => ({ game_id: gameId, genre_id: g })));
  }
};

const syncGameTags = async (gameId, tagIds) => {
  await db('game_tag').where({ game_id: gameId }).del();
  if (tagIds.length > 0) {
    await db('game_tag').insert(tagIds.map((t) => ({ game_id: gameId, tag_id: t })));
  }
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
  const rows = await db('adopt_cache').where({ library_id: libraryId }).whereIn('sub_path', subPaths);
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

const setAdoptCache = async ({ gameId, libraryId, subPath, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description }) => {
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
    await db('adopt_cache').where({ library_id: libraryId, sub_path: subPath }).update({ game_id: gameId });
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

export { db as knex };
export {
  getGameDetail,
  getGames,
  getUnscrapedGames,
  insertGame,
  updateGame,
  deleteGame,
  batchDeleteGames,
  insertLibrary,
  getLibraries,
  updateLibrary,
  deleteLibrary,
  getSetting,
  setSetting,
  getAllSettings,
  insertGameSource,
  insertMakers,
  insertGenres,
  insertTags,
  syncGameMakers,
  syncGameGenres,
  syncGameTags,
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
};