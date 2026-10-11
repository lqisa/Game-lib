import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import gameRouter from '../routes/game.js';
import * as db from '../database/db.js';
import { initDatabase } from '../database/init.js';
import { closePool } from '../database/db.js';
import {
  getTask,
  getAllTasks,
  updateTask,
  removeTask,
  createTask,
  executeExtractTask,
} from '../tasks.js';

const request = async (method, url, body) => {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
};

const cleanupTasks = () => {
  for (const t of getAllTasks()) {
    if (t.status === 'running' && t.type === 'move') {
      updateTask(t.id, { status: 'completed' });
    }
    removeTask(t.id);
  }
};

const setupGame = async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-test-'));
  const libDir = path.join(tmpDir, 'RepoA');
  fs.mkdirSync(libDir, { recursive: true });

  const gameDir = path.join(libDir, 'TestGame');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'data.txt'), 'hello');

  const [id] = await db
    .knex('library')
    .insert({ name: 'TestLib_' + Date.now(), path: libDir }, ['id']);
  const libId = id.id || id;

  const [gid] = await db.knex('game').insert(
    {
      name: 'TestGame_' + Date.now(),
      library_id: libId,
      sub_path: 'TestGame',
    },
    ['id'],
  );
  const gameId = gid.id || gid;

  return { tmpDir, libDir, libId, gameId };
};

const teardownGame = async (tmpDir, libId, gameId) => {
  cleanupTasks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  await db
    .knex('game')
    .where({ id: gameId })
    .del()
    .catch(() => {});
  await db
    .knex('library')
    .where({ id: libId })
    .del()
    .catch(() => {});
};

const waitFor = (fn, timeout = 30000, interval = 200) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const result = fn();
      if (result) return resolve(result);
      if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
      setTimeout(check, interval);
    };
    check();
  });

const setupArchiveGame = async (libDir, libId, folder, fileName, content) => {
  const archiveDir = path.join(libDir, folder);
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, fileName);
  fs.writeFileSync(archivePath, content);

  const [gid] = await db.knex('game').insert(
    {
      name: folder + '_' + Date.now(),
      library_id: libId,
      sub_path: `${folder}/${fileName}`,
    },
    ['id'],
  );
  return { gameId: gid.id || gid, archivePath };
};

const withRelocateServer = async (fn) => {
  await initDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/games', gameRouter);
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.close();
  }
};

describe('Game Relocate Route', () => {
  it('should return 400 if newPath is missing', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, { moveFiles: true });
    assert.equal(res.status, 400);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should return 404 if game does not exist', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const res = await request('PUT', `${base}/api/games/99999/relocate`, {
      newPath: 'C:\\x',
      moveFiles: false,
    });
    assert.equal(res.status, 404);
    server.close();
  });

  it('should return 400 if newPath is same as current', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libDir, libId, gameId } = await setupGame(base);
    const currentPath = path.join(libDir, 'TestGame');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: currentPath,
      moveFiles: false,
    });
    assert.equal(res.status, 400);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should update path only when moveFiles is false', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const newPath = path.join(tmpDir, 'RepoB', 'TestGame');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath,
      moveFiles: false,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'update_only');
    assert.equal(res.body.taskId, null);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should create move task for same-drive cross-directory relocation', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const destDir = path.join(tmpDir, 'RepoB', 'TestGame');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destDir,
      moveFiles: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'move');
    assert.ok(res.body.taskId);

    const task = getTask(res.body.taskId);
    assert.ok(task);
    assert.equal(task.type, 'move');
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should rename files for same-directory relocation (no task)', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libDir, libId, gameId } = await setupGame(base);
    const destPath = path.join(libDir, 'TestGameRenamed');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destPath,
      moveFiles: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'move');
    assert.equal(res.body.taskId, null);
    assert.ok(fs.existsSync(destPath));
    assert.ok(fs.existsSync(path.join(destPath, 'data.txt')));
    assert.ok(!fs.existsSync(path.join(libDir, 'TestGame')));
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should return 409 when dest exists and is non-empty without force', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const destDir = path.join(tmpDir, 'RepoB', 'TestGame');
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'existing.txt'), 'x');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destDir,
      moveFiles: true,
    });
    assert.equal(res.status, 409);
    assert.ok(res.body.conflict);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should proceed when dest exists but is empty', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const destDir = path.join(tmpDir, 'RepoB', 'TestGame');
    fs.mkdirSync(destDir, { recursive: true });
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destDir,
      moveFiles: true,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.operation);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should proceed when dest exists and force is true', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);
    const destDir = path.join(tmpDir, 'RepoB', 'TestGame');
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'existing.txt'), 'x');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destDir,
      moveFiles: true,
      force: true,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.operation);
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });

  it('should create extract task for archive source', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libDir, libId } = await setupGame(base);

    const archiveDir = path.join(libDir, 'ArchiveGame');
    fs.mkdirSync(archiveDir, { recursive: true });
    const archivePath = path.join(archiveDir, 'game.7z');
    fs.writeFileSync(archivePath, 'fake archive');

    const [gid2] = await db.knex('game').insert(
      {
        name: 'ArchiveGame_' + Date.now(),
        library_id: libId,
        sub_path: 'ArchiveGame/game.7z',
      },
      ['id'],
    );
    const archiveGameId = gid2.id || gid2;

    const destDir = path.join(tmpDir, 'RepoB', 'ArchiveGame');
    fs.mkdirSync(path.join(tmpDir, 'RepoB'), { recursive: true });

    const res = await request('PUT', `${base}/api/games/${archiveGameId}/relocate`, {
      newPath: destDir,
      moveFiles: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'extract');
    assert.ok(res.body.taskId);

    const task = getTask(res.body.taskId);
    assert.ok(task);
    assert.equal(task.type, 'extract');

    await db.knex('game').where({ id: archiveGameId }).del();
    await teardownGame(tmpDir, libId, 0);
    server.close();
  });

  it('updates the record instead of extracting when the archive is already gone', async () => {
    // The user extracted by hand and deleted the .rar. There is nothing to extract, and treating
    // the target as an extraction destination is what let a later failure delete their folder.
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libDir, libId } = await setupGame(base);

    const archiveDir = path.join(libDir, 'GoneArchive');
    fs.mkdirSync(archiveDir, { recursive: true });
    const archivePath = path.join(archiveDir, 'gone.7z');
    fs.writeFileSync(archivePath, 'fake archive');

    const [gid2] = await db.knex('game').insert(
      {
        name: 'GoneArchive_' + Date.now(),
        library_id: libId,
        sub_path: 'GoneArchive/gone.7z',
      },
      ['id'],
    );
    const goneGameId = gid2.id || gid2;

    // What the user did by hand: extract elsewhere, then throw the archive away.
    const destDir = path.join(tmpDir, 'RepoB', 'GoneArchive');
    fs.mkdirSync(destDir, { recursive: true });
    const userFile = path.join(destDir, 'save-data.txt');
    fs.writeFileSync(userFile, 'precious');
    fs.rmSync(archivePath);

    try {
      const res = await request('PUT', `${base}/api/games/${goneGameId}/relocate`, {
        newPath: destDir,
        moveFiles: true,
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.operation, 'update_only', 'nothing to extract, so nothing to run');
      assert.equal(res.body.taskId, null);
      assert.ok(fs.existsSync(userFile), 'the folder the user extracted must be left alone');
      const row = await db.knex('game').where({ id: goneGameId }).first();
      assert.equal(row.sub_path, destDir, 'the record follows the new path');
    } finally {
      // Closed in a finally so a failing assertion cannot leave the listener holding the test
      // process open.
      await db.knex('game').where({ id: goneGameId }).del();
      await teardownGame(tmpDir, libId, 0);
      server.close();
    }
  });

  it('never removes a target directory that already had content', async (t) => {
    // cleanupDest used to remove whatever sat at the target, so a failed extraction - a wrong
    // password, a missing volume, an archive that will not open - wiped a folder the user had
    // filled themselves.
    await initDatabase();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-extract-'));
    const archivePath = path.join(tmpDir, 'broken.7z');
    fs.writeFileSync(archivePath, 'not really an archive');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(dest, { recursive: true });
    const userFile = path.join(dest, 'keep-me.txt');
    fs.writeFileSync(userFile, 'precious');

    const task = createTask('extract', { archivePath, dest });
    try {
      await executeExtractTask(task.id, archivePath, dest, 0, null, 'x');
      const finished = getTask(task.id);
      if (finished?.error?.includes('No extraction tool')) {
        return t.skip('no extraction tool on this machine');
      }
      assert.ok(fs.existsSync(userFile), "the user's file must survive a failed extraction");
      assert.equal(finished?.status, 'failed');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      cleanupTasks();
    }
  });

  it('should update path when source does not exist and moveFiles is true', async () => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId } = await setupGame(base);

    const [gid2] = await db.knex('game').insert(
      {
        name: 'GhostGame_' + Date.now(),
        library_id: libId,
        sub_path: 'GhostGame',
      },
      ['id'],
    );
    const ghostGameId = gid2.id || gid2;

    const newPath = path.join(tmpDir, 'RepoB', 'GhostGame');
    const res = await request('PUT', `${base}/api/games/${ghostGameId}/relocate`, {
      newPath,
      moveFiles: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'update_only');

    await db.knex('game').where({ id: ghostGameId }).del();
    await teardownGame(tmpDir, libId, 0);
    server.close();
  });

  it('should create move task for cross-drive relocation', async () => {
    await initDatabase();
    const drive = os.tmpdir().substring(0, 1);
    const otherDrives = 'CDEFGH'.split('').filter((d) => d !== drive.toUpperCase());
    if (otherDrives.length === 0) return;
    const otherDrive = otherDrives[0] + ':';
    try {
      fs.accessSync(otherDrive);
    } catch {
      return;
    }

    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { tmpDir, libId, gameId } = await setupGame(base);

    const destDir = path.join(otherDrive, 'gamelib-test-dest', 'TestGame');
    const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
      newPath: destDir,
      moveFiles: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.operation, 'move');
    assert.ok(res.body.taskId);

    const task = getTask(res.body.taskId);
    assert.ok(task);
    assert.equal(task.type, 'move');

    try {
      fs.rmSync(path.join(otherDrive, 'gamelib-test-dest'), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    await teardownGame(tmpDir, libId, gameId);
    server.close();
  });
});

describe('Relocate is a per-game singleton', () => {
  const withServer = async (fn) => {
    await initDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/games', gameRouter);
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      await fn(base);
    } finally {
      server.close();
    }
  };

  it('refuses a second relocate while a task is running for that game', async () => {
    await withServer(async (base) => {
      const { tmpDir, libId, gameId } = await setupGame(base);
      const task = createTask('extract', {
        source: 'C:\\fake.rar',
        dest: 'C:\\fake-out',
        gameId,
        archivePath: 'C:\\fake.rar',
      });

      const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
        newPath: 'C:\\somewhere-else',
        moveFiles: false,
      });

      assert.equal(res.status, 409);
      assert.equal(res.body.busy, true);
      assert.equal(res.body.busyTaskId, task.id);

      await teardownGame(tmpDir, libId, gameId);
    });
  });

  it('still allows relocating a different game (per-game, not global)', async () => {
    await withServer(async (base) => {
      const first = await setupGame(base);
      const second = await setupGame(base);
      createTask('extract', {
        source: 'C:\\fake.rar',
        dest: 'C:\\fake-out',
        gameId: first.gameId,
        archivePath: 'C:\\fake.rar',
      });

      const res = await request('PUT', `${base}/api/games/${second.gameId}/relocate`, {
        newPath: 'C:\\elsewhere',
        moveFiles: false,
      });

      assert.notEqual(res.status, 409);

      await teardownGame(first.tmpDir, first.libId, first.gameId);
      await teardownGame(second.tmpDir, second.libId, second.gameId);
    });
  });

  it('allows the next relocate once the previous task has finished', async () => {
    await withServer(async (base) => {
      const { tmpDir, libId, gameId } = await setupGame(base);
      const task = createTask('extract', {
        source: 'C:\\fake.rar',
        dest: 'C:\\fake-out',
        gameId,
        archivePath: 'C:\\fake.rar',
      });
      updateTask(task.id, { status: 'completed' });

      const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
        newPath: 'C:\\elsewhere',
        moveFiles: false,
      });

      assert.notEqual(res.status, 409);

      await teardownGame(tmpDir, libId, gameId);
    });
  });
});

describe('Archive → archive relocation', () => {
  it('moves the archive file itself when the target is an archive path (same drive)', async () => {
    // Relocating D:\Gal\game.rar to H:\Gal\game.rar used to extract the archive into a folder
    // literally named game.rar. An archive target must move the file instead.
    await withRelocateServer(async (base) => {
      const { tmpDir, libDir, libId } = await setupGame(base);
      const { gameId, archivePath } = await setupArchiveGame(
        libDir,
        libId,
        'RarGame',
        'game.rar',
        'fake rar',
      );

      try {
        const destArchive = path.join(tmpDir, 'RepoB', 'game.rar');
        const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
          newPath: destArchive,
          moveFiles: true,
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.operation, 'move');
        assert.equal(res.body.taskId, null, 'same drive renames inline without a task');
        assert.ok(fs.existsSync(destArchive), 'the archive must be at the new path');
        assert.ok(!fs.existsSync(archivePath), 'the source archive must be gone');

        const row = await db.knex('game').where({ id: gameId }).first();
        assert.equal(row.sub_path, destArchive, 'the record follows the moved file');
        assert.equal(row.library_id, null, 'a target outside any library drops the library link');
      } finally {
        await db.knex('game').where({ id: gameId }).del();
        await teardownGame(tmpDir, libId, 0);
      }
    });
  });

  it('returns 409 when the target archive already exists and force is not set', async () => {
    await withRelocateServer(async (base) => {
      const { tmpDir, libDir, libId } = await setupGame(base);
      const { gameId, archivePath } = await setupArchiveGame(
        libDir,
        libId,
        'RarGame',
        'game.rar',
        'source content',
      );

      try {
        const destArchive = path.join(tmpDir, 'RepoB', 'game.rar');
        fs.mkdirSync(path.dirname(destArchive), { recursive: true });
        fs.writeFileSync(destArchive, 'existing content');

        const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
          newPath: destArchive,
          moveFiles: true,
        });
        assert.equal(res.status, 409);
        assert.ok(res.body.conflict);
        assert.equal(fs.readFileSync(destArchive, 'utf-8'), 'existing content');
        assert.ok(fs.existsSync(archivePath), 'nothing moves without force');
      } finally {
        await db.knex('game').where({ id: gameId }).del();
        await teardownGame(tmpDir, libId, 0);
      }
    });
  });

  it('overwrites the target archive with force', async () => {
    await withRelocateServer(async (base) => {
      const { tmpDir, libDir, libId } = await setupGame(base);
      const { gameId, archivePath } = await setupArchiveGame(
        libDir,
        libId,
        'RarGame',
        'game.rar',
        'new content',
      );

      try {
        const destArchive = path.join(tmpDir, 'RepoB', 'game.rar');
        fs.mkdirSync(path.dirname(destArchive), { recursive: true });
        fs.writeFileSync(destArchive, 'old content');

        const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
          newPath: destArchive,
          moveFiles: true,
          force: true,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.operation, 'move');
        assert.equal(fs.readFileSync(destArchive, 'utf-8'), 'new content');
        assert.ok(!fs.existsSync(archivePath));
      } finally {
        await db.knex('game').where({ id: gameId }).del();
        await teardownGame(tmpDir, libId, 0);
      }
    });
  });

  it('still extracts when an archive-named target already exists as a directory', async () => {
    // Disk state wins over the extension: a folder named game.rar (e.g. left behind by the old
    // buggy behavior) is an extraction destination, not a move target.
    await withRelocateServer(async (base) => {
      const { tmpDir, libDir, libId } = await setupGame(base);
      const { gameId } = await setupArchiveGame(libDir, libId, 'RarGame', 'game.rar', 'fake rar');

      try {
        const destDir = path.join(tmpDir, 'RepoB', 'game.rar');
        fs.mkdirSync(destDir, { recursive: true });

        const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
          newPath: destDir,
          moveFiles: true,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.operation, 'extract');
        assert.ok(res.body.taskId);
        assert.equal(getTask(res.body.taskId)?.type, 'extract');
      } finally {
        await db.knex('game').where({ id: gameId }).del();
        await teardownGame(tmpDir, libId, 0);
      }
    });
  });

  it('moves the file cross-drive via a robocopy file-mode task', async () => {
    const drive = os.tmpdir().substring(0, 1);
    const otherDrives = 'CDEFGH'.split('').filter((d) => d !== drive.toUpperCase());
    if (otherDrives.length === 0) return;
    const otherDrive = otherDrives[0] + ':';
    try {
      fs.accessSync(otherDrive);
    } catch {
      return;
    }

    await withRelocateServer(async (base) => {
      const { tmpDir, libDir, libId } = await setupGame(base);
      const { gameId, archivePath } = await setupArchiveGame(
        libDir,
        libId,
        'CrossGame',
        'big-game.7z',
        Buffer.alloc(64 * 1024, 7),
      );

      const destArchive = path.join(otherDrive, 'gamelib-test-dest', 'big-game.7z');
      try {
        const res = await request('PUT', `${base}/api/games/${gameId}/relocate`, {
          newPath: destArchive,
          moveFiles: true,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.operation, 'move');
        assert.ok(res.body.taskId);

        const finalTask = await waitFor(() => {
          const t = getTask(res.body.taskId);
          return t && (t.status === 'completed' || t.status === 'failed') ? t : null;
        });
        assert.equal(finalTask.status, 'completed', `Task failed: ${finalTask.error}`);
        assert.ok(fs.existsSync(destArchive), 'the archive must be at the new path');
        assert.ok(!fs.existsSync(archivePath), 'the source archive must be deleted after copy');

        const row = await db.knex('game').where({ id: gameId }).first();
        assert.equal(row.sub_path, destArchive);
      } finally {
        try {
          fs.rmSync(path.join(otherDrive, 'gamelib-test-dest'), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        await db.knex('game').where({ id: gameId }).del();
        await teardownGame(tmpDir, libId, 0);
      }
    });
  });
});

after(async () => {
  await closePool();
});
