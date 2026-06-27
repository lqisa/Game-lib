import express from 'express';
import * as db from '../database/db.js';

const normalizePath = (p) => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');

const checkNestedLibrary = async (newPath, excludeId) => {
  const libraries = await db.getLibraries();
  const newNorm = normalizePath(newPath);

  for (const lib of libraries) {
    if (excludeId && lib.id === excludeId) continue;
    const libNorm = normalizePath(lib.path);
    if (newNorm.startsWith(libNorm + '\\')) {
      return { conflict: 'child', parentLib: lib };
    }
    if (libNorm.startsWith(newNorm + '\\')) {
      return { conflict: 'parent', childLib: lib };
    }
  }
  return null;
};

const migrateDroppedGames = async (libraryId, libraryPath) => {
  const libPrefix = libraryPath.replace(/\//g, '\\').replace(/\\+$/, '');
  const libNorm = normalizePath(libraryPath);

  const droppedGames = await db.knex('game').whereNull('library_id').select('id', 'sub_path');

  const toUpdate = [];
  for (const game of droppedGames) {
    const gameNorm = normalizePath(game.sub_path);
    if (gameNorm.startsWith(libNorm + '\\')) {
      const subPath = game.sub_path.replace(/\//g, '\\').substring(libPrefix.length + 1);
      toUpdate.push({ id: game.id, subPath });
    }
  }

  if (toUpdate.length > 0) {
    await db.knex.transaction(async (trx) => {
      for (const item of toUpdate) {
        await trx('game').where({ id: item.id }).update({
          library_id: libraryId,
          sub_path: item.subPath,
        });
      }
    });
  }

  return toUpdate.length;
};

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const libraries = await db.getLibraries();
    res.send(libraries);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, path } = req.body;
    if (!name) {
      return res.status(400).send({ error: 'name is required' });
    }
    const nested = await checkNestedLibrary(path || '');
    if (nested) {
      return res.status(400).send({
        error: nested.conflict === 'child'
          ? `Path is a subdirectory of library "${nested.parentLib.name}"`
          : `Path contains existing library "${nested.childLib.name}"`,
      });
    }
    const [id] = await db.insertLibrary({ name, path: path || '' });
    await migrateDroppedGames(id, path || '');
    const library = await db.knex('library').where({ id }).first();
    res.status(201).send(library);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, path } = req.body;
    const nested = await checkNestedLibrary(path, Number(id));
    if (nested) {
      return res.status(400).send({
        error: nested.conflict === 'child'
          ? `Path is a subdirectory of library "${nested.parentLib.name}"`
          : `Path contains existing library "${nested.childLib.name}"`,
      });
    }
    const oldLib = await db.knex('library').where({ id: Number(id) }).first();
    await db.updateLibrary(Number(id), { name, path });
    if (path && path !== oldLib.path) {
      const oldPrefix = oldLib.path.replace(/\//g, '\\').replace(/\\+$/, '');
      const newNorm = normalizePath(path);
      const newPrefix = path.replace(/\//g, '\\').replace(/\\+$/, '');

      const currentGames = await db.knex('game').where({ library_id: Number(id) }).select('id', 'sub_path');

      if (currentGames.length > 0) {
        await db.knex.transaction(async (trx) => {
          for (const game of currentGames) {
            const absPath = oldPrefix + '\\' + game.sub_path.replace(/\//g, '\\');
            const absNorm = normalizePath(absPath);

            if (absNorm.startsWith(newNorm + '\\')) {
              const newSubPath = absPath.substring(newPrefix.length + 1);
              await trx('game').where({ id: game.id }).update({ sub_path: newSubPath });
            } else {
              await trx('game').where({ id: game.id }).update({
                library_id: null,
                sub_path: absPath,
              });
            }
          }
        });
      }

      await migrateDroppedGames(Number(id), path);
    }
    const library = await db.knex('library').where({ id }).first();
    res.send(library);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.deleteLibrary(Number(id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;