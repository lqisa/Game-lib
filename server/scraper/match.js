/**
 * Name matching for the scraper.
 *
 * Two jobs:
 *  1. cleanName() - reduce a game name to its comparable "core".
 *  2. similarity() - score how well our name matches a scraped result name.
 *
 * Why not plain edit distance: our name is often only PART of the site's name
 * (e.g. ours "SweetBody" vs theirs "【多言語】SweetBody~愛の巣へ~"). Whole-string
 * edit distance scores that poorly, so a prefix/suffix containment also counts
 * as a full match.
 */

// game.7z.001 / game.part1.rar / game.rar.r00 / game.rar / game.zip
const ARCHIVE_EXT_RE =
  /\.(?:7z|zip)\.\d+$|\.part\d+\.rar$|\.rar(?:\.(?:r\d+|\d+))?$|\.(?:zip|7z)$/i;

// Bracket pairs whose CONTENTS are tags rather than part of the title: () [] （） 【】
// plus the CJK quote/brace styles. Built from the pair list so it is obvious which
// styles are covered. ']' and '\' must be escaped inside a character class ('[' need not).
const BRACKET_PAIRS = ['()', '[]', '（）', '【】', '〔〕', '{}', '〈〉', '《》', '「」', '『』'];
const escapeInClass = (chars) => chars.replace(/[\\\]]/g, '\\$&');
const bracketClass = (index) => escapeInClass(BRACKET_PAIRS.map((p) => p[index]).join(''));
const BRACKETED_RE = new RegExp(`[${bracketClass(0)}].*?[${bracketClass(1)}]`, 'g');

// Middle dots live inside the katakana block, so KEEP_RE would keep them, but they are
// purely decorative separators ("A・B" should compare as "AB").
const MIDDLE_DOT_RE = /[・･]/g;

// Everything else - ~ ～ ♥ ♡ ★ ☆ ♪ 、 。 _ and all punctuation - is dropped by KEEP_RE,
// which keeps only letters, digits, kana and Han ideographs.
const KEEP_RE =
  /[^a-zA-Z0-9\u3040-\u309f\u30a0-\u30ff\uff66-\uff9f\u4e00-\u9fff\u3400-\u4dbf\u3005\u3006\u30fc]/g;

/**
 * Reduce a name to its comparable core: no archive suffix, no bracketed tags,
 * no decorative symbols, no full-width forms. Case is preserved (similarity()
 * lowercases) so the result is also usable as a display name.
 *   "【多言語】SweetBody~愛の巣へ~" -> "SweetBody愛の巣へ"
 *   "Some_Game_v1.2.rar"          -> "SomeGamev12"
 */
const cleanName = (name) =>
  (name || '')
    .normalize('NFKC')
    .replace(ARCHIVE_EXT_RE, '')
    .replace(BRACKETED_RE, '')
    .replace(MIDDLE_DOT_RE, '')
    .replace(KEEP_RE, '');

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length];
};

const ratio = (a, b) => {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
};

// Minimum length for a partial (prefix/suffix) match. A short latin core is not
// distinctive ("game" is a prefix of "gameplay collection"), but CJK titles are
// naturally short - "愛の巣へ" is a complete, distinctive name - so they get a lower bar.
const MIN_LATIN_WINDOW = 5;
const MIN_CJK_WINDOW = 3;
const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);
const minWindowLen = (core) => (isAscii(core) ? MIN_LATIN_WINDOW : MIN_CJK_WINDOW);

/**
 * Partial-name matching. When our name is only part of the site's name it is almost
 * always at one end - the site adds tags/suffixes around it ("SweetBody" vs
 * "【多言語】SweetBody~愛の巣へ~" -> "SweetBody" is a prefix). A hit in the MIDDLE of a
 * longer name is not evidence ("game" inside "some game title"), so only prefix and
 * suffix containment count, and they count as a full match.
 *
 * Inputs are expected to be already lowercased by similarity().
 */
const bestWindowRatio = (a, b) => {
  let short = a;
  let long = b;
  if (short.length > long.length) {
    short = b;
    long = a;
  }
  if (short.length < minWindowLen(short)) return 0;
  if (short.length === long.length) return ratio(short, long);
  return long.startsWith(short) || long.endsWith(short) ? 1 : 0;
};

/**
 * Score two RAW names (cleaning happens inside). 0..1.
 * Takes the better of whole-name similarity and best-substring similarity.
 */
// Score two ALREADY-CLEANED names. Split out of similarity() so bulk callers (the
// similar-name scan compares every pair in the library) can clean each name once instead
// of re-running the regexes for both sides of every pair.
const similarityOfClean = (ca, cb) => {
  if (!ca || !cb) return 0;
  return Math.max(ratio(ca, cb), bestWindowRatio(ca, cb));
};

const similarity = (a, b) =>
  similarityOfClean(cleanName(a).toLowerCase(), cleanName(b).toLowerCase());

/**
 * A DLsite product code embedded in our file name is the strongest possible signal -
 * when it matches the result's id, the name does not matter at all.
 * DMM/FANZA doujin ids (`d_216826`) work the same way, though they are far rarer in
 * folder names than RJ codes are.
 */
const extractIdHint = (name) => {
  const raw = name || '';
  const rj = raw.match(/[RV]J\d+/i);
  if (rj) return rj[0].toLowerCase();
  const dmm = raw.match(/\bd_\d{3,}\b/i);
  return dmm ? dmm[0].toLowerCase() : null;
};

/**
 * Pick the highest scoring result at or above `threshold`.
 * @template T
 * @param {string} name
 * @param {T[]} results
 * @param {number} threshold
 * @returns {{result: T, score: number, reason: string}|null}
 */
const bestMatch = (name, results, threshold) => {
  const idHint = extractIdHint(name);
  let best = null;
  for (const result of results || []) {
    let score = similarity(name, result?.name);
    let reason = 'name';
    if (idHint && String(result?.id || '').toLowerCase() === idHint) {
      score = 1;
      reason = 'id';
    }
    if (score >= threshold && (!best || score > best.score)) {
      best = { result, score, reason };
    }
  }
  return best;
};

// Source ids the scraper knows about.
const SOURCE_TYPES = ['dlsite', 'dmm', 'bangumi', 'vndb', 'steam'];

// Default source priority per detected language, and the default match threshold.
// Single source of truth: the migration seed, the /auto/search fallback and the
// Settings page "Reset" all read these.
//
// DMM sits late in every list on purpose: it is the newest source and needs a
// Japanese network exit, so it should only add coverage where the established
// sources found nothing rather than changing existing behaviour.
const DEFAULT_MATCH_PRIORITY = {
  en: ['steam', 'vndb', 'bangumi', 'dlsite', 'dmm'],
  ja: ['dlsite', 'bangumi', 'dmm', 'steam', 'vndb'],
  zh: ['steam', 'bangumi', 'dlsite', 'vndb', 'dmm'],
};
const DEFAULT_MATCH_THRESHOLD = 0.8;

const KANA_RE = /[\u3040-\u309f\u30a0-\u30ff\uff66-\uff9f]/;
const HAN_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const LATIN_RE = /[a-z]/i;

/**
 * Which priority list to use for a name.
 *   RJ\d+ present        -> 'ja' (a DLsite product code)
 *   d_\d+ present        -> 'ja' (a DMM/FANZA doujin code)
 *   contains kana        -> 'ja'
 *   contains Han         -> 'zh'
 *   mostly latin letters -> 'en'
 *   otherwise            -> 'ja' (the app's home turf)
 */
const detectLanguage = (name) => {
  const raw = (name || '').normalize('NFKC');
  if (/[RV]J\d+/i.test(raw)) return 'ja';
  if (/\bd_\d{3,}\b/i.test(raw)) return 'ja';
  if (KANA_RE.test(raw)) return 'ja';
  if (HAN_RE.test(raw)) return 'zh';
  if (LATIN_RE.test(raw)) return 'en';
  return 'ja';
};

export {
  cleanName,
  similarity,
  similarityOfClean,
  bestMatch,
  detectLanguage,
  extractIdHint,
  ARCHIVE_EXT_RE,
  MIN_LATIN_WINDOW,
  MIN_CJK_WINDOW,
  SOURCE_TYPES,
  DEFAULT_MATCH_PRIORITY,
  DEFAULT_MATCH_THRESHOLD,
};
