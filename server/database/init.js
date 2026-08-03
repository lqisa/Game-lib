import fs from 'node:fs';
import path from 'node:path';
import { knex } from './db.js';
import { createSchema } from './schema.js';
import { getDataDir } from '../config.js';

const DB_PATH = path.join(getDataDir(), 'db.sqlite3');

const ALL_TABLES = [
  'library',
  'maker',
  'genre',
  'tag',
  'game',
  'game_maker',
  'game_genre',
  'game_tag',
  'game_source',
  'setting',
  'search_cache',
  'adopt_cache',
  'favorite',
];

const TABLE_DDL = {
  library: (knex) =>
    knex.schema.createTable('library', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.string('path').notNullable();
    }),
  maker: (knex) =>
    knex.schema.createTable('maker', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.text('description');
    }),
  genre: (knex) =>
    knex.schema.createTable('genre', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.text('description');
    }),
  tag: (knex) =>
    knex.schema.createTable('tag', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.text('description');
    }),
  game: (knex) =>
    knex.schema.createTable('game', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.text('cover_path');
      table.text('description');
      table.integer('library_id').notNullable();
      table.string('sub_path').notNullable();
      table.dateTime('created_at').defaultTo(knex.fn.now());
      table.dateTime('updated_at').defaultTo(knex.fn.now());
      table.dateTime('dir_created_at');
      table.foreign('library_id').references('id').inTable('library').onDelete('CASCADE');
    }),
  game_maker: (knex) =>
    knex.schema.createTable('game_maker', (table) => {
      table.integer('game_id').notNullable();
      table.integer('maker_id').notNullable();
      table.primary(['game_id', 'maker_id']);
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
      table.foreign('maker_id').references('id').inTable('maker').onDelete('CASCADE');
    }),
  game_genre: (knex) =>
    knex.schema.createTable('game_genre', (table) => {
      table.integer('game_id').notNullable();
      table.integer('genre_id').notNullable();
      table.primary(['game_id', 'genre_id']);
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
      table.foreign('genre_id').references('id').inTable('genre').onDelete('CASCADE');
    }),
  game_tag: (knex) =>
    knex.schema.createTable('game_tag', (table) => {
      table.integer('game_id').notNullable();
      table.integer('tag_id').notNullable();
      table.primary(['game_id', 'tag_id']);
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
      table.foreign('tag_id').references('id').inTable('tag').onDelete('CASCADE');
    }),
  game_source: (knex) =>
    knex.schema.createTable('game_source', (table) => {
      table.increments();
      table.integer('game_id').notNullable();
      table.string('source_type').notNullable();
      table.string('source_id').notNullable();
      table.text('source_url');
      table.text('name');
      table.text('raw_data');
      table.unique(['game_id', 'source_type', 'source_id']);
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
    }),
  setting: (knex) =>
    knex.schema.createTable('setting', (table) => {
      table.string('key').primary();
      table.text('value').notNullable();
    }),
  search_cache: (knex) =>
    knex.schema.createTable('search_cache', (table) => {
      table.string('key').primary();
      table.string('source').notNullable();
      table.string('keyword').notNullable();
      table.text('results').notNullable();
      table.dateTime('created_at').defaultTo(knex.fn.now());
      table.dateTime('updated_at').defaultTo(knex.fn.now());
    }),
  adopt_cache: (knex) =>
    knex.schema.createTable('adopt_cache', (table) => {
      table.integer('game_id').notNullable().defaultTo(0);
      table.integer('library_id').notNullable().defaultTo(0);
      table.string('sub_path').notNullable().defaultTo('');
      table.string('source_type').notNullable();
      table.string('source_id').notNullable();
      table.text('source_url');
      table.text('name');
      table.text('cover_url');
      table.text('makers').notNullable().defaultTo('[]');
      table.text('genres').notNullable().defaultTo('[]');
      table.text('tags').notNullable().defaultTo('[]');
      table.text('description');
      table.dateTime('created_at').defaultTo(knex.fn.now());
      table.dateTime('updated_at').defaultTo(knex.fn.now());
      table.primary(['library_id', 'sub_path']);
    }),
  favorite: (knex) =>
    knex.schema.createTable('favorite', (table) => {
      table.integer('game_id').primary();
      table.dateTime('created_at').defaultTo(knex.fn.now());
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
    }),
};

const initDatabase = async () => {
  const dbExists = fs.existsSync(DB_PATH);

  if (!dbExists) {
    console.log(' * Database not found, creating...');
    await createSchema();
    console.log(' * Database created.');
    await knex('setting')
      .insert({ key: 'scrape_concurrency', value: '4' })
      .onConflict('key')
      .ignore();
    return;
  }

  console.log(' * Database exists, checking missing tables...');

  const existingTables = await knex
    .raw("SELECT name FROM sqlite_master WHERE type='table'")
    .then((r) => r.map((row) => row.name));
  const missingTables = ALL_TABLES.filter((t) => !existingTables.includes(t));

  if (missingTables.length === 0) {
    console.log(' * All tables exist.');
  } else {
    for (const tableName of missingTables) {
      console.log(` * Creating missing table: ${tableName}`);
      await TABLE_DDL[tableName](knex);
    }
    console.log(' * Missing tables created.');
  }

  await knex('setting')
    .insert({ key: 'scrape_concurrency', value: '4' })
    .onConflict('key')
    .ignore();

  await knex('setting')
    .insert({ key: 'blacklist', value: JSON.stringify(['$RECYCLE.BIN']) })
    .onConflict('key')
    .ignore();

  const v2 = await knex('setting').where({ key: 'migration_v2' }).first();
  if (!v2) {
    console.log(' * Running migration v2: game_source constraint change...');
    await knex.raw('DROP INDEX IF EXISTS game_source_source_type_source_id_unique');
    await knex.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS game_source_game_id_source_type_source_id_unique ON game_source(game_id, source_type, source_id)',
    );
    await knex('setting').insert({ key: 'migration_v2', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v2 done.');
  }

  const v3 = await knex('setting').where({ key: 'migration_v3' }).first();
  if (!v3) {
    console.log(' * Running migration v3: add name column to game_source...');
    const hasName = await knex.raw("PRAGMA table_info('game_source')").then(
      (r) => r.some((col) => col.name === 'name')
    );
    if (!hasName) {
      await knex.raw('ALTER TABLE game_source ADD COLUMN name TEXT');
    }
    await knex('setting').insert({ key: 'migration_v3', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v3 done.');
  }

  const v4 = await knex('setting').where({ key: 'migration_v4' }).first();
  if (!v4) {
    console.log(' * Running migration v4: make library_id nullable in game...');
    await knex.raw('PRAGMA foreign_keys = OFF');
    await knex.raw(`
      CREATE TABLE game_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        cover_path TEXT,
        description TEXT,
        library_id INTEGER,
        sub_path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (library_id) REFERENCES library(id) ON DELETE CASCADE
      )
    `);
    await knex.raw('INSERT INTO game_new SELECT * FROM game');
    await knex.raw('DROP TABLE game');
    await knex.raw('ALTER TABLE game_new RENAME TO game');
    await knex.raw('PRAGMA foreign_keys = ON');
    await knex('setting').insert({ key: 'migration_v4', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v4 done.');
  }

  const v5 = await knex('setting').where({ key: 'migration_v5' }).first();
  if (!v5) {
    console.log(' * Running migration v5: rebuild adopt_cache with library_id + sub_path...');
    await knex.raw('PRAGMA foreign_keys = OFF');
    await knex.raw(`
      CREATE TABLE adopt_cache_new (
        game_id INTEGER NOT NULL DEFAULT 0,
        library_id INTEGER NOT NULL DEFAULT 0,
        sub_path TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_url TEXT,
        name TEXT,
        cover_url TEXT,
        makers TEXT NOT NULL DEFAULT '[]',
        genres TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (library_id, sub_path)
      )
    `);
    await knex.raw('INSERT INTO adopt_cache_new (game_id, source_type, source_id, source_url, name, cover_url, makers, genres, tags, description, created_at, updated_at) SELECT game_id, source_type, source_id, source_url, name, cover_url, makers, genres, tags, description, created_at, updated_at FROM adopt_cache');
    await knex.raw('DROP TABLE adopt_cache');
    await knex.raw('ALTER TABLE adopt_cache_new RENAME TO adopt_cache');
    await knex.raw('PRAGMA foreign_keys = ON');
    await knex('setting').insert({ key: 'migration_v5', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v5 done.');
  }

  const v6 = await knex('setting').where({ key: 'migration_v6' }).first();
  if (!v6) {
    console.log(' * Running migration v6: add dir_created_at to game...');
    await knex.raw('ALTER TABLE game ADD COLUMN dir_created_at DATETIME');
    await knex('setting').insert({ key: 'migration_v6', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v6 done.');
  }

  const v7 = await knex('setting').where({ key: 'migration_v7' }).first();
  if (!v7) {
    console.log(' * Running migration v7: add favorite table...');
    await knex.raw('PRAGMA foreign_keys = OFF');
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS favorite (
        game_id INTEGER PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES game(id) ON DELETE CASCADE
      )
    `);
    await knex.raw('PRAGMA foreign_keys = ON');
    await knex('setting').insert({ key: 'migration_v7', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v7 done.');
  }
};

export { initDatabase };