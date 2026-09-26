import express from 'express';
import * as db from '../database/db.js';

const router = express.Router();

// The source name (scraped title) is what the grid displays, same as the game list.
const attachDisplayNames = async (games) => {
  if (games.length === 0) return games;
  const ids = games.map((g) => g.id);
  const sources = await db.knex('game_source')
    .whereIn('game_id', ids)
    .whereNotNull('name')
    .orderBy('id')
    .select('game_id', 'name');
  const nameMap = {};
  for (const s of sources) {
    if (!nameMap[s.game_id]) nameMap[s.game_id] = s.name;
  }
  return games.map((g) => ({ ...g, sourceName: nameMap[g.id] || null }));
};

router.get('/', async (_req, res, next) => {
  try {
    const games = await db.getRecently();
    res.send({ games: await attachDisplayNames(games) });
  } catch (err) {
    next(err);
  }
});

router.post('/:gameId', async (req, res, next) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) {
      return res.status(400).send({ error: 'gameId must be a positive integer' });
    }
    const ok = await db.touchRecently(gameId);
    if (!ok) {
      return res.status(404).send({ error: 'Game not found' });
    }
    res.status(200).send({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:gameId', async (req, res, next) => {
  try {
    await db.removeRecently(Number(req.params.gameId));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (_req, res, next) => {
  try {
    await db.clearRecently();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
