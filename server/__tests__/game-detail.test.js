import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool, knex } from '../database/db.js';

describe('getGameDetail is_archived', () => {
  let libId;
  let gameId;

  before(async () => {
    await initDatabase();
    const [row] = await knex('library').insert({ name: 'DetailTestLib', path: 'D:\\DetailTest' }, [
      'id',
    ]);
    libId = row.id || row;
    const [gameRow] = await knex('game').insert(
      { name: 'DetailTest Game', library_id: libId, sub_path: 'DetailTest Game' },
      ['id'],
    );
    gameId = gameRow.id || gameRow;
  });

  after(async () => {
    await knex('archive')
      .where({ game_id: gameId })
      .del()
      .catch(() => {});
    await knex('game')
      .where({ id: gameId })
      .del()
      .catch(() => {});
    await knex('library')
      .where({ id: libId })
      .del()
      .catch(() => {});
    await closePool();
  });

  it('reports false for a game that was never archived', async () => {
    const detail = await db.getGameDetail(gameId);
    assert.equal(detail.is_archived, false);
  });

  it('reports true once the game is archived', async () => {
    await db.addArchived(gameId);
    const detail = await db.getGameDetail(gameId);
    assert.equal(detail.is_archived, true);
  });

  it('reports false again after unarchiving', async () => {
    await db.removeArchived(gameId);
    const detail = await db.getGameDetail(gameId);
    assert.equal(detail.is_archived, false);
  });
});
