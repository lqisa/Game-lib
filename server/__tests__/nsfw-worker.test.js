import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classifyImage, buildInputTensor, isR18 } from '../nsfw-worker.js';
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

describe('the R18 verdict', () => {
  const predictions = (hentai, porn, sexy) => [
    { className: 'Drawing', probability: Math.max(0, 1 - hentai - porn - sexy) },
    { className: 'Hentai', probability: hentai },
    { className: 'Neutral', probability: 0 },
    { className: 'Porn', probability: porn },
    { className: 'Sexy', probability: sexy },
  ];

  it('counts illustrated adult art, which the model scores as Hentai', () => {
    // Measured on a real cover its vendor already calls R18: hentai 0.982, porn 0.007, sexy 0.000.
    // Judging on porn+sexy alone called that - and every illustrated cover like it - "safe".
    assert.equal(isR18(predictions(0.982, 0.007, 0.0)), 1);
  });

  it('still treats an all-ages cover as safe', () => {
    assert.equal(isR18(predictions(0.002, 0.0, 0.0)), 0);
    assert.equal(isR18(predictions(0.004, 0.0, 0.0)), 0);
  });

  it('keeps the photographic classes working', () => {
    assert.equal(isR18(predictions(0, 0.6, 0.0)), 1);
    assert.equal(isR18(predictions(0, 0.0, 0.9)), 1);
  });

  it('is safe on an empty or missing answer', () => {
    assert.equal(isR18([]), 0);
    assert.equal(isR18(undefined), 0);
  });
});

describe('the tensor handed to the model', () => {
  it('carries the pixel values unscaled, because nsfwjs divides by 255 itself', async () => {
    // nsfwjs sets normalizationOffset = tf.scalar(255) and infer() does img.div(offset). Scaling
    // here as well fed the network an almost black image: the output stopped depending on the
    // input at all, so every cover came back "safe" and the R18 column could never be set by the
    // classifier (measured on a real library: 1430 ml verdicts, every one of them 0).
    const tf = await import('@tensorflow/tfjs');
    const tensor = buildInputTensor(tf, new Uint8Array([0, 255, 128]), 1);
    assert.deepEqual(tensor.shape, [1, 1, 3]);
    assert.deepEqual([...tensor.dataSync()], [0, 255, 128]);
    tensor.dispose();
  });
});
