import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EXTRACT_TOOL_PATHS, FORMAT_TOOL_PRIORITY, COMPRESS_TOOL_PATHS } from './constants.js';

// Windows console tools (unrar/rar) emit localized messages in the system codepage, not UTF-8:
// on a zh-CN install that is GBK (CP936), so plain toString() turns every Chinese message into
// mojibake ("chrome_100_percent.pak 的密码不正确" arrives as unreadable noise). Decode strictly
// as UTF-8 first (pure ASCII and real UTF-8 pass through), fall back to GBK.
const decodeConsoleText = (buf) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return buf.toString('latin1');
    }
  }
};

const tasks = new Map();
const listeners = new Set();

const notify = (task, event = 'update') => {
  for (const fn of listeners) fn(task, event);
};

const createTask = (type, meta) => {
  const task = {
    id: randomUUID(),
    type,
    status: 'pending',
    label:
      type === 'move'
        ? `Moving: ${meta.source.split('\\').pop()}`
        : type === 'similar-scan'
          ? 'Finding similar games'
          : type === 'nsfw-scan'
            ? 'Classifying covers'
            : type === 'backup'
              ? 'Backing up data'
              : `Extracting: ${meta.archivePath?.split('\\').pop() || ''}`,
    progress: 0,
    detail: 'Waiting...',
    error: null,
    createdAt: new Date(),
    completedAt: null,
    meta,
    childProcess: null,
  };
  tasks.set(task.id, task);
  notify(task);
  return task;
};

const getTask = (id) => tasks.get(id);

const getAllTasks = () => [...tasks.values()];

const updateTask = (id, patch) => {
  const task = tasks.get(id);
  if (!task) return;
  Object.assign(task, patch);
  if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'cancelled') {
    task.completedAt = new Date();
  }
  notify(task);
};

const cancelTask = (id) => {
  const task = tasks.get(id);
  if (!task || task.type === 'move') return false;
  if (task.childProcess) {
    task.childProcess.kill();
  }
  updateTask(id, { status: 'cancelled', detail: 'Cancelled' });
  // Auto-remove cancelled task after brief delay to allow SSE to send final status
  setTimeout(() => removeTask(id), 1000);
  return true;
};

const removeTask = (id) => {
  const task = tasks.get(id);
  if (!task) return false;
  if (task.status === 'running' && task.type === 'move') return false;
  if (task.childProcess && task.status === 'running') {
    task.childProcess.kill();
  }
  tasks.delete(id);
  // Say so. A removal nobody hears about leaves the row in the task panel until the client
  // reconnects and gets a fresh snapshot - which is exactly why deleting looked like it did
  // nothing, and why clicking again answered 404.
  notify(task, 'remove');
  return true;
};

const hasRunningMoveTasks = () =>
  [...tasks.values()].some((t) => t.status === 'running' && t.type === 'move');
const hasRunningTasks = () => [...tasks.values()].some((t) => t.status === 'running');

// Anything that is queued or in flight. Quitting during an extract/compress loses just as much
// work as during a move, so the exit guards must use this rather than the move-only check.
const hasActiveTasks = () =>
  [...tasks.values()].some((t) => t.status === 'running' || t.status === 'pending');

const activeTaskForGame = (gameId) =>
  [...tasks.values()].find(
    (t) => t.meta?.gameId === gameId && (t.status === 'running' || t.status === 'pending'),
  ) || null;

const onTaskChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const attachChildProcess = (id, child) => {
  const task = tasks.get(id);
  if (task) task.childProcess = child;
};

const countFilesWithRobocopy = (source, dest) => {
  return new Promise((resolve, reject) => {
    const child = spawn('robocopy', [
      source,
      dest,
      '/L',
      '/NFL',
      '/NDL',
      '/NJH',
      '/NJS',
      '/NC',
      '/NS',
      '/NP',
    ]);
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    child.on('close', () => {
      const match = output.match(
        /Total\s+Copied\s+Skipped\s+Mismatch\s+FAIL\s+Extras\s+[\r\n]+\s+Files\s*:\s*(\d+)/,
      );
      if (match) {
        resolve(parseInt(match[1], 10));
      } else {
        const newFileCount = (output.match(/New File/g) || []).length;
        resolve(newFileCount || 1);
      }
    });
    child.on('error', reject);
  });
};

const updateGameAfterMove = async (gameId, newLibraryId, newSubPath, taskId) => {
  try {
    const db = await import('./database/db.js');
    await db.updateGame(gameId, { library_id: newLibraryId, sub_path: newSubPath });
  } catch (err) {
    // The files are already at their new location, so this is not a failed move.
    // Report it as a record-update problem and make sure the task leaves "running".
    updateTask(taskId, {
      status: 'failed',
      error: `Files moved, but the game record could not be updated: ${err.message}`,
      detail: 'Move completed, record not updated',
    });
    return;
  }
  updateTask(taskId, {
    status: 'completed',
    progress: 100,
    detail: 'Move completed',
    completedAt: new Date(),
  });
};

const executeMoveTask = async (taskId, source, dest, gameId, newLibraryId, newSubPath) => {
  const sourceDrive = source.substring(0, 1).toLowerCase();
  const destDrive = dest.substring(0, 1).toLowerCase();

  if (sourceDrive === destDrive) {
    if (fs.existsSync(dest)) {
      updateTask(taskId, {
        status: 'failed',
        error: 'Target already exists',
        detail: 'Rename failed',
      });
      return;
    }
    updateTask(taskId, { status: 'running', detail: 'Renaming...', progress: 50 });
    try {
      await fs.promises.rename(source, dest);
    } catch (err) {
      updateTask(taskId, { status: 'failed', error: err.message, detail: 'Rename failed' });
      return;
    }
    // Only reached once the files really are at the new path - see updateGameAfterMove().
    await updateGameAfterMove(gameId, newLibraryId, newSubPath, taskId);
    return;
  }

  updateTask(taskId, { status: 'running', detail: 'Scanning files...', progress: 0 });

  // A single-file move (archive relocate) cannot use directory robocopy flags: source and dest
  // must be passed as directories plus the file name, and the non-empty check below does not
  // apply - the route settles overwrite conflicts before creating this task.
  const isFileMove = getTask(taskId)?.meta?.isFile === true;

  const destExists = fs.existsSync(dest);
  if (destExists && !isFileMove) {
    const files = fs.readdirSync(dest);
    if (files.length > 0) {
      updateTask(taskId, {
        status: 'failed',
        error: 'Target already exists and is not empty',
        detail: 'Move failed',
      });
      return;
    }
  }

  try {
    const totalFiles = isFileMove ? 1 : await countFilesWithRobocopy(source, dest);
    updateTask(taskId, {
      meta: { ...getTask(taskId).meta, totalFiles },
      detail: `Found ${totalFiles} files`,
    });

    const logFile = path.join(os.tmpdir(), `robocopy-${taskId}.log`);
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

    const child = spawn(
      'robocopy',
      isFileMove
        ? [
            path.dirname(source),
            path.dirname(dest),
            path.basename(source),
            '/COPY:DAT',
            '/R:3',
            '/W:5',
            '/NP',
            `/LOG+:${logFile}`,
          ]
        : [source, dest, '/E', '/COPY:DAT', '/MT:8', '/R:3', '/W:5', '/NP', `/LOG+:${logFile}`],
    );

    attachChildProcess(taskId, child);

    let copiedFiles = 0;
    let lastSize = 0;
    const pollInterval = setInterval(() => {
      try {
        const stat = fs.statSync(logFile);
        if (stat.size > lastSize) {
          lastSize = stat.size;
          const content = fs.readFileSync(logFile, 'utf-8');
          const newFileCount = (content.match(/New File/g) || []).length;
          if (newFileCount > copiedFiles) {
            copiedFiles = newFileCount;
            const progress =
              totalFiles > 0 ? Math.min(99, Math.round((copiedFiles / totalFiles) * 100)) : 0;
            updateTask(taskId, {
              progress,
              detail: `Copying ${copiedFiles}/${totalFiles}`,
              meta: { ...getTask(taskId).meta, copiedFiles },
            });
          }
        }
      } catch {
        /* log file may not exist yet */
      }
    }, 1000);

    child.on('close', (code) => {
      clearInterval(pollInterval);
      try {
        fs.unlinkSync(logFile);
      } catch {
        /* ignore cleanup error */
      }

      if (code <= 7) {
        updateTask(taskId, { progress: 99, detail: 'Deleting source...' });
        fs.promises
          .rm(source, { recursive: true, force: true })
          .then(() => updateGameAfterMove(gameId, newLibraryId, newSubPath, taskId))
          .catch((err) =>
            updateTask(taskId, {
              status: 'failed',
              error: `Source deletion failed: ${err.message}`,
              detail: 'Move completed but source deletion failed',
            }),
          );
      } else {
        updateTask(taskId, {
          status: 'failed',
          error: `robocopy exited with code ${code}`,
          detail: 'Move failed',
        });
        if (fs.existsSync(dest)) {
          try {
            fs.rmSync(dest, { recursive: true, force: true });
          } catch {
            /* ignore cleanup error */
          }
        }
      }
    });

    child.on('error', (err) => {
      clearInterval(pollInterval);
      updateTask(taskId, {
        status: 'failed',
        error: err.message,
        detail: 'Failed to start robocopy',
      });
    });
  } catch (err) {
    updateTask(taskId, { status: 'failed', error: err.message, detail: 'Scan failed' });
  }
};

const detectExtractTools = () => {
  const found = {};
  for (const [tool, paths] of Object.entries(EXTRACT_TOOL_PATHS)) {
    for (const p of paths) {
      if (fs.existsSync(p)) {
        found[tool] = p;
        break;
      }
    }
  }
  return found;
};

const getEffectiveTools = async () => {
  const db = await import('./database/db.js');
  const savedStr = await db.getSetting('extract_tools');
  if (savedStr) {
    try {
      const saved = JSON.parse(savedStr);
      // Only use saved tools if at least one tool is configured
      if (saved && Object.keys(saved).length > 0) {
        return saved;
      }
    } catch {
      /* invalid JSON, fall through to detect */
    }
  }
  return detectExtractTools();
};

const selectTool = (ext, tools) => {
  const priority = FORMAT_TOOL_PRIORITY[ext];
  if (!priority) return null;
  for (const toolName of priority) {
    if (tools[toolName]) return { name: toolName, path: tools[toolName] };
  }
  return null;
};

const tryExtract = (taskId, tool, archivePath, dest, password) => {
  return new Promise((resolve) => {
    let args;
    if (tool.name === 'unrar') {
      if (password) {
        args = ['x', `-p${password}`, '-o+', '-y', archivePath, dest + '\\'];
      } else {
        args = ['x', '-o+', '-y', archivePath, dest + '\\'];
      }
    } else {
      args = ['x', password ? `-p${password}` : '-p0', `-o${dest}`, '-aoa', archivePath];
    }

    const child = spawn(tool.path, args, {
      // Windows: prevent blocking on stdin when password needed
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    attachChildProcess(taskId, child);

    // Timeout: 10 minutes max per password attempt
    const timeout = setTimeout(
      () => {
        child.kill('SIGTERM');
        updateTask(taskId, {
          status: 'failed',
          error: 'Extraction timeout',
          detail: 'Extraction timed out',
        });
        resolve({ status: 'error', stderrText: '' });
      },
      10 * 60 * 1000,
    );

    let lastProgress = 0;
    child.stdout.on('data', (data) => {
      const text = decodeConsoleText(data);
      const match = text.match(/(\d+)%/);
      if (match) {
        const p = parseInt(match[1], 10);
        if (p > lastProgress) {
          lastProgress = p;
          updateTask(taskId, { progress: p, detail: `Extracting ${p}%` });
        }
      }
    });

    // stderr is kept as raw chunks and decoded once at close: splitting a GBK character across
    // chunk boundaries would corrupt a per-chunk decode, and the text is only needed at the end.
    const stderrChunks = [];
    child.stderr.on('data', (data) => {
      stderrChunks.push(data);
      console.log(`[extract:${taskId}] stderr: ${decodeConsoleText(data).trim()}`);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const stderrText = decodeConsoleText(Buffer.concat(stderrChunks));
      console.log(`[extract:${taskId}] exit code: ${code}, stderr: ${stderrText.trim()}`);
      if (code === 0 || (tool.name === 'unrar' && code === 1)) {
        resolve({ status: 'success', stderrText });
      } else if (
        (tool.name === 'unrar' && (code === 3 || code === 11 || code === 12)) ||
        (tool.name !== 'unrar' && code === 2)
      ) {
        // unrar exit codes: 11 = wrong password (RAR5), 3 = CRC error, which is how a wrong
        // password surfaces on old RAR2/3 archives, 12 = password prompt aborted because stdin
        // is closed. Exit 2 is a genuine fatal error (e.g. corrupt archive) and must surface
        // as-is instead of burning the password list and ending as "All passwords failed".
        resolve({ status: 'wrong_password', stderrText });
      } else {
        const task = getTask(taskId);
        if (task && task.status === 'cancelled') {
          resolve({ status: 'error', stderrText });
          return;
        }
        updateTask(taskId, {
          status: 'failed',
          error: `Exit code ${code}: ${stderrText}`,
          detail: 'Extraction failed',
        });
        resolve({ status: 'error', stderrText });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      updateTask(taskId, {
        status: 'failed',
        error: err.message,
        detail: 'Failed to start extraction tool',
      });
      resolve({ status: 'error', stderrText: '' });
    });
  });
};

const executeExtractTask = async (taskId, archivePath, dest, gameId, newLibraryId, newSubPath) => {
  try {
    // Nothing to extract: fail here rather than let a doomed run reach the cleanup step below,
    // which is what removed a user's folder when the archive had already been deleted by hand.
    if (!fs.existsSync(archivePath)) {
      updateTask(taskId, {
        status: 'failed',
        error: 'Source archive not found',
        detail: 'Extraction failed',
      });
      return;
    }

    const ext = path.extname(archivePath).toLowerCase();
    const tools = await getEffectiveTools();
    const tool = selectTool(ext, tools);

    if (!tool) {
      updateTask(taskId, {
        status: 'failed',
        error: `No extraction tool found for ${ext}`,
        detail: 'No tool available',
      });
      return;
    }

    const db = await import('./database/db.js');
    const passwordsStr = await db.getSetting('archive_passwords');
    const passwords = passwordsStr ? JSON.parse(passwordsStr) : [];
    const allPasswords = [null, ...passwords];

    updateTask(taskId, {
      status: 'running',
      detail: `Extracting with ${tool.name}...`,
      progress: 0,
    });

    // Only a directory this task is responsible for may be removed on failure or cancellation:
    // one that did not exist or was empty when the run started. Anything else is the user's own
    // data - a hand-extracted copy, or a folder they confirmed with force - and a failed password
    // or a missing volume must not turn into a wipe. The failure is reported on the task instead.
    let destWasEmpty = false;
    try {
      destWasEmpty = !fs.existsSync(dest) || fs.readdirSync(dest).length === 0;
    } catch {
      destWasEmpty = false;
    }

    const cleanupDest = async () => {
      if (!destWasEmpty) return;
      try {
        if (fs.existsSync(dest)) {
          await fs.promises.rm(dest, { recursive: true, force: true });
        }
      } catch {
        /* ignore cleanup errors */
      }
    };

    let lastPasswordStderr = '';
    for (const pwd of allPasswords) {
      const task = getTask(taskId);
      if (task?.status === 'cancelled') {
        await cleanupDest();
        return;
      }
      const { status, stderrText } = await tryExtract(taskId, tool, archivePath, dest, pwd);
      if (status === 'success') {
        const archiveSubPath = getTask(taskId).meta.archiveSubPath;
        if (archiveSubPath) {
          const archivedStr = await db.getSetting('archived_archives');
          const archived = archivedStr ? JSON.parse(archivedStr) : [];
          if (!archived.includes(archiveSubPath)) {
            archived.push(archiveSubPath);
            await db.setSetting('archived_archives', JSON.stringify(archived));
          }
        }
        await db.updateGame(gameId, { library_id: newLibraryId, sub_path: newSubPath });
        updateTask(taskId, {
          status: 'completed',
          progress: 100,
          detail: 'Extraction completed',
          completedAt: new Date(),
        });
        return;
      }
      if (status === 'error') {
        await cleanupDest();
        return;
      }
      // 'wrong_password': remember what unrar actually said ("...的密码不正确") so that when
      // every password has been tried the final failure carries the real reason, not just a
      // generic message. Capped because one wrong-password run can emit a line per file.
      if (stderrText && stderrText.trim()) {
        lastPasswordStderr = stderrText.trim();
      }
    }

    await cleanupDest();
    updateTask(taskId, {
      status: 'failed',
      error: lastPasswordStderr
        ? `All passwords failed. Last attempt: ${lastPasswordStderr.slice(0, 400)}`
        : 'All passwords failed',
      detail: 'No matching password found',
    });
  } catch (err) {
    updateTask(taskId, { status: 'failed', error: err.message, detail: 'Extraction task crashed' });
  }
};

const detectCompressTools = () => {
  const found = {};
  for (const [tool, paths] of Object.entries(COMPRESS_TOOL_PATHS)) {
    for (const p of paths) {
      if (fs.existsSync(p)) {
        found[tool] = p;
        break;
      }
    }
  }
  return found;
};

const getEffectiveCompressTools = async () => {
  const db = await import('./database/db.js');
  const savedStr = await db.getSetting('compress_tools');
  if (savedStr) {
    try {
      const saved = JSON.parse(savedStr);
      // Only use saved tools if at least one tool is configured
      if (saved && Object.keys(saved).length > 0) {
        return saved;
      }
    } catch {
      /* invalid JSON, fall through to detect */
    }
  }
  return detectCompressTools();
};

const selectCompressTool = (tools) => {
  if (tools.winrar) return { name: 'winrar', path: tools.winrar };
  return null;
};

const tryCompress = (taskId, tool, sourceDir, destArchive) => {
  return new Promise((resolve) => {
    const args = ['a', '-r', '-ep1', '-idq', '-m0', destArchive, `${sourceDir}\\*`];

    const child = spawn(tool.path, args);
    attachChildProcess(taskId, child);

    const stderrChunks = [];
    child.stderr.on('data', (data) => {
      stderrChunks.push(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve('success');
      } else {
        const task = getTask(taskId);
        if (task && task.status === 'cancelled') {
          resolve('error');
          return;
        }
        updateTask(taskId, {
          status: 'failed',
          error: `Exit code ${code}: ${decodeConsoleText(Buffer.concat(stderrChunks))}`,
          detail: 'Compression failed',
        });
        resolve('error');
      }
    });

    child.on('error', (err) => {
      updateTask(taskId, {
        status: 'failed',
        error: err.message,
        detail: 'Failed to start compression tool',
      });
      resolve('error');
    });
  });
};

const tryTestArchive = (taskId, tool, archivePath) => {
  return new Promise((resolve) => {
    const args = ['t', '-idq', archivePath];

    const child = spawn(tool.path, args);
    attachChildProcess(taskId, child);

    const stderrChunks = [];
    child.stderr.on('data', (data) => {
      stderrChunks.push(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve('success');
      } else {
        updateTask(taskId, {
          status: 'failed',
          error: `Archive test failed (exit ${code}): ${decodeConsoleText(Buffer.concat(stderrChunks))}`,
          detail: 'Archive integrity test failed',
        });
        resolve('error');
      }
    });

    child.on('error', (err) => {
      updateTask(taskId, {
        status: 'failed',
        error: err.message,
        detail: 'Failed to start archive test',
      });
      resolve('error');
    });
  });
};

const executeCompressTask = async (
  taskId,
  sourceDir,
  destArchive,
  gameId,
  newLibraryId,
  newSubPath,
  sourceSubPath,
) => {
  try {
    const tools = await getEffectiveCompressTools();
    const tool = selectCompressTool(tools);

    if (!tool) {
      updateTask(taskId, {
        status: 'failed',
        error: 'No compression tool found (WinRAR rar.exe required)',
        detail: 'No tool available',
      });
      return;
    }

    const db = await import('./database/db.js');

    updateTask(taskId, {
      status: 'running',
      detail: `Compressing with ${tool.name}...`,
      progress: 0,
    });

    // Delete existing destination file if it exists (route handles conflict check when force=false)
    try {
      if (fs.existsSync(destArchive)) {
        await fs.promises.rm(destArchive, { force: true });
      }
    } catch {
      /* ignore cleanup errors */
    }

    const cleanupDest = async () => {
      try {
        if (fs.existsSync(destArchive)) {
          await fs.promises.rm(destArchive, { force: true });
        }
      } catch {
        /* ignore cleanup errors */
      }
    };

    const compressResult = await tryCompress(taskId, tool, sourceDir, destArchive);
    if (compressResult !== 'success') {
      await cleanupDest();
      return;
    }

    updateTask(taskId, { progress: 50, detail: 'Testing archive integrity...' });

    const testResult = await tryTestArchive(taskId, tool, destArchive);
    if (testResult !== 'success') {
      await cleanupDest();
      return;
    }

    if (sourceSubPath) {
      const archivedStr = await db.getSetting('archived_folders');
      const archived = archivedStr ? JSON.parse(archivedStr) : [];
      if (!archived.includes(sourceSubPath)) {
        archived.push(sourceSubPath);
        await db.setSetting('archived_folders', JSON.stringify(archived));
      }
    }

    await db.updateGame(gameId, { library_id: newLibraryId, sub_path: newSubPath });
    updateTask(taskId, {
      status: 'completed',
      progress: 100,
      detail: 'Compression completed',
      completedAt: new Date(),
    });
  } catch (err) {
    updateTask(taskId, {
      status: 'failed',
      error: err.message,
      detail: 'Compression task crashed',
    });
  }
};

export {
  createTask,
  getTask,
  getAllTasks,
  updateTask,
  cancelTask,
  removeTask,
  hasRunningMoveTasks,
  hasRunningTasks,
  hasActiveTasks,
  activeTaskForGame,
  onTaskChange,
  attachChildProcess,
  executeMoveTask,
  executeExtractTask,
  executeCompressTask,
  tryExtract,
  detectExtractTools,
  getEffectiveTools,
  selectTool,
  detectCompressTools,
  getEffectiveCompressTools,
  selectCompressTool,
  decodeConsoleText,
};
