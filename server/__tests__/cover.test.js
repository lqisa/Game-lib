import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCoverUrl, coverExists, COVERS_DIR, ensureCoversDir, fetchCoverUrlFromSource, isPlaceholderImage, looksLikeImage, DETAIL_FETCH_SOURCES } from '../scraper/cover.js';

describe('resolveCoverUrl', () => {
  it('prefers the cover URL recorded at adopt time', () => {
    const raw = JSON.stringify({ coverUrl: 'https://example.com/a.jpg' });
    assert.equal(resolveCoverUrl('vndb', 'v751', raw), 'https://example.com/a.jpg');
  });

  it('rebuilds the DLsite URL from the product code alone', () => {
    // No stored URL (rows created before raw_data was persisted). The folder is the RJ number
    // rounded up to the next 1000, padded to 8 digits - 1681172 -> 01682000.
    assert.equal(
      resolveCoverUrl('dlsite', 'RJ01681172', null),
      'https://img.dlsite.jp/modpub/images2/work/doujin/RJ01682000/RJ01681172_img_main.jpg',
    );
  });

  it('accepts the other DLsite product prefixes', () => {
    assert.match(resolveCoverUrl('dlsite', 'VJ012424', null), /VJ012424_img_main\.jpg$/);
    assert.match(resolveCoverUrl('dlsite', 'RE123456', null), /RE123456_img_main\.jpg$/);
  });

  it('falls back to the DLsite URL when raw_data is unusable', () => {
    assert.match(resolveCoverUrl('dlsite', 'RJ01681172', 'not json'), /RJ01681172_img_main\.jpg$/);
    assert.match(resolveCoverUrl('dlsite', 'RJ01681172', JSON.stringify({})), /RJ01681172_img_main\.jpg$/);
    assert.match(
      resolveCoverUrl('dlsite', 'RJ01681172', JSON.stringify({ coverUrl: null })),
      /RJ01681172_img_main\.jpg$/,
    );
  });

  it('returns null when there is nothing to go on', () => {
    // Other sources have no deterministic cover URL, so an unknown row cannot be repaired.
    assert.equal(resolveCoverUrl('vndb', 'v751', null), null);
    assert.equal(resolveCoverUrl('bangumi', '12345', null), null);
    assert.equal(resolveCoverUrl('steam', '570', null), null);
    assert.equal(resolveCoverUrl('dlsite', 'not-a-code', null), null);
    assert.equal(resolveCoverUrl('dlsite', null, null), null);
  });

  it('does NOT guess a DMM cover URL when raw_data is missing', () => {
    // A wrong type segment answers 302 to a "now printing" placeholder, which axios
    // follows - so a guess is stored as the cover and reported as a success. Returning
    // null hands the row to fetchCoverUrlFromSource(), which reads the real URL.
    assert.equal(resolveCoverUrl('dmm', 'd_216826', null), null);
    assert.equal(resolveCoverUrl('dmm', 'd_216826', JSON.stringify({ coverUrl: null })), null);
    assert.equal(resolveCoverUrl('dmm', 'd_216826', 'not json'), null);
  });

  it('still uses the DMM cover URL when raw_data has one', () => {
    const raw = JSON.stringify({
      coverUrl: 'https://doujin-assets.dmm.co.jp/digital/comic/d_1/d_1pl.jpg',
    });
    assert.equal(
      resolveCoverUrl('dmm', 'd_1', raw),
      'https://doujin-assets.dmm.co.jp/digital/comic/d_1/d_1pl.jpg',
    );
  });
});

describe('isPlaceholderImage', () => {
  it('recognises the placeholder DMM redirects to', () => {
    assert.equal(
      isPlaceholderImage('https://doujin-assets.dmm.co.jp/doujin/now_printing/now_printing.jpg'),
      true,
    );
  });

  it('passes a real asset URL', () => {
    assert.equal(
      isPlaceholderImage('https://doujin-assets.dmm.co.jp/digital/comic/d_1/d_1pl.jpg'),
      false,
    );
  });

  it('is safe on empty input', () => {
    assert.equal(isPlaceholderImage(''), false);
    assert.equal(isPlaceholderImage(null), false);
    assert.equal(isPlaceholderImage(undefined), false);
  });
});

describe('looksLikeImage', () => {
  it('accepts real image headers', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const bmp = Buffer.from([0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(looksLikeImage(jpeg), true, 'jpeg');
    assert.equal(looksLikeImage(png), true, 'png');
    assert.equal(looksLikeImage(Buffer.from('GIF89a----------')), true, 'gif');
    assert.equal(looksLikeImage(bmp), true, 'bmp');
  });

  it('accepts webp (RIFF....WEBP)', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP'),
      Buffer.from([0, 0, 0, 0]),
    ]);
    assert.equal(looksLikeImage(webp), true);
  });

  it('rejects an HTML error page served as an image', () => {
    // The measured failure: a dead cover URL answers 200 with a full HTML document.
    const html = Buffer.from('<!DOCTYPE html><html><head><title>Not found</title></head></html>');
    assert.equal(looksLikeImage(html), false);
  });

  it('rejects JSON and other non-image bodies', () => {
    assert.equal(looksLikeImage(Buffer.from('{"error":"not found"}........')), false);
    assert.equal(looksLikeImage(Buffer.from('<?xml version="1.0"?>........')), false);
  });

  it('rejects short and empty bodies', () => {
    assert.equal(looksLikeImage(Buffer.alloc(0)), false);
    assert.equal(looksLikeImage(Buffer.from([0xff, 0xd8, 0xff])), false, 'truncated jpeg header');
    assert.equal(looksLikeImage(null), false);
    assert.equal(looksLikeImage(undefined), false);
  });
});

describe('fetchCoverUrlFromSource guards', () => {
  // These must bail out before any network call, so the test stays offline.
  it('covers exactly the sources whose URL is not derivable from the id', () => {
    // DMM belongs here: its asset path carries a type segment (`/digital/game/` vs
    // `/digital/comic/`) that cannot be read off the id, so re-reading the entry is the
    // only reliable recovery. DLsite is the one that can stay out - its URL is derivable.
    assert.deepEqual([...DETAIL_FETCH_SOURCES].sort(), ['bangumi', 'dmm', 'steam', 'vndb']);
  });

  it('returns null without a network call for unsupported sources', async () => {
    assert.equal(await fetchCoverUrlFromSource('dlsite', 'RJ01681172'), null);
    assert.equal(await fetchCoverUrlFromSource('unknown', 'x'), null);
  });

  it('returns null when the source id is missing', async () => {
    assert.equal(await fetchCoverUrlFromSource('vndb', null), null);
    assert.equal(await fetchCoverUrlFromSource('vndb', ''), null);
    assert.equal(await fetchCoverUrlFromSource('steam', undefined), null);
  });
});

describe('coverExists', () => {
  const probe = '__test_probe_cover__.jpg';

  before(() => {
    ensureCoversDir();
    fs.writeFileSync(path.join(COVERS_DIR, probe), 'x');
  });

  after(() => {
    fs.rmSync(path.join(COVERS_DIR, probe), { force: true });
  });

  it('is false for a missing name or a name that is not on disk', () => {
    assert.equal(coverExists(null), false);
    assert.equal(coverExists(''), false);
    assert.equal(coverExists('definitely-not-here.jpg'), false);
  });

  it('is true once the file exists', () => {
    assert.equal(coverExists(probe), true);
  });
});
