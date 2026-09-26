import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanName,
  similarity,
  bestMatch,
  detectLanguage,
  extractIdHint,
} from '../scraper/match.js';

describe('cleanName', () => {
  it('strips bracketed tags and decorative symbols', () => {
    assert.equal(cleanName('【多言語】SweetBody~愛の巣へ~'), 'SweetBody愛の巣へ');
  });

  it('strips archive suffixes including split volumes', () => {
    assert.equal(cleanName('Game.rar'), 'Game');
    assert.equal(cleanName('Game.zip'), 'Game');
    assert.equal(cleanName('Game.7z'), 'Game');
    assert.equal(cleanName('Game.7z.001'), 'Game');
    assert.equal(cleanName('Game.part1.rar'), 'Game');
    assert.equal(cleanName('Game.rar.r00'), 'Game');
  });

  it('drops underscores and version noise', () => {
    assert.equal(cleanName('Some_Game_Title_v1.2.rar'), 'SomeGameTitlev12');
  });

  it('removes parenthesis and bracket tags', () => {
    assert.equal(cleanName('Title (2020) [v1.0].rar'), 'Title');
    assert.equal(cleanName('（同人）Title'), 'Title');
  });

  it('removes every bracket style, whatever the language', () => {
    assert.equal(cleanName('Game (English)'), 'Game');
    assert.equal(cleanName('Game [v1.0]'), 'Game');
    assert.equal(cleanName('Game （同人）'), 'Game');
    assert.equal(cleanName('【多言語】Game'), 'Game');
    assert.equal(cleanName('Game 【多言語】(English)[v1]'), 'Game');
    assert.equal(cleanName('Game （同人）(English)'), 'Game');
  });

  it('removes stray brackets that have no pair', () => {
    assert.equal(cleanName('Game (extra'), 'Gameextra');
    assert.equal(cleanName('Game)'), 'Game');
  });

  it('normalises full-width forms', () => {
    assert.equal(cleanName('ＳＷＥＥＴ'), 'SWEET');
  });

  it('is safe on empty and junk input', () => {
    assert.equal(cleanName(''), '');
    assert.equal(cleanName(null), '');
    assert.equal(cleanName('~~~'), '');
  });
});

describe('similarity', () => {
  it('scores an exact match as 1', () => {
    assert.equal(similarity('SweetBody', 'SweetBody'), 1);
    assert.equal(similarity('アリナと淫魔の呪い', 'アリナと淫魔の呪い'), 1);
  });

  it('scores a partial name against the full site name as 1', () => {
    assert.equal(similarity('SweetBody', '【多言語】SweetBody~愛の巣へ~'), 1);
  });

  it('ignores decorations, brackets, underscores and the archive suffix', () => {
    assert.equal(similarity('Some_Game_Title_v1.2.rar', 'Some Game Title'), 1);
    assert.equal(similarity('アリナと淫魔の呪い.rar', 'アリナと淫魔の呪い ～特別編～'), 1);
  });

  it('scores unrelated names low', () => {
    assert.ok(similarity('SweetBody', 'Completely Different Game') < 0.5);
    assert.ok(similarity('アリナと淫魔の呪い', '全然違うゲーム') < 0.5);
  });

  // Partial matching only counts when our name sits at one end of the site's name.
  it('does not match a name buried in the middle of a longer one', () => {
    assert.ok(similarity('game', 'Some Game Title') < 0.8);
    assert.ok(similarity('SweetBody', 'DLsite SweetBody Collection') < 0.8);
  });

  it('matches when our name is a prefix or a suffix of the site name', () => {
    assert.equal(similarity('SweetBody', 'SweetBody 愛の巣へ'), 1);
    assert.equal(similarity('愛の巣へ', 'SweetBody 愛の巣へ'), 1);
  });

  // CJK titles are naturally short, so they get a lower minimum than latin cores.
  it('allows short CJK partial names but not short latin ones', () => {
    assert.equal(similarity('愛の巣', '愛の巣へ'), 1);
    assert.ok(similarity('game', 'gameplay collection') < 0.8);
  });

  it('ignores english case', () => {
    assert.equal(similarity('sweetbody', 'SweetBody愛の巣へ'), 1);
    assert.equal(similarity('SWEETBODY', 'SweetBody愛の巣へ'), 1);
  });

  it('is symmetric', () => {
    const a = similarity('SweetBody', '【多言語】SweetBody~愛の巣へ~');
    const b = similarity('【多言語】SweetBody~愛の巣へ~', 'SweetBody');
    assert.equal(a, b);
  });
});

describe('detectLanguage', () => {
  it('treats latin names as english', () => {
    assert.equal(detectLanguage('SweetBody'), 'en');
  });

  it('treats kana and RJ codes as japanese', () => {
    assert.equal(detectLanguage('【多言語】SweetBody~愛の巣へ~'), 'ja');
    assert.equal(detectLanguage('アリナと淫魔の呪い'), 'ja');
    assert.equal(detectLanguage('RJ123456'), 'ja');
  });

  it('treats han-only names as chinese', () => {
    assert.equal(detectLanguage('甜蜜的家'), 'zh');
  });

  it('falls back to japanese for names with no letters', () => {
    assert.equal(detectLanguage('12345'), 'ja');
    assert.equal(detectLanguage(''), 'ja');
  });
});

describe('extractIdHint', () => {
  it('pulls the DLsite product code out of a file name', () => {
    assert.equal(extractIdHint('RJ123456.rar'), 'rj123456');
    assert.equal(extractIdHint('【RJ0123456】Some Game'), 'rj0123456');
    assert.equal(extractIdHint('No code here'), null);
  });
});

describe('bestMatch', () => {
  const results = [
    { id: 'v751', name: 'Some Other Game' },
    { id: 'v752', name: '【多言語】SweetBody~愛の巣へ~' },
  ];

  it('returns the best result above the threshold', () => {
    const match = bestMatch('SweetBody', results, 0.8);
    assert.equal(match.result.id, 'v752');
    assert.equal(match.reason, 'name');
  });

  it('returns null when nothing reaches the threshold', () => {
    assert.equal(bestMatch('Totally Unrelated', results, 0.8), null);
  });

  it('matches on the DLsite id even when the names differ', () => {
    const match = bestMatch('RJ123456.rar', [{ id: 'RJ123456', name: '全然違う名前' }], 0.8);
    assert.equal(match.score, 1);
    assert.equal(match.reason, 'id');
  });

  it('handles empty result lists', () => {
    assert.equal(bestMatch('SweetBody', [], 0.8), null);
    assert.equal(bestMatch('SweetBody', undefined, 0.8), null);
  });
});
