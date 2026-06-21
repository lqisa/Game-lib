const path = require('path')
const fs = require('fs')
const knex = require('knex')
const { getDataDir } = require('../config')

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

const getGames = async ({ page = 1, pageSize = 50, keyword = '' } = {}) => {
  let query = db('game')
    .leftJoin('library', 'game.library_id', 'library.id')
    .select('game.*', 'library.name as library_name', 'library.path as library_path')
    .orderBy('game.updated_at', 'desc')

  if (keyword) {
    query = query.where('game.name', 'like', `%${keyword}%`)
  }

  const total = await query.clone().count('* as count').first()
  const offset = (page - 1) * pageSize
  const games = await query.offset(offset).limit(pageSize)

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

module.exports = {
  knex: db,
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
  syncGameTags
}