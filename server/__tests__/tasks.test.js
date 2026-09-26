import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
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
  detectExtractTools,
  selectTool,
} from '../tasks.js';

const cleanup = () => {
  for (const t of getAllTasks()) {
    if (t.status === 'running' && t.type === 'move') {
      updateTask(t.id, { status: 'completed' });
    }
    removeTask(t.id);
  }
};

describe('Task CRUD', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('createTask should return a task with correct defaults', () => {
    const task = createTask('move', { source: 'C:\\src', dest: 'D:\\dest' });
    assert.ok(task.id);
    assert.equal(task.type, 'move');
    assert.equal(task.status, 'pending');
    assert.equal(task.progress, 0);
    assert.equal(task.error, null);
    assert.ok(task.createdAt);
    assert.equal(task.completedAt, null);
    assert.ok(task.label.includes('src'));
  });

  it('createTask for extract should use archivePath in label', () => {
    const task = createTask('extract', { archivePath: 'C:\\game.rar' });
    assert.ok(task.label.includes('game.rar'));
  });

  it('getTask should retrieve by id', () => {
    const task = createTask('move', { source: 'A', dest: 'B' });
    const found = getTask(task.id);
    assert.equal(found.id, task.id);
  });

  it('getTask should return undefined for unknown id', () => {
    assert.equal(getTask('nonexistent'), undefined);
  });

  it('getAllTasks should return all tasks', () => {
    createTask('move', { source: 'A', dest: 'B' });
    createTask('extract', { archivePath: 'C.rar' });
    assert.equal(getAllTasks().length, 2);
  });

  it('updateTask should merge patch', () => {
    const task = createTask('move', { source: 'A', dest: 'B' });
    updateTask(task.id, { progress: 50, detail: 'Working...' });
    const updated = getTask(task.id);
    assert.equal(updated.progress, 50);
    assert.equal(updated.detail, 'Working...');
    assert.equal(updated.status, 'pending');
  });

  it('updateTask should set completedAt on terminal status', () => {
    const task = createTask('move', { source: 'A', dest: 'B' });
    updateTask(task.id, { status: 'completed' });
    assert.ok(getTask(task.id).completedAt);
  });

  it('updateTask should set completedAt on failed status', () => {
    const task = createTask('move', { source: 'A', dest: 'B' });
    updateTask(task.id, { status: 'failed', error: 'boom' });
    const t = getTask(task.id);
    assert.ok(t.completedAt);
    assert.equal(t.error, 'boom');
  });

  it('updateTask should set completedAt on cancelled status', () => {
    const task = createTask('extract', { archivePath: 'C.rar' });
    updateTask(task.id, { status: 'cancelled' });
    assert.ok(getTask(task.id).completedAt);
  });
});

describe('cancelTask', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('should not cancel move tasks', () => {
    const task = createTask('move', { source: 'A', dest: 'B' });
    updateTask(task.id, { status: 'running' });
    const result = cancelTask(task.id);
    assert.equal(result, false);
    assert.equal(getTask(task.id).status, 'running');
  });

  it('should cancel extract tasks', () => {
    const task = createTask('extract', { archivePath: 'C.rar' });
    updateTask(task.id, { status: 'running' });
    const result = cancelTask(task.id);
    assert.equal(result, true);
    assert.equal(getTask(task.id).status, 'cancelled');
  });

  it('should return false for non-existent task', () => {
    const result = cancelTask('nonexistent');
    assert.equal(result, false);
  });
});

describe('removeTask', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('should remove completed tasks', () => {
    const task = createTask('move', { source: 'A', dest: 'B' });
    updateTask(task.id, { status: 'completed' });
    removeTask(task.id);
    assert.equal(getTask(task.id), undefined);
  });

  it('should not remove running move tasks', () => {
    const task = createTask('move', { source: 'A', dest: 'B' });
    updateTask(task.id, { status: 'running' });
    removeTask(task.id);
    assert.ok(getTask(task.id));
  });

  it('should remove running extract tasks (kills child)', () => {
    const task = createTask('extract', { archivePath: 'C.rar' });
    updateTask(task.id, { status: 'running' });
    removeTask(task.id);
    assert.equal(getTask(task.id), undefined);
  });
});

describe('hasRunningMoveTasks / hasRunningTasks', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('hasRunningMoveTasks should be true when move is running', () => {
    const task = createTask('move', { source: 'A', dest: 'B' });
    updateTask(task.id, { status: 'running' });
    assert.equal(hasRunningMoveTasks(), true);
  });
  it('hasRunningMoveTasks should be false when no move is running', () => {
    createTask('move', { source: 'A', dest: 'B' });
    assert.equal(hasRunningMoveTasks(), false);
  });

  it('hasRunningMoveTasks should be false when only extract is running', () => {
    const task = createTask('extract', { archivePath: 'C.rar' });
    updateTask(task.id, { status: 'running' });
    assert.equal(hasRunningMoveTasks(), false);
  });

  it('hasRunningTasks should be true when any task is running', () => {
    const task = createTask('extract', { archivePath: 'C.rar' });
    updateTask(task.id, { status: 'running' });
    assert.equal(hasRunningTasks(), true);
  });

  it('hasRunningTasks should be false when no task is running', () => {
    createTask('move', { source: 'A', dest: 'B' });
    assert.equal(hasRunningTasks(), false);
  });
});

describe('onTaskChange', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('should notify on task creation', () => {
    const changes = [];
    const unsub = onTaskChange((t) => changes.push(t));
    createTask('move', { source: 'A', dest: 'B' });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].type, 'move');
    unsub();
  });

  it('should notify on task update', () => {
    const task = createTask('move', { source: 'A', dest: 'B' });
    const changes = [];
    const unsub = onTaskChange((t) => changes.push(t));
    updateTask(task.id, { progress: 42 });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].progress, 42);
    unsub();
  });

  it('unsubscribe should stop notifications', () => {
    const changes = [];
    const unsub = onTaskChange((t) => changes.push(t));
    unsub();
    createTask('move', { source: 'A', dest: 'B' });
    assert.equal(changes.length, 0);
  });

  it('should support multiple listeners', () => {
    const a = [];
    const b = [];
    const unsubA = onTaskChange((t) => a.push(t));
    const unsubB = onTaskChange((t) => b.push(t));
    createTask('move', { source: 'A', dest: 'B' });
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    unsubA();
    unsubB();
  });
});

describe('detectExtractTools', () => {
  it('should return an object with tool keys', () => {
    const tools = detectExtractTools();
    assert.ok(typeof tools === 'object');
    assert.ok('unrar' in tools || 'sevenzip' in tools || 'sevenzipZstd' in tools);
  });

  it('found tools should have string paths', () => {
    const tools = detectExtractTools();
    for (const [name, p] of Object.entries(tools)) {
      assert.ok(typeof p === 'string', `${name} path is not a string`);
    }
  });
});

describe('selectTool', () => {
  it('should select unrar for .rar if available', () => {
    const tool = selectTool('.rar', { unrar: '/bin/unrar', sevenzip: '/bin/7z' });
    assert.equal(tool.name, 'unrar');
    assert.equal(tool.path, '/bin/unrar');
  });

  it('should fall back to sevenzip for .rar if unrar unavailable', () => {
    const tool = selectTool('.rar', { sevenzip: '/bin/7z' });
    assert.equal(tool.name, 'sevenzip');
  });

  it('should select sevenzip for .7z if available', () => {
    const tool = selectTool('.7z', { sevenzip: '/bin/7z', sevenzipZstd: '/bin/7z-zstd' });
    assert.equal(tool.name, 'sevenzip');
  });

  it('should fall back to sevenzipZstd for .7z', () => {
    const tool = selectTool('.7z', { sevenzipZstd: '/bin/7z-zstd' });
    assert.equal(tool.name, 'sevenzipZstd');
  });

  it('should select sevenzipZstd for .zst', () => {
    const tool = selectTool('.zst', { sevenzipZstd: '/bin/7z-zstd' });
    assert.equal(tool.name, 'sevenzipZstd');
  });

  it('should return null for unsupported extension', () => {
    const tool = selectTool('.tar', { unrar: '/bin/unrar' });
    assert.equal(tool, null);
  });

  it('should return null when no tool is available', () => {
    const tool = selectTool('.rar', {});
    assert.equal(tool, null);
  });

  it('should respect FORMAT_TOOL_PRIORITY for .zip', () => {
    const tool = selectTool('.zip', { unrar: '/bin/unrar', sevenzip: '/bin/7z' });
    assert.equal(tool.name, 'unrar');
  });
});

// The exit guards must not let an extract/compress be killed by quitting, so they use
// hasActiveTasks rather than the move-only check.
describe('hasActiveTasks', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('is true for a queued (pending) task, not only a running one', () => {
    createTask('extract', { archivePath: 'C.rar' });
    assert.equal(hasActiveTasks(), true);
  });

  it('is true for a running extract', () => {
    const task = createTask('extract', { archivePath: 'C.rar' });
    updateTask(task.id, { status: 'running' });
    assert.equal(hasActiveTasks(), true);
  });

  it('is false once the task reaches a terminal state', () => {
    const task = createTask('compress', { sourceDir: 'D', destArchive: 'D.rar' });
    updateTask(task.id, { status: 'running' });
    updateTask(task.id, { status: 'completed' });
    assert.equal(hasActiveTasks(), false);
  });

  it('is false when there are no tasks at all', () => {
    assert.equal(hasActiveTasks(), false);
  });
});

describe('activeTaskForGame', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('finds the active task of the given game only', () => {
    const mine = createTask('extract', { archivePath: 'C.rar', gameId: 7 });
    createTask('extract', { archivePath: 'D.rar', gameId: 8 });
    updateTask(mine.id, { status: 'running' });

    assert.equal(activeTaskForGame(7)?.id, mine.id);
    assert.equal(activeTaskForGame(8)?.id !== mine.id, true);
    assert.equal(activeTaskForGame(999), null);
  });

  it('ignores finished tasks so the game is relocatable again', () => {
    const task = createTask('extract', { archivePath: 'C.rar', gameId: 7 });
    updateTask(task.id, { status: 'failed' });
    assert.equal(activeTaskForGame(7), null);
  });
});
