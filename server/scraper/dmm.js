import { load } from 'cheerio';
import { retryGet } from './axios.js';

/**
 * DMM / FANZA (doujin) metadata source.
 *
 * Scrapes HTML rather than using the official Affiliate API: the API needs an
 * approved `api_id` + `affiliate_id`, and returns a thinner set of fields. The
 * HTML route needs no account at all.
 *
 * Two hard requirements, both verified against the live site:
 *  1. A Japanese network exit. From outside Japan every FANZA page is either
 *     redirected to a region-block page or to a login wall. Neither is a
 *     selector problem, and neither is fixable in code - hence the explicit
 *     region errors below.
 *  2. The `age_check_done=1` cookie, or adult pages bounce to /age_check/.
 *
 * The two page templates are in different states of decay, so they are handled
 * differently:
 *  - Detail page: still BEM (`.productTitle__txt`, `.informationList`, ...).
 *    Selectors below are the ones Playnite has used since 2022 and still work.
 *  - Search page: migrated to Tailwind utility classes (`.tmb` is gone). There
 *    is nothing stable to hook onto, so results are read through *structural*
 *    selectors (the product link URL shape, sibling relationships) and the
 *    class names are only a last resort.
 */

const DMM_ORIGIN = 'https://www.dmm.co.jp';
const DETAIL_BASE = `${DMM_ORIGIN}/dc/doujin/-/detail/=/cid=`;
// Scoped to the doujin section on purpose. The site-wide search (`/search/=/searchstr=`)
// covers every category, so a common word fills the first page with DVD/book results and
// returns no doujin at all - measured: 忍法 10 vs 120, ハーレム 0 vs 120, 先輩 0 vs 120.
const SEARCH_BASE = `${DMM_ORIGIN}/dc/doujin/-/search/=/searchstr=`;

// DMM is really two shops behind one login, with different hosts, ids and page shapes:
//   同人 (doujin) : www.dmm.co.jp/dc/doujin/   id `d_216826`    detail /-/detail/=/cid=<id>/
//   PCゲーム      : dlsoft.dmm.co.jp           id `sisp_0014`   detail /detail/<id>/
// Some works (commercial eroge) exist only in the second, so both are searched.
const PC_ORIGIN = 'https://dlsoft.dmm.co.jp';
// `service=pcgame` is required - without it dlsoft answers a different vertical.
const PC_SEARCH_BASE = `${PC_ORIGIN}/search/?service=pcgame&searchstr=`;
const PC_DETAIL_BASE = `${PC_ORIGIN}/detail/`;

const DMM_HEADERS = {
  cookie: 'age_check_done=1',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// A doujin content id: `d_` + digits (e.g. d_216826).
const CID_RE = /\b(d_\d{3,})\b/i;
const CID_IN_HREF_RE = /cid=(d_\d+)/i;

// A PC game (dlsoft) content id: brand prefix + `_` + alphanumeric, e.g. sisp_0014,
// cape_0036, fanzagames_0181, sisp_0038pack. Note `d_216826` also fits this shape,
// so the doujin form is always tested first.
const PC_CID_RE = /\b([a-z]+_[a-z0-9]{3,})\b/i;
const PC_CID_IN_HREF_RE = /\/detail\/([a-z]+_[a-z0-9]+)/i;

const isDoujinId = (value) => /^d_\d+$/i.test(String(value || '').trim());

const isPcGameId = (value) => {
  const v = String(value || '').trim();
  return !isDoujinId(v) && /^[a-z]+_[a-z0-9]+$/i.test(v);
};

// Region / gate markers, matched against both the final URL and the body.
const REGION_BLOCK_MARKER = 'not-available-in-your-region';
const LOGIN_WALL_MARKER = 'accounts.dmm.co.jp/service/login';

const REGION_ERROR_MESSAGE =
  'DMM refused the request: the network exit is not Japan. Check that the proxy is on ' +
  'and exits through a Japanese node (DMM serves a region-block or login page to non-JP IPs).';

const regionError = () => {
  const err = new Error(REGION_ERROR_MESSAGE);
  err.code = 'DMM_REGION_BLOCKED';
  return err;
};

const selectorError = (what) => {
  const err = new Error(
    `DMM ${what} page structure may have changed (core selectors did not match). ` +
      `This usually means DMM redesigned the page and the selectors need updating.`,
  );
  err.code = 'DMM_SELECTOR_MISSING';
  return err;
};

/** Final URL after redirects - axios puts it on the underlying request. */
const finalUrl = (res) =>
  res?.request?.res?.responseUrl || res?.request?.path || res?.config?.url || '';

/**
 * Pure classification of a DMM response, kept separate so the "blocked or not"
 * decision can be tested without a network call.
 *
 * The two markers have to be matched differently:
 *  - `not-available-in-your-region` is only ever present on the block page, so it is
 *    safe to look for it in the body as well as the final URL.
 *  - `accounts.dmm.co.jp/service/login` appears ~5 times in the markup of a perfectly
 *    normal product page (login links in the header). Matching it against the body
 *    flags every page as blocked, so it may only be matched against the final URL,
 *    where it shows up as the redirect target.
 *
 * The login wall is folded into the region case on purpose: DMM serves the region
 * page or the login page depending on which check runs first, but for us both mean
 * "this network exit cannot read the page", and both are fixed the same way.
 */
const classifyDmmResponse = (url, body) => {
  const u = String(url || '');
  const b = String(body || '');
  if (u.includes(REGION_BLOCK_MARKER) || b.includes(REGION_BLOCK_MARKER)) return 'region';
  if (u.includes(LOGIN_WALL_MARKER)) return 'region';
  return 'ok';
};

/**
 * Turn a DMM response into either a usable body or a precise error.
 * Distinguishing "blocked" from "redesigned" matters: the first is a network
 * problem the user can fix, the second is a code problem they cannot.
 */
const readPage = (res, what) => {
  const body = typeof res.data === 'string' ? res.data : '';
  if (classifyDmmResponse(finalUrl(res), body) === 'region') {
    throw regionError();
  }
  return body;
};

const isDmmId = (value) => CID_RE.test(String(value || ''));

/**
 * DMM answers 404 for a work that does not exist (rather than rendering an error page),
 * which is a different thing from "DMM changed its markup". Only 404 is read as
 * "no such work"; everything else keeps propagating.
 */
const isDmmNotFound = (err) => err?.response?.status === 404;

/** Extract the bare `d_xxxxx` id from a DMM id, URL or free text. */
/**
 * Pull a DMM content id out of anything we might be handed: a bare id, a detail URL
 * (either shop), or a folder name like "[sisp_0014] …". Doujin ids are checked first
 * because `d_216826` also matches the PC game shape.
 */
const extractDmmId = (value) => {
  const raw = String(value || '');

  const doujinHref = raw.match(CID_IN_HREF_RE);
  if (doujinHref) return doujinHref[1].toLowerCase();
  const doujinBare = raw.match(CID_RE);
  if (doujinBare) return doujinBare[1].toLowerCase();

  const pcHref = raw.match(PC_CID_IN_HREF_RE);
  if (pcHref) return pcHref[1].toLowerCase();
  const pcBare = raw.match(PC_CID_RE);
  return pcBare ? pcBare[1].toLowerCase() : null;
};

/**
 * The search cards ship a 200x150 thumbnail whose path already contains the
 * correct type segment (`/digital/game/…` vs `/digital/comic/…`). Dropping the
 * `-WxH` suffix yields the 560x420 version of the same image, so we never have
 * to guess the type segment (which is NOT derivable from the id alone).
 */
const upgradeImageUrl = (url) =>
  String(url || '')
    .split('?')[0]
    .replace(/-\d+x\d+(\.\w+)$/, '$1');

/**
/**
 * Strip the campaign prefix DMM prepends to titles.
 * The prefix normally lives in `.productTitle__txt--campaign`, but some layouts
 * inline it into the h1 text (e.g. "【30%OFF】\nタイトル"), so both are handled.
 */
const cleanDmmTitle = (raw) => {
  let title = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  title = title.replace(
    /^【[^】]*(?:OFF|ポイント|還元|セール|CP|キャンペーン|クーポン)[^】]*】\s*/i,
    '',
  );
  return title.trim();
};

/** Read the display title of a search-result card. */
const readCardName = ($, card) => {
  // Primary: the title paragraph. `font-bold` is kept, `text-sm`/`line-clamp-2`
  // are dropped so a small utility-class reshuffle does not break us.
  const p = card.find('p.font-bold').first();
  if (p.length) return cleanDmmTitle(p.text());

  // Fallback: the title box minus its leading format badge ("デジタル同人").
  const box = card.find('div.mr-3').first();
  if (box.length) {
    const all = box.text().replace(/\s+/g, ' ').trim();
    const badge = box.children().first().text().replace(/\s+/g, ' ').trim();
    return cleanDmmTitle(badge && all.startsWith(badge) ? all.slice(badge.length) : all);
  }

  // Last resort: the doujin search page still uses the older tile layout, where the only
  // place the title appears is the thumbnail's alt text. Without this the card has no
  // name and gets filtered out entirely.
  const alt = (card.find('img[alt]').first().attr('alt') || '').trim();
  return alt ? cleanDmmTitle(alt) : '';
};

/** "…660円-サークル：CAISSON" -> "CAISSON" */
const readCardMaker = (text) => {
  const m = String(text || '').match(/サークル[：:]\s*(.+)$/);
  return m ? m[1].trim() : '';
};

/** Doujin search cards (`www.dmm.co.jp/dc/doujin/`). */
const searchDoujinCards = async (keyword) => {
  const url = `${SEARCH_BASE}${encodeURIComponent(keyword)}/`;
  // A 404 is DMM's way of saying "nothing in the doujin section": it redirects the
  // zero-result case to a narrow-search page that 404s. Treating that as an error would
  // retry three times and then fail the whole scrape with a 500, which is wrong - the
  // honest answer is "no results here".
  const res = await retryGet(url, {
    headers: DMM_HEADERS,
    timeout: 20000,
    validateStatus: (s) => s === 200 || s === 404,
  });
  if (res.status === 404) return [];
  const html = readPage(res, 'search');
  const $ = load(html);

  // Structural hook: the product link itself. Stable across the Tailwind
  // rewrite because it is derived from the URL scheme, not from styling.
  const found = new Map();
  $('a[href*="/detail/=/cid="]').each((_, el) => {
    const $el = $(el);
    const cid = ($el.attr('href') || '').match(CID_IN_HREF_RE)?.[1]?.toLowerCase();
    if (!cid || found.has(cid)) return;

    const card = $el.parent();
    const cardText = card.text().replace(/\s+/g, ' ').trim();
    const coverUrl =
      upgradeImageUrl($el.find('img').first().attr('src')) ||
      upgradeImageUrl($el.find('img').first().attr('data-src'));

    found.set(cid, {
      id: cid,
      name: readCardName($, card),
      makerName: readCardMaker(cardText),
      // No URL rather than a guessed one: a wrong type segment answers 302 to a
      // "now printing" placeholder, which looks like a successful download.
      coverUrl,
    });
  });
  return [...found.values()];
};

/**
 * PC game search cards (`dlsoft.dmm.co.jp`). A different shop with its own host, id
 * scheme and markup - notably the result list IS server-rendered here, and each card
 * carries its title in the link's `title` attribute plus a full-size cover path.
 */
const searchPcGameCards = async (keyword) => {
  const url = `${PC_SEARCH_BASE}${encodeURIComponent(keyword)}`;
  const res = await retryGet(url, {
    headers: DMM_HEADERS,
    timeout: 20000,
    validateStatus: (s) => s === 200 || s === 404,
  });
  if (res.status === 404) return [];
  const html = readPage(res, 'search');
  const $ = load(html);

  const found = new Map();
  $('li.productListItem').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a[href*="/detail/"]').first();
    if (!link.length) return;
    const id = (link.attr('href') || '').match(PC_CID_IN_HREF_RE)?.[1]?.toLowerCase();
    if (!id || found.has(id)) return;

    const img = $el.find('img').first();
    found.set(id, {
      id,
      name: cleanDmmTitle(link.attr('title') || ''),
      makerName: '',
      coverUrl: upgradeImageUrl(img.attr('src')) || upgradeImageUrl(img.attr('data-src')),
    });
  });
  return [...found.values()];
};

const searchDMM = async (keyword) => {
  // The two shops are independent reads, so they run at once. No extra retry layer is
  // needed on top: each request already retries internally (retryGet), so a shop that
  // is still rejected here is genuinely down, and the other shop's results stand.
  const [doujin, pcgame] = await Promise.allSettled([
    searchDoujinCards(keyword),
    searchPcGameCards(keyword),
  ]);

  const found = new Map();

  // Insertion order is fixed (doujin first) rather than resolution order, so the
  // ranking the caller sees does not depend on which shop answered first.
  if (doujin.status === 'fulfilled') {
    for (const card of doujin.value) found.set(card.id, card);
  } else {
    // One shop failing must not hide the other's results, but it must not vanish
    // either - a silently skipped shop looks identical to "no results".
    console.warn(
      `[dmm/search] doujin search failed:`,
      doujin.reason?.code || doujin.reason?.message,
    );
  }

  if (pcgame.status === 'fulfilled') {
    for (const card of pcgame.value) {
      if (!found.has(card.id)) found.set(card.id, card);
    }
  } else {
    console.warn(
      `[dmm/search] PC game search failed:`,
      pcgame.reason?.code || pcgame.reason?.message,
    );
  }

  const results = [...found.values()].filter((r) => r.id && r.name);
  if (results.length > 0) return results;

  // Nothing matched by keyword. If the name carries a DMM id, go straight to that work:
  // this mirrors the RJ-code fallback searchDLSite already has, and it is the difference
  // between a folder named "[d_216826] something" resolving or not - DMM's search does
  // not understand that string, so the keyword alone can never find it.
  const hinted = extractDmmId(keyword);
  if (hinted) {
    const detail = await fetchDMMDetail(hinted);
    if (detail) {
      return [
        {
          id: detail.id,
          name: detail.title,
          makerName: detail.makers?.[0] || '',
          coverUrl: detail.coverURL || '',
        },
      ];
    }
  }

  // Genuinely nothing. A 200 with zero results is either an empty search or a silent
  // layout change; the caller cannot tell the difference, so say so.
  console.warn(
    `[dmm/search] "${keyword}" returned 0 results (either no match, or the page structure changed)`,
  );
  return [];
};

/**
 * Fetch one work by id, whichever shop it lives in. Doujin is the common case for this
 * app; a PC game id must not be sent to the doujin detail URL because it 404s there.
 */
const fetchDMMDetail = async (id) => {
  const cid = extractDmmId(id);
  if (!cid) return null;
  return isDoujinId(cid) ? fetchDoujinDetail(cid) : fetchPcGameDetail(cid);
};

const fetchDoujinDetail = async (cid) => {
  const url = `${DETAIL_BASE}${cid}/`;
  const res = await retryGet(url, {
    headers: DMM_HEADERS,
    timeout: 20000,
    validateStatus: (s) => s === 200,
  }).catch((err) => {
    // A 404 means the work does not exist, which is a different thing from "DMM changed
    // its markup". Return null so callers can answer 404 instead of reporting a
    // structure problem.
    if (isDmmNotFound(err)) return null;
    throw err;
  });
  if (!res) return null;

  const html = readPage(res, 'detail');
  const $ = load(html);

  const titleEl = $('h1.productTitle__txt').first();
  if (!titleEl.length) {
    // 200 but no product title: this is a redesign, not a region problem.
    throw selectorError('detail');
  }

  let title = titleEl.text().replace(/\s+/g, ' ').trim();
  const promo = titleEl.find('.productTitle__txt--campaign');
  if (promo.length) {
    const prefix = promo.last().text().replace(/\s+/g, ' ').trim();
    const at = title.indexOf(prefix);
    if (at !== -1) title = title.slice(at + prefix.length);
  }
  title = cleanDmmTitle(title);

  const makers = [];
  const circle = $('.circleName__txt').first().text().replace(/\s+/g, ' ').trim();
  if (circle) makers.push(circle);

  // `informationList` rows: ゲームジャンル is the game's genre (theme), ジャンル
  // is the tag list. シリーズ/配信開始日/作品形式 are extras we do not store yet.
  const info = {};
  $('.informationList').each((_, el) => {
    const key = $(el).find('.informationList__ttl').first().text().trim();
    if (!key) return;
    const tags = $(el)
      .find('.genreTag__txt')
      .map((__, t) => $(t).text().trim())
      .get()
      .filter(Boolean);
    info[key] = tags.length ? tags : $(el).find('.informationList__txt').first().text().trim();
  });

  const toList = (value) =>
    Array.isArray(value) ? value : value ? [String(value).trim()].filter(Boolean) : [];

  // The full description lives in `p.summary__txt`; og:description is a short
  // site-level blurb and is deliberately not used here.
  const description = $('p.summary__txt').first().text().trim();

  // og:image is DMM's own choice of representative image and carries the right type
  // segment. Empty when absent, rather than a guess - see searchDMM for why guessing
  // the type segment is worse than returning nothing.
  const coverURL = ($('meta[property="og:image"]').attr('content') || '').split('?')[0];

  return {
    id: cid,
    title,
    coverURL,
    makers,
    genres: toList(info['ゲームジャンル']),
    tags: toList(info['ジャンル']),
    description,
    // Extras kept for future use; the adopt flow ignores unknown keys.
    series: info['シリーズ'] || '',
    releaseDate: (info['配信開始日'] || '').split(' ')[0] || '',
    workType: info['作品形式'] || '',
  };
};

/**
 * PC game (dlsoft) detail page. The class names differ from the doujin page, but the
 * info labels are the same (ブランド / ゲームジャンル / ジャンル / シリーズ), so the same
 * buckets can be filled and the rest of the app needs no changes.
 */
const fetchPcGameDetail = async (cid) => {
  const url = `${PC_DETAIL_BASE}${cid}/`;
  const res = await retryGet(url, {
    headers: DMM_HEADERS,
    timeout: 20000,
    validateStatus: (s) => s === 200,
  }).catch((err) => {
    // Same as doujin: a missing work is a 404, not a redesign.
    if (isDmmNotFound(err)) return null;
    throw err;
  });
  if (!res) return null;

  const html = readPage(res, 'detail');
  const $ = load(html);

  // h1 is the clean display title here; og:title is the same string and is truncated
  // on some works, so h1 is preferred.
  const title = $('h1').first().text().replace(/\s+/g, ' ').trim();
  if (!title) throw selectorError('PC game detail');

  const info = {};
  $('.contentsDetailTop__tableRow, .contentsDetailBottom__tableRow').each((_, el) => {
    const key = $(el).find('[class*="tableDataLeft"]').first().text().replace(/\s+/g, ' ').trim();
    if (!key) return;
    info[key] = $(el).find('[class*="tableDataRight"]').first().text().replace(/\s+/g, ' ').trim();
  });

  // These rows come back as one space-separated string (e.g. "人妻 巨乳 淫乱"), unlike
  // the doujin page which gives a tag list.
  const toList = (value) =>
    String(value || '')
      .split(/[\s、,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    id: cid,
    title: cleanDmmTitle(title),
    coverURL: ($('meta[property="og:image"]').attr('content') || '').split('?')[0],
    makers: toList(info['ブランド']),
    genres: toList(info['ゲームジャンル']),
    tags: toList(info['ジャンル']),
    description: ($('meta[property="og:description"]').attr('content') || '').trim(),
    series: info['シリーズ'] || '',
    releaseDate: (info['ダウンロード版配信開始日'] || '').split(' ')[0] || '',
    // No 作品形式 row on this page.
    workType: '',
  };
};

export {
  searchDMM,
  fetchDMMDetail,
  extractDmmId,
  upgradeImageUrl,
  cleanDmmTitle,
  classifyDmmResponse,
  isDmmId,
  isDoujinId,
  isPcGameId,
  isDmmNotFound,
  DMM_HEADERS,
  REGION_ERROR_MESSAGE,
};
