import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDmmId,
  upgradeImageUrl,
  cleanDmmTitle,
  classifyDmmResponse,
  isDmmId,
  isDoujinId,
  isPcGameId,
  isDmmNotFound,
} from '../scraper/dmm.js';
import {
  SOURCE_TYPES,
  DEFAULT_MATCH_PRIORITY,
  extractIdHint,
  detectLanguage,
  bestMatch,
} from '../scraper/match.js';

// Everything here is pure: no network, so these stay fast and offline-safe.

describe('extractDmmId', () => {
  it('accepts a bare id', () => {
    assert.equal(extractDmmId('d_216826'), 'd_216826');
  });

  it('normalises case', () => {
    assert.equal(extractDmmId('D_216826'), 'd_216826');
  });

  it('pulls the id out of a detail URL', () => {
    assert.equal(
      extractDmmId('https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_216826/'),
      'd_216826',
    );
  });

  it('pulls the id out of a URL that carries tracking params', () => {
    assert.equal(
      extractDmmId('https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_717359/?i3_ref=search'),
      'd_717359',
    );
  });

  it('finds the id inside free text', () => {
    assert.equal(extractDmmId('[d_216826] Some Game'), 'd_216826');
  });

  it('returns null when there is no id', () => {
    assert.equal(extractDmmId('not-an-id'), null);
    assert.equal(extractDmmId(''), null);
    assert.equal(extractDmmId(null), null);
    assert.equal(extractDmmId('RJ123456'), null);
  });
});

describe('extractDmmId - PC game (dlsoft) ids', () => {
  it('accepts a bare PC game id', () => {
    assert.equal(extractDmmId('sisp_0014'), 'sisp_0014');
    assert.equal(extractDmmId('cape_0036'), 'cape_0036');
    // Some ids carry letters after the digits.
    assert.equal(extractDmmId('sisp_0038pack'), 'sisp_0038pack');
  });

  it('pulls a PC game id out of its detail URL', () => {
    assert.equal(extractDmmId('https://dlsoft.dmm.co.jp/detail/sisp_0014/'), 'sisp_0014');
  });

  it('finds a PC game id inside a folder name', () => {
    assert.equal(extractDmmId('[sisp_0014] Some Eroge'), 'sisp_0014');
  });

  it('still prefers the doujin form when both shapes fit', () => {
    // `d_216826` matches the PC game pattern too, so the doujin branch must win.
    assert.equal(extractDmmId('d_216826'), 'd_216826');
    assert.equal(isDoujinId('d_216826'), true);
    assert.equal(isPcGameId('d_216826'), false);
  });
});

describe('isDoujinId / isPcGameId', () => {
  it('classifies doujin ids', () => {
    assert.equal(isDoujinId('d_216826'), true);
    assert.equal(isDoujinId('D_216826'), true);
    assert.equal(isDoujinId('sisp_0014'), false);
  });

  it('classifies PC game ids', () => {
    assert.equal(isPcGameId('sisp_0014'), true);
    assert.equal(isPcGameId('fanzagames_0181'), true);
    assert.equal(isPcGameId('sisp_0038pack'), true);
  });

  it('rejects things that are not content ids', () => {
    for (const v of ['', null, undefined, 'RJ123456', '216826', 'some game', 'd_']) {
      assert.equal(isDoujinId(v), false, `isDoujinId(${JSON.stringify(v)})`);
      assert.equal(isPcGameId(v), false, `isPcGameId(${JSON.stringify(v)})`);
    }
  });
});

describe('isDmmId', () => {
  it('recognises DMM ids and rejects other source ids', () => {
    assert.equal(isDmmId('d_216826'), true);
    assert.equal(isDmmId('RJ123456'), false);
    assert.equal(isDmmId('v12345'), false);
  });
});

describe('upgradeImageUrl', () => {
  it('drops the thumbnail size suffix', () => {
    assert.equal(
      upgradeImageUrl(
        'https://doujin-assets.dmm.co.jp/digital/game/d_817381/d_817381pl-200x150.jpg',
      ),
      'https://doujin-assets.dmm.co.jp/digital/game/d_817381/d_817381pl.jpg',
    );
  });

  it('keeps the type segment, which cannot be derived from the id alone', () => {
    const comic = upgradeImageUrl(
      'https://doujin-assets.dmm.co.jp/digital/comic/d_717359/d_717359pl-200x150.jpg',
    );
    assert.match(comic, /\/digital\/comic\//);
  });

  it('strips query strings', () => {
    assert.equal(
      upgradeImageUrl('https://x.test/a/d_1pl-200x150.jpg?v=2'),
      'https://x.test/a/d_1pl.jpg',
    );
  });

  it('leaves a URL without a size suffix alone', () => {
    const url = 'https://doujin-assets.dmm.co.jp/digital/game/d_1/d_1pl.jpg';
    assert.equal(upgradeImageUrl(url), url);
  });

  it('is safe on empty input', () => {
    assert.equal(upgradeImageUrl(''), '');
    assert.equal(upgradeImageUrl(null), '');
  });
});

// DMM's cover path carries a type segment (`/digital/game/` vs `/digital/comic/`) that
// cannot be derived from the id, and a wrong segment answers 302 to a "now printing"
// placeholder - so there is deliberately no URL builder to test here. The behaviours
// that replaced it live in cover.test.js (resolveCoverUrl + isPlaceholderImage).

describe('cleanDmmTitle', () => {
  it('collapses whitespace', () => {
    assert.equal(cleanDmmTitle('  Some\n  Title  '), 'Some Title');
  });

  it('strips an inlined campaign prefix', () => {
    // Some layouts put the promo inside the h1 text instead of a child element.
    assert.equal(cleanDmmTitle('【30%OFF】ツクヨ流忍法身長差房中術'), 'ツクヨ流忍法身長差房中術');
    assert.equal(cleanDmmTitle('【10%ポイント還元】ある作品'), 'ある作品');
  });

  it('keeps a bracketed title that is not a campaign', () => {
    // Must not eat a legitimate 【…】 that has no campaign keyword in it.
    assert.equal(cleanDmmTitle('【初回限定】ある作品'), '【初回限定】ある作品');
  });

  it('is safe on empty input', () => {
    assert.equal(cleanDmmTitle(''), '');
    assert.equal(cleanDmmTitle(null), '');
  });
});

describe('classifyDmmResponse', () => {
  it('detects the region block page', () => {
    assert.equal(
      classifyDmmResponse('https://special.fanza.jp/not-available-in-your-region/', ''),
      'region',
    );
  });

  it('detects the region block from the body even when the URL looks fine', () => {
    assert.equal(
      classifyDmmResponse('https://www.dmm.co.jp/', 'x not-available-in-your-region x'),
      'region',
    );
  });

  it('treats the login wall as a region problem', () => {
    // DMM serves the login wall instead of the region page depending on which check
    // runs first; both mean this exit cannot read the page.
    assert.equal(
      classifyDmmResponse('https://accounts.dmm.co.jp/service/login/password?path=abc', ''),
      'region',
    );
  });

  it('does NOT flag a normal page that merely links to the login page', () => {
    // Regression guard: a healthy product page contains the login URL about five
    // times in its header markup. Matching the login marker against the body made
    // every successful fetch look like a region block.
    const normalBody =
      '<header><a href="https://accounts.dmm.co.jp/service/login/password?path=x">ログイン</a>' +
      '<a href="https://accounts.dmm.co.jp/service/login/password?path=y">会員登録</a></header>';
    assert.equal(
      classifyDmmResponse('https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_1/', normalBody),
      'ok',
    );
  });

  it('passes a normal page', () => {
    assert.equal(
      classifyDmmResponse('https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_1/', '<html/>'),
      'ok',
    );
  });

  it('is safe on empty input', () => {
    assert.equal(classifyDmmResponse('', ''), 'ok');
    assert.equal(classifyDmmResponse(null, null), 'ok');
  });
});

describe('isDmmNotFound', () => {
  it('reads a 404 as "no such work"', () => {
    // DMM answers 404 for a missing work, so it must not be reported as a markup change.
    assert.equal(isDmmNotFound({ response: { status: 404 } }), true);
  });

  it('does not swallow other failures', () => {
    // Anything else has to keep propagating - a 503 or a region block is not "not found".
    assert.equal(isDmmNotFound({ response: { status: 503 } }), false);
    assert.equal(isDmmNotFound({ response: { status: 500 } }), false);
    assert.equal(isDmmNotFound({ code: 'ECONNABORTED' }), false);
    assert.equal(isDmmNotFound(new Error('boom')), false);
    assert.equal(isDmmNotFound(null), false);
    assert.equal(isDmmNotFound(undefined), false);
  });
});

describe('match.js integration', () => {
  it('knows the dmm source', () => {
    assert.ok(SOURCE_TYPES.includes('dmm'));
  });

  it('includes dmm in every default priority list', () => {
    for (const lang of ['en', 'ja', 'zh']) {
      assert.ok(
        DEFAULT_MATCH_PRIORITY[lang].includes('dmm'),
        `${lang} priority should include dmm`,
      );
    }
  });

  it('does not let dmm outrank the established sources', () => {
    // DMM needs a Japanese exit and is the newest source, so it must not displace
    // the sources that already work for most libraries.
    assert.ok(
      DEFAULT_MATCH_PRIORITY.ja.indexOf('dlsite') < DEFAULT_MATCH_PRIORITY.ja.indexOf('dmm'),
    );
    assert.ok(
      DEFAULT_MATCH_PRIORITY.en.indexOf('steam') < DEFAULT_MATCH_PRIORITY.en.indexOf('dmm'),
    );
  });

  it('uses a DMM id in the folder name as a strong hint', () => {
    assert.equal(extractIdHint('[d_216826] Some Game'), 'd_216826');
    // RJ still wins when both are present - it is the more common convention.
    assert.equal(extractIdHint('RJ123456 d_216826'), 'rj123456');
  });

  it('still returns null when no id is present', () => {
    assert.equal(extractIdHint('Some Game'), null);
  });

  it('treats a DMM id as Japanese', () => {
    assert.equal(detectLanguage('d_216826'), 'ja');
    assert.equal(detectLanguage('[d_216826] game'), 'ja');
  });

  it('auto-matches a DMM result by id, ignoring the name entirely', () => {
    // This is what makes /auto/search pick DMM for a folder named after its id:
    // the id hit scores 1 regardless of how different the titles look.
    const results = [
      { id: 'd_111111', name: 'まったく違う名前' },
      { id: 'd_216826', name: '爆乳忍法チチシノビ' },
    ];
    const match = bestMatch('[d_216826] some folder name', results, 0.8);
    assert.ok(match, 'should match');
    assert.equal(match.result.id, 'd_216826');
    assert.equal(match.reason, 'id');
    assert.equal(match.score, 1);
  });

  it('still matches a DMM result by name when the id is absent', () => {
    const results = [{ id: 'd_216826', name: '爆乳忍法チチシノビ' }];
    const match = bestMatch('爆乳忍法チチシノビ', results, 0.8);
    assert.ok(match);
    assert.equal(match.reason, 'name');
  });

  it('does not match a DMM result when neither id nor name agree', () => {
    const results = [{ id: 'd_216826', name: '爆乳忍法チチシノビ' }];
    assert.equal(bestMatch('完全に無関係なゲーム', results, 0.8), null);
  });
});
