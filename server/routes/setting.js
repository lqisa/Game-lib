import express from 'express';
import * as db from '../database/db.js';
import { detectExtractTools, getEffectiveTools } from '../tasks.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const settings = await db.getAllSettings();
    res.send(settings);
  } catch (err) {
    next(err);
  }
});

router.get('/archived-archives/list', async (_req, res, next) => {
  try {
    const val = await db.getSetting('archived_archives');
    res.send(val ? JSON.parse(val) : []);
  } catch (err) { next(err); }
});

router.post('/archived-archives/add', async (req, res, next) => {
  try {
    const { path: archivePath } = req.body;
    if (!archivePath) return res.status(400).send({ error: 'path is required' });
    const val = await db.getSetting('archived_archives');
    const list = val ? JSON.parse(val) : [];
    if (!list.includes(archivePath)) {
      list.push(archivePath);
      await db.setSetting('archived_archives', JSON.stringify(list));
    }
    res.send(list);
  } catch (err) { next(err); }
});

router.delete('/archived-archives/remove/:index', async (req, res, next) => {
  try {
    const idx = Number(req.params.index);
    const val = await db.getSetting('archived_archives');
    const list = val ? JSON.parse(val) : [];
    if (idx >= 0 && idx < list.length) {
      list.splice(idx, 1);
      await db.setSetting('archived_archives', JSON.stringify(list));
    }
    res.send(list);
  } catch (err) { next(err); }
});

router.get('/archive-passwords/list', async (_req, res, next) => {
  try {
    const val = await db.getSetting('archive_passwords');
    res.send(val ? JSON.parse(val) : []);
  } catch (err) { next(err); }
});

router.put('/archive-passwords/save', async (req, res, next) => {
  try {
    const { passwords } = req.body;
    if (!Array.isArray(passwords)) return res.status(400).send({ error: 'passwords must be an array' });
    await db.setSetting('archive_passwords', JSON.stringify(passwords));
    res.send(passwords);
  } catch (err) { next(err); }
});

router.get('/detect-tools', (_req, res) => {
  res.send(detectExtractTools());
});

router.get('/extract-tools/list', async (_req, res, next) => {
  try {
    // getEffectiveTools() falls back to on-disk detection when the saved value is
    // missing or an empty object (the empty object is what migration v8 seeds).
    res.send(await getEffectiveTools());
  } catch (err) { next(err); }
});

router.put('/extract-tools/save', async (req, res, next) => {
  try {
    const { tools } = req.body;
    if (!tools || typeof tools !== 'object') return res.status(400).send({ error: 'tools object is required' });
    await db.setSetting('extract_tools', JSON.stringify(tools));
    res.send(tools);
  } catch (err) { next(err); }
});

router.get('/:key', async (req, res, next) => {
  try {
    const value = await db.getSetting(req.params.key);
    if (value === null) {
      return res.status(404).send({ error: 'Setting not found' });
    }
    res.send({ key: req.params.key, value });
  } catch (err) {
    next(err);
  }
});

router.put('/:key', async (req, res, next) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).send({ error: 'value is required' });
    }
    await db.setSetting(req.params.key, String(value));
    res.send({ key: req.params.key, value: String(value) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:key', async (req, res, next) => {
  try {
    await db.knex('setting').where({ key: req.params.key }).del();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;