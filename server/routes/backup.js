import express from 'express';
import * as db from '../database/db.js';
import { runBackup, hasRunningBackup } from '../backup.js';

const router = express.Router();

// Manual trigger. This only starts the backup - progress, success and failure arrive as task
// updates over the SSE stream, like any other background task.
router.post('/run', async (req, res, next) => {
  try {
    if (hasRunningBackup()) {
      return res.status(409).send({ error: 'A backup is already running' });
    }
    const backupDir = await db.getSetting('backup_dir');
    if (!backupDir || !backupDir.trim()) {
      return res.status(400).send({ error: 'Backup directory is not configured' });
    }
    const task = await runBackup('manual');
    if (!task) {
      return res.status(409).send({ error: 'A backup is already running' });
    }
    res.status(200).send({ taskId: task.id });
  } catch (err) {
    next(err);
  }
});

export default router;
