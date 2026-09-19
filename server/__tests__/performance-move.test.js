import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createTask,
  getTask,
  getAllTasks,
  updateTask,
  removeTask,
  onTaskChange,
} from '../tasks.js';

const cleanupTasks = () => {
  for (const t of getAllTasks()) {
    if (t.status === 'running' && t.type === 'move') {
      updateTask(t.id, { status: 'completed' });
    }
    removeTask(t.id);
  }
};

const waitFor = (fn, timeout = 60000, interval = 300) => new Promise((resolve, reject) => {
  const start = Date.now();
  const check = () => {
    const result = fn();
    if (result) return resolve(result);
    if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
    setTimeout(check, interval);
  };
  check();
});

describe('Performance: Large File Set Move', () => {
  it('should track progress for 500 files without losing events', async () => {
    cleanupTasks();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-perf-'));
    const sourceDir = path.join(tmpDir, 'source');
    const destDir = path.join(tmpDir, 'dest');
    fs.mkdirSync(sourceDir, { recursive: true });

    const fileCount = 500;
    for (let i = 0; i < fileCount; i++) {
      fs.writeFileSync(path.join(sourceDir, `file_${String(i).padStart(4, '0')}.dat`), Buffer.alloc(256, i % 256));
    }

    const task = createTask('move', {
      source: sourceDir,
      dest: destDir,
      gameId: -1,
    });

    const progressUpdates = [];
    const unsub = onTaskChange((t) => {
      if (t.id === task.id && t.progress > 0) {
        progressUpdates.push({ progress: t.progress, detail: t.detail, time: Date.now() });
      }
    });

    const { executeMoveTask } = await import('../tasks.js');
    void executeMoveTask(task.id, sourceDir, destDir, -1, null, 'perf_test');

    const finalTask = await waitFor(() => {
      const t = getTask(task.id);
      return (t && (t.status === 'completed' || t.status === 'failed')) ? t : null;
    }, 120000);

    unsub();

    assert.equal(finalTask.status, 'completed', `Move failed: ${finalTask.error}`);
    assert.equal(finalTask.progress, 100);

    assert.ok(progressUpdates.length > 0, 'Should have at least one progress update');
    assert.ok(progressUpdates[progressUpdates.length - 1].progress >= 99, 'Last progress should be near 100');

    for (const update of progressUpdates) {
      assert.ok(update.progress >= 0 && update.progress <= 100, `Invalid progress: ${update.progress}`);
    }

    const destFiles = fs.readdirSync(destDir);
    assert.ok(destFiles.length >= fileCount, `Expected ${fileCount} files, got ${destFiles.length}`);

    cleanupTasks();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('should handle deeply nested directory structure', async () => {
    cleanupTasks();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-perf-'));
    const sourceDir = path.join(tmpDir, 'source');
    const destDir = path.join(tmpDir, 'dest');
    fs.mkdirSync(sourceDir, { recursive: true });

    for (let d = 0; d < 5; d++) {
      const dir = path.join(sourceDir, `dir${d}`);
      fs.mkdirSync(dir, { recursive: true });
      for (let f = 0; f < 20; f++) {
        fs.writeFileSync(path.join(dir, `file${f}.txt`), `content ${d}-${f}`);
      }
      for (let sd = 0; sd < 3; sd++) {
        const subdir = path.join(dir, `sub${sd}`);
        fs.mkdirSync(subdir, { recursive: true });
        for (let f = 0; f < 10; f++) {
          fs.writeFileSync(path.join(subdir, `nested${f}.dat`), Buffer.alloc(128, f));
        }
      }
    }

    const task = createTask('move', {
      source: sourceDir,
      dest: destDir,
      gameId: -1,
    });

    const { executeMoveTask } = await import('../tasks.js');
    void executeMoveTask(task.id, sourceDir, destDir, -1, null, 'perf_nested');

    const finalTask = await waitFor(() => {
      const t = getTask(task.id);
      return (t && (t.status === 'completed' || t.status === 'failed')) ? t : null;
    }, 120000);

    assert.equal(finalTask.status, 'completed', `Move failed: ${finalTask.error}`);

    assert.ok(fs.existsSync(path.join(destDir, 'dir0', 'file0.txt')));
    assert.ok(fs.existsSync(path.join(destDir, 'dir4', 'sub2', 'nested9.dat')));

    cleanupTasks();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});