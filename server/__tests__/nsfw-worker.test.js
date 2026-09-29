import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classifyImage } from '../nsfw-worker.js';
import { closePool } from '../database/db.js';
import { COVERS_DIR } from '../scraper/cover.js';

/**
 * A classifier failure must never be written down as an answer. Storing 0 marks a game safe for
 * good, because the polling query only ever looks at rows whose `r18` is still NULL - so a cover
 * that could not be read once stayed "safe" forever.
 */

after(async () => {
  await closePool();
});

describe('classifying one cover', () => {
  it('has no verdict for a cover that is not on disk', async () => {
    assert.equal(await classifyImage('definitely-not-on-disk.jpg'), null);
  });

  it('has no verdict when the image cannot be read', async (t) => {
    // Anything that throws while producing the tensor - a corrupt file, no model/backend loaded
    // yet - is "no verdict" for the same reason.
    const name = `test-not-an-image-${Date.now()}.jpg`;
    try {
      fs.mkdirSync(COVERS_DIR, { recursive: true });
      fs.writeFileSync(path.join(COVERS_DIR, name), '<!DOCTYPE html><html>not an image</html>');
    } catch {
      return t.skip('cannot write into the covers directory here');
    }
    try {
      assert.equal(await classifyImage(name), null);
    } finally {
      fs.rmSync(path.join(COVERS_DIR, name), { force: true });
    }
  });
});
