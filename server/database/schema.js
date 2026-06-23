import { knex } from './db.js';

const createSchema = () =>
  knex.schema
    .createTable('library', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.string('path').notNullable();
    })
    .createTable('maker', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.text('description');
    })
    .createTable('genre', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.text('description');
    })
    .createTable('tag', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.text('description');
    })
    .createTable('game', (table) => {
      table.increments();
      table.string('name').notNullable();
      table.text('cover_path');
      table.text('description');
      table.integer('library_id').notNullable();
      table.string('sub_path').notNullable();
      table.dateTime('created_at').defaultTo(knex.fn.now());
      table.dateTime('updated_at').defaultTo(knex.fn.now());
      table.foreign('library_id').references('id').inTable('library').onDelete('CASCADE');
    })
    .createTable('game_maker', (table) => {
      table.integer('game_id').notNullable();
      table.integer('maker_id').notNullable();
      table.primary(['game_id', 'maker_id']);
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
      table.foreign('maker_id').references('id').inTable('maker').onDelete('CASCADE');
    })
    .createTable('game_genre', (table) => {
      table.integer('game_id').notNullable();
      table.integer('genre_id').notNullable();
      table.primary(['game_id', 'genre_id']);
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
      table.foreign('genre_id').references('id').inTable('genre').onDelete('CASCADE');
    })
    .createTable('game_tag', (table) => {
      table.integer('game_id').notNullable();
      table.integer('tag_id').notNullable();
      table.primary(['game_id', 'tag_id']);
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
      table.foreign('tag_id').references('id').inTable('tag').onDelete('CASCADE');
    })
    .createTable('game_source', (table) => {
      table.increments();
      table.integer('game_id').notNullable();
      table.string('source_type').notNullable();
      table.string('source_id').notNullable();
      table.text('source_url');
      table.text('raw_data');
      table.unique(['game_id', 'source_type', 'source_id']);
      table.foreign('game_id').references('id').inTable('game').onDelete('CASCADE');
    })
    .createTable('setting', (table) => {
      table.string('key').primary();
      table.text('value').notNullable();
    })
    .createTable('search_cache', (table) => {
      table.string('key').primary();
      table.string('source').notNullable();
      table.string('keyword').notNullable();
      table.text('results').notNullable();
      table.dateTime('created_at').defaultTo(knex.fn.now());
      table.dateTime('updated_at').defaultTo(knex.fn.now());
    });

export { createSchema };
