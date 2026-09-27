import fs from 'node:fs';
import path from 'node:path';
import { knex } from './db.js';
import { getDataDir, ensureDir, isTestEnv } from '../config.js';
import { DEFAULT_MATCH_PRIORITY, DEFAULT_MATCH_THRESHOLD } from '../scraper/match.js';

const DB_DIR = getDataDir();
const DB_PATH = path.join(DB_DIR, 'db.sqlite3');

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
      table.integer('library_id').nullable();
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
  recently: (knex) =>
    knex.schema.createTable('recently', (table) => {
      table.integer('game_id').primary();
      table.dateTime('opened_at').defaultTo(knex.fn.now());
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
    }),
};

const initDatabase = async () => {
  // Ensure data directory exists before any DB operations
  ensureDir(DB_DIR);

  const existingTables = await knex
    .raw("SELECT name FROM sqlite_master WHERE type='table'")
    .then((r) => r.map((row) => row.name));

  const missingTables = ALL_TABLES.filter((t) => !existingTables.includes(t));

  if (missingTables.length === 0) {
    console.log(' * All tables exist.');
  } else {
    if (isTestEnv()) {
      console.log(' * Test environment: creating schema...');
    } else {
      const dbExists = fs.existsSync(DB_PATH);
      if (!dbExists) {
        console.log(' * Database not found, creating...');
      } else {
        console.log(' * Database exists, checking missing tables...');
      }
    }

    for (const tableName of missingTables) {
      console.log(` * Creating table: ${tableName}`);
      await TABLE_DDL[tableName](knex);
    }

    if (missingTables.length > 0) {
      console.log(' * Tables created.');
    }
  }

  // Always run migrations regardless of whether tables were created
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
    const hasName = await knex
      .raw("PRAGMA table_info('game_source')")
      .then((r) => r.some((col) => col.name === 'name'));
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
    await knex.raw('DROP TABLE IF EXISTS game_new');
    const gameCols = await knex.raw('PRAGMA table_info("game")').then((r) => r.map((c) => c.name));
    const dirCreatedAtCol = gameCols.includes('dir_created_at') ? 'dir_created_at DATETIME,' : '';
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
        ${dirCreatedAtCol}
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
    await knex.raw('DROP TABLE IF EXISTS adopt_cache_new');
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
    await knex.raw(
      'INSERT INTO adopt_cache_new (game_id, source_type, source_id, source_url, name, cover_url, makers, genres, tags, description, created_at, updated_at) SELECT game_id, source_type, source_id, source_url, name, cover_url, makers, genres, tags, description, created_at, updated_at FROM adopt_cache',
    );
    await knex.raw('DROP TABLE adopt_cache');
    await knex.raw('ALTER TABLE adopt_cache_new RENAME TO adopt_cache');
    await knex.raw('PRAGMA foreign_keys = ON');
    await knex('setting').insert({ key: 'migration_v5', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v5 done.');
  }

  const v6 = await knex('setting').where({ key: 'migration_v6' }).first();
  if (!v6) {
    console.log(' * Running migration v6: add dir_created_at to game...');
    const cols6 = await knex.raw('PRAGMA table_info("game")').then((r) => r.map((c) => c.name));
    if (!cols6.includes('dir_created_at')) {
      await knex.raw('ALTER TABLE game ADD COLUMN dir_created_at DATETIME');
    }
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

  // Migration v8: seed default settings for archive passwords and archived lists
  const v8 = await knex('setting').where({ key: 'migration_v8' }).first();
  if (!v8) {
    console.log(' * Running migration v8: seed default archive settings...');
    await knex('setting')
      .insert({ key: 'archive_passwords', value: JSON.stringify([]) })
      .onConflict('key')
      .ignore();
    await knex('setting')
      .insert({ key: 'archived_archives', value: JSON.stringify([]) })
      .onConflict('key')
      .ignore();
    await knex('setting')
      .insert({ key: 'archived_folders', value: JSON.stringify([]) })
      .onConflict('key')
      .ignore();
    await knex('setting')
      .insert({ key: 'extract_tools', value: JSON.stringify({}) })
      .onConflict('key')
      .ignore();
    await knex('setting')
      .insert({ key: 'compress_tools', value: JSON.stringify({}) })
      .onConflict('key')
      .ignore();
    await knex('setting').insert({ key: 'migration_v8', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v8 done.');
  }

  // Migration v9: per-language source match priority + similarity threshold
  const v9 = await knex('setting').where({ key: 'migration_v9' }).first();
  if (!v9) {
    console.log(' * Running migration v9: seed scrape match settings...');
    const matchDefaults = {
      match_priority_en: DEFAULT_MATCH_PRIORITY.en,
      match_priority_ja: DEFAULT_MATCH_PRIORITY.ja,
      match_priority_zh: DEFAULT_MATCH_PRIORITY.zh,
      match_threshold: DEFAULT_MATCH_THRESHOLD,
    };
    for (const [key, value] of Object.entries(matchDefaults)) {
      await knex('setting')
        .insert({ key, value: JSON.stringify(value) })
        .onConflict('key')
        .ignore();
    }
    await knex('setting').insert({ key: 'migration_v9', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v9 done.');
  }

  // Migration v10: add recently table (recently opened paths, capped at 100 rows)
  const v10 = await knex('setting').where({ key: 'migration_v10' }).first();
  if (!v10) {
    console.log(' * Running migration v10: add recently table...');
    await knex.raw('PRAGMA foreign_keys = OFF');
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS recently (
        game_id INTEGER PRIMARY KEY,
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES game(id) ON DELETE CASCADE
      )
    `);
    await knex.raw('PRAGMA foreign_keys = ON');
    await knex('setting').insert({ key: 'migration_v10', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v10 done.');
  }

  // Migration v11: add the DMM source to the stored match priorities.
  // `getMatchConfig()` uses a stored priority array as-is whenever it is non-empty, so
  // changing DEFAULT_MATCH_PRIORITY alone would never reach existing databases - DMM
  // would be skipped silently. Existing databases therefore have to be edited here.
  const v11 = await knex('setting').where({ key: 'migration_v11' }).first();
  if (!v11) {
    console.log(' * Running migration v11: append dmm to match priorities...');
    // The priorities that shipped before DMM existed. A stored value still equal to one of
    // these was never customised, so it is safe to replace with the new default (which puts
    // DMM where it belongs). Anything else is a deliberate user choice - only append there.
    const PREVIOUS_DEFAULTS = {
      en: ['steam', 'vndb', 'bangumi', 'dlsite'],
      ja: ['dlsite', 'bangumi', 'steam', 'vndb'],
      zh: ['steam', 'bangumi', 'dlsite', 'vndb'],
    };
    for (const lang of ['en', 'ja', 'zh']) {
      const key = `match_priority_${lang}`;
      const row = await knex('setting').where({ key }).first();
      if (!row) continue;
      try {
        const parsed = JSON.parse(row.value);
        if (!Array.isArray(parsed) || parsed.includes('dmm')) continue;
        const previous = PREVIOUS_DEFAULTS[lang];
        const untouched =
          previous.length === parsed.length && previous.every((s, i) => s === parsed[i]);
        const next = untouched ? DEFAULT_MATCH_PRIORITY[lang] : [...parsed, 'dmm'];
        await knex('setting')
          .where({ key })
          .update({ value: JSON.stringify(next) });
        console.log(
          ` *   ${key}: ${JSON.stringify(next)}${untouched ? '' : ' (customised - dmm appended)'}`,
        );
      } catch {
        // Malformed value: leave it alone, getMatchConfig() falls back to the default.
      }
    }
    await knex('setting').insert({ key: 'migration_v11', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v11 done.');
  }

  // Migration v12: game_similar - suspected-similar PAIRS of games from different vendors
  // (names >= 90%). Rows are only written for pairs that actually passed the threshold, so
  // the table doubles as the "has this pair been computed" record.
  const v12 = await knex('setting').where({ key: 'migration_v12' }).first();
  if (!v12) {
    console.log(' * Running migration v12: create game_similar table...');
    const hasSimilar = await knex.schema.hasTable('game_similar');
    if (!hasSimilar) {
      await knex.schema.createTable('game_similar', (table) => {
        table.integer('game_id_a').notNullable();
        table.integer('game_id_b').notNullable();
        table.float('score').notNullable();
        table.dateTime('created_at').defaultTo(knex.fn.now());
        table.primary(['game_id_a', 'game_id_b']);
        table.foreign('game_id_a').references('id').inTable('game').onDelete('CASCADE');
        table.foreign('game_id_b').references('id').inTable('game').onDelete('CASCADE');
      });
    }
    await knex('setting').insert({ key: 'migration_v12', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v12 done.');
  }

  // Migration v13: per-game R18 flag. Three sources write it, in priority order: vendor
  // metadata (DMM/DLsite are adult platforms outright, Bangumi carries an nsfw field per
  // subject), the in-app NSFW classifier, and a later manual override. NULL means
  // "unknown", which is what the classifier pass targets.
  const v13 = await knex('setting').where({ key: 'migration_v13' }).first();
  if (!v13) {
    console.log(' * Running migration v13: add game.r18 / game.r18_source...');
    const cols = await knex.raw('PRAGMA table_info("game")').then((r) => r.map((c) => c.name));
    if (!cols.includes('r18')) {
      await knex.raw('ALTER TABLE game ADD COLUMN r18 INTEGER');
      await knex.raw('ALTER TABLE game ADD COLUMN r18_source TEXT');
    }
    // Backfill what vendor metadata already knows: the DMM and DLsite scrapers only talk
    // to those sites' adult sections, so everything they return is R18 outright; Steam
    // entries here are the all-ages releases. Bangumi is left NULL - it needs the per
    // subject nsfw flag, which the classifier pass or a later fetch fills in.
    await knex.raw(`
      UPDATE game SET r18 = 1, r18_source = 'vendor'
      WHERE r18 IS NULL
        AND id IN (SELECT game_id FROM game_source WHERE source_type IN ('dmm', 'dlsite'))
    `);
    await knex.raw(`
      UPDATE game SET r18 = 0, r18_source = 'vendor'
      WHERE r18 IS NULL
        AND id IN (SELECT game_id FROM game_source WHERE source_type = 'steam')
    `);
    await knex('setting').insert({ key: 'migration_v13', value: '1' }).onConflict('key').ignore();
    console.log(' * Migration v13 done.');
  }
};

export { initDatabase };
