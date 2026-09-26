import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NON_GAME_DIRS,
  ARCHIVE_EXTENSIONS,
  VOLUME_PATTERNS,
  EXTRACT_TOOL_PATHS,
  FORMAT_TOOL_PRIORITY,
} from '../constants.js';

describe('NON_GAME_DIRS', () => {
  it('should be a Set', () => {
    assert.ok(NON_GAME_DIRS instanceof Set);
  });

  it('should contain common non-game directories', () => {
    const expected = ['save', 'saves', 'config', 'cache', 'logs', 'tmp', 'temp'];
    for (const dir of expected) {
      assert.ok(NON_GAME_DIRS.has(dir), `missing: ${dir}`);
    }
  });

  it('should not contain typical game directories', () => {
    const gameDirs = ['gameA', 'my-rpg', 'skyrim', 'witcher3'];
    for (const dir of gameDirs) {
      assert.ok(!NON_GAME_DIRS.has(dir), `should not contain: ${dir}`);
    }
  });
});

describe('ARCHIVE_EXTENSIONS', () => {
  it('should be a Set', () => {
    assert.ok(ARCHIVE_EXTENSIONS instanceof Set);
  });

  it('should contain standard archive formats', () => {
    const expected = ['.zip', '.7z', '.rar'];
    for (const ext of expected) {
      assert.ok(ARCHIVE_EXTENSIONS.has(ext), `missing: ${ext}`);
    }
  });

  it('should contain volume extensions', () => {
    assert.ok(ARCHIVE_EXTENSIONS.has('.001'));
    assert.ok(ARCHIVE_EXTENSIONS.has('.009'));
  });
});

describe('VOLUME_PATTERNS', () => {
  it('should be an array of RegExp patterns', () => {
    assert.ok(Array.isArray(VOLUME_PATTERNS));
    for (const p of VOLUME_PATTERNS) {
      assert.ok(p instanceof RegExp);
    }
  });

  it('should match 7z volume patterns', () => {
    const match = 'game.7z.001'.match(VOLUME_PATTERNS[0]);
    assert.ok(match);
    assert.equal(match[1], 'game');
  });

  it('should match zip volume patterns', () => {
    const match = 'game.zip.001'.match(VOLUME_PATTERNS[1]);
    assert.ok(match);
    assert.equal(match[1], 'game');
  });

  it('should match rar part patterns', () => {
    const match = 'game.part1.rar'.match(VOLUME_PATTERNS[2]);
    assert.ok(match);
    assert.equal(match[1], 'game');
  });

  it('should match rar r-number patterns', () => {
    const match = 'game.rar.r00'.match(VOLUME_PATTERNS[3]);
    assert.ok(match);
    assert.equal(match[1], 'game');
  });

  it('should not match non-volume files', () => {
    for (const p of VOLUME_PATTERNS) {
      assert.ok(!'game.7z'.match(p));
      assert.ok(!'game.rar'.match(p));
    }
  });
});

describe('EXTRACT_TOOL_PATHS', () => {
  it('should have unrar, sevenzip, sevenzipZstd keys', () => {
    assert.ok(typeof EXTRACT_TOOL_PATHS.unrar === 'object');
    assert.ok(typeof EXTRACT_TOOL_PATHS.sevenzip === 'object');
    assert.ok(typeof EXTRACT_TOOL_PATHS.sevenzipZstd === 'object');
  });

  it('each tool should have at least one candidate path', () => {
    for (const [tool, paths] of Object.entries(EXTRACT_TOOL_PATHS)) {
      assert.ok(paths.length > 0, `${tool} has no candidate paths`);
    }
  });
});

describe('FORMAT_TOOL_PRIORITY', () => {
  it('should define priority for .rar .zip .7z .zst', () => {
    assert.ok(Array.isArray(FORMAT_TOOL_PRIORITY['.rar']));
    assert.ok(Array.isArray(FORMAT_TOOL_PRIORITY['.zip']));
    assert.ok(Array.isArray(FORMAT_TOOL_PRIORITY['.7z']));
    assert.ok(Array.isArray(FORMAT_TOOL_PRIORITY['.zst']));
  });

  it('.rar should prefer unrar over sevenzip', () => {
    const p = FORMAT_TOOL_PRIORITY['.rar'];
    assert.ok(p.indexOf('unrar') < p.indexOf('sevenzip'));
  });

  it('.7z should prefer sevenzip over sevenzipZstd', () => {
    const p = FORMAT_TOOL_PRIORITY['.7z'];
    assert.ok(p.indexOf('sevenzip') < p.indexOf('sevenzipZstd'));
  });

  it('.zst should only use sevenzipZstd', () => {
    assert.deepEqual(FORMAT_TOOL_PRIORITY['.zst'], ['sevenzipZstd']);
  });
});
