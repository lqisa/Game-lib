const fs = require('fs')
const path = require('path')
const { knex } = require('./db')
const { createSchema } = require('./schema')
const { getDataDir } = require('../config')

const DB_PATH = path.join(getDataDir(), 'db.sqlite3')

const ALL_TABLES = [
  'library', 'maker', 'genre', 'tag', 'game',
  'game_maker', 'game_genre', 'game_tag', 'game_source', 'setting'
]

const TABLE_DDL = {
  library: (knex) => knex.schema.createTable('library', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.string('path').notNullable()
  }),
  maker: (knex) => knex.schema.createTable('maker', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.text('description')
  }),
  genre: (knex) => knex.schema.createTable('genre', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.text('description')
  }),
  tag: (knex) => knex.schema.createTable('tag', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.text('description')
  }),
  game: (knex) => knex.schema.createTable('game', (table) => {
    table.increments()
    table.string('name').notNullable()
    table.text('cover_path')
    table.text('description')
    table.integer('library_id').notNullable()
    table.string('sub_path').notNullable()
    table.dateTime('created_at').defaultTo(knex.fn.now())
    table.dateTime('updated_at').defaultTo(knex.fn.now())
    table.foreign('library_id').references('id').inTable('library').onDelete('CASCADE')
  }),
  game_maker: (knex) => knex.schema.createTable('game_maker', (table) => {
    table.integer('game_id').notNullable()
    table.integer('maker_id').notNullable()
    table.primary(['game_id', 'maker_id'])
    table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE')
    table.foreign('maker_id').references('id').inTable('maker').onDelete('CASCADE')
  }),
  game_genre: (knex) => knex.schema.createTable('game_genre', (table) => {
    table.integer('game_id').notNullable()
    table.integer('genre_id').notNullable()
    table.primary(['game_id', 'genre_id'])
    table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE')
    table.foreign('genre_id').references('id').inTable('genre').onDelete('CASCADE')
  }),
  game_tag: (knex) => knex.schema.createTable('game_tag', (table) => {
    table.integer('game_id').notNullable()
    table.integer('tag_id').notNullable()
    table.primary(['game_id', 'tag_id'])
    table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE')
    table.foreign('tag_id').references('id').inTable('tag').onDelete('CASCADE')
  }),
  game_source: (knex) => knex.schema.createTable('game_source', (table) => {
    table.increments()
    table.integer('game_id').notNullable()
    table.string('source_type').notNullable()
    table.string('source_id').notNullable()
    table.text('source_url')
    table.text('raw_data')
    table.unique(['source_type', 'source_id'])
    table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE')
  }),
  setting: (knex) => knex.schema.createTable('setting', (table) => {
    table.string('key').primary()
    table.text('value').notNullable()
  })
}

const initDatabase = async () => {
  const dbExists = fs.existsSync(DB_PATH)

  if (!dbExists) {
    console.log(' * 数据库不存在，正在创建...')
    await createSchema()
    console.log(' * 数据库创建完成.')
    await knex('setting').insert({ key: 'scrape_concurrency', value: '4' }).onConflict('key').ignore()
    return
  }

  console.log(' * 数据库已存在，检查缺失的表...')
  const existingTables = await knex.raw("SELECT name FROM sqlite_master WHERE type='table'").then(r => r.map(row => row.name))
  const missingTables = ALL_TABLES.filter(t => !existingTables.includes(t))

  if (missingTables.length === 0) {
    console.log(' * 所有表已存在.')
    return
  }

  for (const tableName of missingTables) {
    console.log(` * 创建缺失的表: ${tableName}`)
    await TABLE_DDL[tableName](knex)
  }
  console.log(' * 缺失的表创建完成.')
}

module.exports = { initDatabase }