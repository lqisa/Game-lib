import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as db from './database/db.js';
import { getDataDir } from './config.js';
import {
  createTask,
  getTask,
  getAllTasks,
  updateTask,
  attachChildProcess,
  getEffectiveCompressTools,
  selectCompressTool,
} from './tasks.js';

const BACKUP_NAME_PREFIX = 'game-lib-data-backup-';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_KEEP = 10;

// Windows filenames cannot contain ":", so the wall-clock stamp uses dashes throughout:
// game-lib-data-backup-2026-10-05-14-30-25.rar
const timestampForName = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
};

const formatSize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const readBackupSetting = async (key, fallback) => {
  const value = await db.getSetting(key);
  return value === null || value === undefined || value === '' ? fallback : value;
};

const hasRunningBackup = () =>
  getAllTasks().some(
    (t) => t.type === 'backup' && (t.status === 'pending' || t.status === 'running'),
  );

// Keep only the newest N rars; anything older than backup_keep is deleted. Runs after every
// successful backup so the retention also catches manually copied-in files on the next round.
const pruneOldBackups = async (backupDir) => {
  const keepRaw = await readBackupSetting('backup_keep', DEFAULT_KEEP);
  const keep = Math.max(1, Number.parseInt(keepRaw, 10) || DEFAULT_KEEP);
  let names;
  try {
    names = fs.readdirSync(backupDir);
  } catch {
    return;
  }
  const backups = names
    .filter((name) => name.startsWith(BACKUP_NAME_PREFIX) && name.toLowerCase().endsWith('.rar'))
    .map((name) => {
      const full = path.join(backupDir, name);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        /* unreadable: sorts oldest, so a stale entry gets retried next round */
      }
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  for (const stale of backups.slice(keep)) {
    try {
      fs.rmSync(stale.full, { force: true });
      console.log(` * [backup] pruned old backup: ${path.basename(stale.full)}`);
    } catch (err) {
      console.warn(`[backup] could not prune ${stale.full}:`, err.message);
    }
  }
};

const runBackup = async (trigger) => {
  if (hasRunningBackup()) return null;
  const backupDir = await readBackupSetting('backup_dir', '');
  // Callers validate this differently: the manual route answers 400, the scheduler skips
  // silently. Reaching here with an empty directory means neither check ran.
  if (!backupDir) return null;

  const task = createTask('backup', { trigger });
  updateTask(task.id, { status: 'running', progress: 5, detail: 'Creating database snapshot...' });

  const tmpDir = path.join(os.tmpdir(), `game-lib-backup-${Date.now()}`);
  const snapshotPath = path.join(tmpDir, 'db.sqlite3');
  const destRar = path.join(backupDir, `${BACKUP_NAME_PREFIX}${timestampForName()}.rar`);
  const coversDir = path.join(getDataDir(), 'covers');

  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(coversDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    // VACUUM INTO reads the live database through one read transaction and writes a fresh,
    // self-contained file - WAL content included, without touching db.sqlite3/-wal/-shm.
    // (target-db.js does the same for its maintenance snapshots.)
    await db.knex.raw('VACUUM INTO ?', [snapshotPath]);

    updateTask(task.id, { progress: 40, detail: 'Packing snapshot and covers (store mode)...' });

    const tools = await getEffectiveCompressTools();
    const tool = selectCompressTool(tools);
    if (!tool) {
      throw new Error('rar.exe not found - install WinRAR or configure compress_tools in settings');
    }

    // -m0 = store (no compression, covers are already compressed images); -ep1 = strip the
    // source paths so the rar root holds db.sqlite3 and covers/ directly; -idq = quiet.
    await new Promise((resolve, reject) => {
      const args = ['a', '-m0', '-r', '-ep1', '-idq', destRar, snapshotPath, coversDir];
      const child = spawn(tool.path, args);
      attachChildProcess(task.id, child);
      let stderrText = '';
      child.stderr.on('data', (data) => {
        stderrText += data.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        // cancelTask kills the child process and records the cancellation itself; a non-zero
        // exit from that kill must not overwrite the status.
        const current = getTask(task.id);
        if (current && current.status === 'cancelled') {
          resolve();
          return;
        }
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`rar exited with code ${code}: ${stderrText.trim().slice(-500)}`));
        }
      });
    });

    if (getTask(task.id)?.status === 'cancelled') return task;

    const size = fs.statSync(destRar).size;
    await pruneOldBackups(backupDir);
    updateTask(task.id, {
      status: 'completed',
      progress: 100,
      detail: `Backup completed: ${path.basename(destRar)} (${formatSize(size)})`,
    });
    return task;
  } catch (err) {
    const current = getTask(task.id);
    if (!current || current.status !== 'cancelled') {
      updateTask(task.id, { status: 'failed', error: err.message, detail: 'Backup failed' });
    }
    return task;
  } finally {
    // The temp snapshot always goes; the rar only survives a completed run (failed and
    // cancelled runs must not leave a truncated archive behind).
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* nothing to clean */
    }
    try {
      const current = getTask(task.id);
      if (!current || current.status !== 'completed') fs.rmSync(destRar, { force: true });
    } catch {
      /* nothing to clean */
    }
    // Written after every attempt (success, failure, cancel) so the scheduler measures from
    // the last try - and a manual backup resets the daily/weekly window too.
    try {
      await db.setSetting('backup_last_run', new Date().toISOString());
    } catch (err) {
      console.warn('[backup] could not record backup_last_run:', err.message);
    }
  }
};

// "Due" is interval-based: daily = 24h since the last attempt, weekly = 7d. No cron and no
// system scheduler - the check simply re-runs every hour while the app is open, so a backup
// that was missed while the app was closed fires shortly after launch.
const isDue = (schedule, lastRunIso) => {
  if (schedule !== 'daily' && schedule !== 'weekly') return false;
  if (!lastRunIso) return true;
  const last = Date.parse(lastRunIso);
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= (schedule === 'daily' ? DAY_MS : 7 * DAY_MS);
};

const checkAndRun = async () => {
  try {
    const schedule = await readBackupSetting('backup_schedule', 'off');
    if (!isDue(schedule, await db.getSetting('backup_last_run'))) return;
    const backupDir = await readBackupSetting('backup_dir', '');
    if (!backupDir) return;
    const task = await runBackup('scheduled');
    if (task) console.log(` * [backup] scheduled backup started (${task.id})`);
  } catch (err) {
    console.warn('[backup] scheduled check failed:', err.message || err);
  }
};

let schedulerStarted = false;

const startBackupScheduler = () => {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log(' * [backup] scheduler started (startup check + hourly re-check)');
  void checkAndRun();
  setInterval(() => void checkAndRun(), HOUR_MS);
};

export { runBackup, hasRunningBackup, startBackupScheduler };
