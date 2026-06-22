import path from 'node:path'
import fs from 'node:fs'
import knex from 'knex'
import { getDataDir } from '../config.js'

const DB_DIR = getDataDir()
const DB_PATH = path.join(DB_DIR, 'db.sqlite3')

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

const db = knex({
  client: 'sqlite3',
  connection: { filename: DB_PATH },
  useNullAsDefault: true,
  pool: {
    afterCreate: (conn, done) => {
      conn.run('PRAGMA foreign_keys = ON', done)
    }
  }
})

const getGameDetail = async (id) => {
  const game = await db('game').where({ id }).first()
  if (!game) return null

  const makers = await db('game_maker')
    .join('maker', 'game_maker.maker_id', 'maker.id')
    .where('game_maker.game_id', id)
    .select('maker.id', 'maker.name')

  const genres = await db('game_genre')
    .join('genre', 'game_genre.genre_id', 'genre.id')
    .where('game_genre.game_id', id)
    .select('genre.id', 'genre.name')

  const tags = await db('game_tag')
    .join('tag', 'game_tag.tag_id', 'tag.id')
    .where('game_tag.game_id', id)
    .select('tag.id', 'tag.name')

  const sources = await db('game_source')
    .where('game_id', id)
    .select('id', 'source_type', 'source_id', 'source_url')

  const library = await db('library').where({ id: game.library_id }).first()

  return { ...game, makers, genres, tags, sources, library }
}

const getGames = async ({ page = 1, pageSize = 50, keyword = '', libraryIds, makerIds, genreIds, tagIds, scraped, sortBy = 'updated_at', sortOrder = 'desc' } = {}) => {
  let query = db('game')
    .leftJoin('library', 'game.library_id', 'library.id')
    .select('game.*', 'library.name as library_name', 'library.path as library_path')

  const allowedSort = ['name', 'created_at', 'updated_at']
  const sort = allowedSort.includes(sortBy) ? sortBy : 'updated_at'
  const order = sortOrder === 'asc' ? 'asc' : 'desc'
  query = query.orderBy(`game.${sort}`, order)

  if (keyword) {
    query = query.where('game.name', 'like', `%${keyword}%`)
  }

  if (libraryIds && libraryIds.length > 0) {
    query = query.whereIn('game.library_id', libraryIds)
  }

  if (makerIds && makerIds.length > 0) {
    query = query
      .join('game_maker', 'game.id', 'game_maker.game_id')
      .whereIn('game_maker.maker_id', makerIds)
  }

  if (genreIds && genreIds.length > 0) {
    query = query
      .join('game_genre', 'game.id', 'game_genre.game_id')
      .whereIn('game_genre.genre_id', genreIds)
  }

  if (tagIds && tagIds.length > 0) {
    query = query
      .join('game_tag', 'game.id', 'game_tag.game_id')
      .whereIn('game_tag.tag_id', tagIds)
  }

  if (scraped === true) {
    query = query.whereExists(function () {
      this.select('id').from('game_source').whereRaw('game_source.game_id = game.id')
    })
  } else if (scraped === false) {
    query = query.whereNotExists(function () {
      this.select('id').from('game_source').whereRaw('game_source.game_id = game.id')
    })
  }

  const total = await query.clone().countDistinct('game.id as count').first()
  let games
  if (pageSize > 0) {
    const offset = (page - 1) * pageSize
    games = await query.groupBy('game.id').offset(offset).limit(pageSize)
  } else {
    games = await query.groupBy('game.id')
  }
  return { games, total: total.count, page, pageSize }
}

const getUnscrapedGames = async (libraryId) => {
  return db('game')
    .leftJoin('game_source', 'game.id', 'game_source.game_id')
    .where('game.library_id', libraryId)
    .whereNull('game_source.id')
    .select('game.id', 'game.name', 'game.sub_path')
    .orderBy('game.name')
}

const insertGame = async (data) => db('game').insert(data)
const updateGame = async (id, data) => db('game').where({ id }).update({ ...data, updated_at: db.fn.now() })
const deleteGame = async (id) => db('game').where({ id }).del()
const batchDeleteGames = async (ids) => db('game').whereIn('id', ids).del()
const insertLibrary = async (data) => db('library').insert(data)
const getLibraries = async () => db('library').select('*')
const updateLibrary = async (id, data) => db('library').where({ id }).update(data)
const deleteLibrary = async (id) => db('library').where({ id }).del()

const getSetting = async (key) => {
  const row = await db('setting').where({ key }).first()
  return row ? row.value : null
}

const setSetting = async (key, value) => {
  return db('setting').insert({ key, value }).onConflict('key').merge()
}

const getAllSettings = async () => {
  const rows = await db('setting').select('*')
  const settings = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }
  return settings
}

const insertGameSource = async (data) => {
  return db('game_source').insert(data).onConflict(['source_type', 'source_id']).merge()
}

const insertMakers = async (names) => {
  const results = []
  for (const name of names) {
    const existing = await db('maker').where({ name }).first()
    if (existing) {
      results.push(existing.id)
    } else {
      const [id] = await db('maker').insert({ name })
      results.push(id)
    }
  }
  return results
}

const insertGenres = async (names) => {
  const results = []
  for (const name of names) {
    const existing = await db('genre').where({ name }).first()
    if (existing) {
      results.push(existing.id)
    } else {
      const [id] = await db('genre').insert({ name })
      results.push(id)
    }
  }
  return results
}

const insertTags = async (names) => {
  const results = []
  for (const name of names) {
    const existing = await db('tag').where({ name }).first()
    if (existing) {
      results.push(existing.id)
    } else {
      const [id] = await db('tag').insert({ name })
      results.push(id)
    }
  }
  return results
}

const syncGameMakers = async (gameId, makerIds) => {
  await db('game_maker').where({ game_id: gameId }).del()
  if (makerIds.length > 0) {
    await db('game_maker').insert(makerIds.map(m => ({ game_id: gameId, maker_id: m })))
  }
}

const syncGameGenres = async (gameId, genreIds) => {
  await db('game_genre').where({ game_id: gameId }).del()
  if (genreIds.length > 0) {
    await db('game_genre').insert(genreIds.map(g => ({ game_id: gameId, genre_id: g })))
  }
}

const syncGameTags = async (gameId, tagIds) => {
  await db('game_tag').where({ game_id: gameId }).del()
  if (tagIds.length > 0) {
    await db('game_tag').insert(tagIds.map(t => ({ game_id: gameId, tag_id: t })))
  }
}

const getMakers = async () => {
  return db('maker').select('id', 'name').orderBy('name')
}

const getGenres = async () => {
  return db('genre').select('id', 'name').orderBy('name')
}

const getTags = async () => {
  return db('tag').select('id', 'name').orderBy('name')
}

const getSearchCache = async (key) => {
  const row = await db('search_cache').where({ key }).first()
  if (!row) return null
  return { ...row, results: JSON.parse(row.results) }
}

const setSearchCache = async ({ key, source, keyword, results }) => {
  const data = {
    key,
    source,
    keyword,
    results: JSON.stringify(results),
    updated_at: db.fn.now()
  }
  await db('search_cache').insert(data).onConflict('key').merge()
}

const batchSetSearchCache = async (items) => {
  for (const item of items) {
    const data = {
      key: item.key,
      source: item.source,
      keyword: item.keyword,
      results: JSON.stringify(item.results),
      updated_at: db.fn.now()
    }
    await db('search_cache').insert(data).onConflict('key').merge()
  }
}

const deleteSearchCache = async (keys) => {
  if (keys.length === 0) return
  await db('search_cache').whereIn('key', keys).del()
}

const getSearchCacheByKeywords = async (keywords) => {
  if (keywords.length === 0) return []
  const rows = await db('search_cache').whereIn('keyword', keywords)
  return rows.map(r => ({ ...r, results: JSON.parse(r.results) }))
}

export { db as knex }
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
  getSearchCacheByKeywords
}