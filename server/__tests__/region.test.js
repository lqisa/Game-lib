import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  readGeoCountry,
  buildRegionNotice,
  buildEmptyResultNotice,
  GEO_HEADER,
  JAPAN,
} from '../scraper/region.js';

// Pure: no network. The country arrives on a response header, so the whole decision
// can be exercised without touching DLsite.

const withGeo = (country) => ({ headers: country === null ? {} : { [GEO_HEADER]: country } });

describe('readGeoCountry', () => {
  it('reads the header DLsite reports', () => {
    assert.equal(readGeoCountry(withGeo('JP')), 'JP');
  });

  it('normalises case and whitespace', () => {
    assert.equal(readGeoCountry(withGeo(' jp ')), 'JP');
    assert.equal(readGeoCountry(withGeo('us')), 'US');
  });

  it('returns null when the header is absent', () => {
    assert.equal(readGeoCountry(withGeo(null)), null);
    assert.equal(readGeoCountry({}), null);
    assert.equal(readGeoCountry(undefined), null);
    assert.equal(readGeoCountry({ headers: { [GEO_HEADER]: '' } }), null);
  });
});

describe('buildRegionNotice', () => {
  it('stays silent for a Japanese exit', () => {
    assert.equal(buildRegionNotice(JAPAN), null);
    assert.equal(buildRegionNotice('JP'), null);
  });

  it('stays silent when the exit is unknown', () => {
    // Unknown is not the same as bad - do not send the user chasing their proxy
    // settings on a guess.
    assert.equal(buildRegionNotice(null), null);
    assert.equal(buildRegionNotice(''), null);
  });

  it('names the country it saw', () => {
    const notice = buildRegionNotice('US');
    assert.equal(notice.country, 'US');
    assert.equal(notice.isJapan, false);
    assert.match(notice.message, /US/);
    assert.match(notice.message, /Japan/);
  });
});

describe('buildEmptyResultNotice', () => {
  it('blames the exit when it is not Japan', () => {
    const notice = buildEmptyResultNotice('RJ123456', 'US');
    assert.equal(notice.isJapan, false);
    assert.match(notice.message, /US/);
  });

  it('does NOT blame the exit when the exit is already Japan', () => {
    // The whole point: an empty search on a correct exit is a different problem,
    // and telling the user to check their proxy would be wrong.
    const notice = buildEmptyResultNotice('RJ123456', 'JP');
    assert.equal(notice.isJapan, true);
    assert.match(notice.message, /does not exist|delisted/);
    assert.doesNotMatch(notice.message, /check that the network exit|region-restricted/);
  });

  it('hedges when the exit could not be determined', () => {
    const notice = buildEmptyResultNotice('RJ123456', null);
    assert.equal(notice.isJapan, null);
    assert.match(notice.message, /Japan/);
  });

  it('recognises DLsite codes', () => {
    assert.ok(buildEmptyResultNotice('RJ123456', 'JP'));
    assert.ok(buildEmptyResultNotice('VJ012345', 'JP'));
    assert.ok(buildEmptyResultNotice('some RJ123456 game', 'JP'));
  });

  it('recognises DMM codes', () => {
    assert.ok(buildEmptyResultNotice('d_216826', 'JP'));
    assert.ok(buildEmptyResultNotice('[d_216826] game', 'JP'));
  });

  it('does not invent a diagnosis for a plain keyword', () => {
    // A free-text search that finds nothing is unremarkable.
    assert.equal(buildEmptyResultNotice('some game', 'JP'), null);
  });

  it('still reports a bad exit for a plain keyword', () => {
    // Even without a product code, a non-Japanese exit is worth mentioning.
    const notice = buildEmptyResultNotice('some game', 'US');
    assert.equal(notice.isJapan, false);
  });

  it('is safe on empty input', () => {
    assert.equal(buildEmptyResultNotice('', null), null);
    assert.equal(buildEmptyResultNotice(undefined, undefined), null);
  });
});
