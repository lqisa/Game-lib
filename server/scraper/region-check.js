/**
 * On-demand probe of the network exit, as the Japanese sources see it.
 *
 * Used by GET /api/scraper/region so the UI can tell the user "your exit is not Japan"
 * before (or after) a search silently comes back thin. This is the answer to the
 * practical problem: the user knows region limits exist and normally switches proxy by
 * hand - what they need is to be told when they forgot.
 *
 * Kept separate from the scrapers so neither has to import the other.
 */
import { scraperAxios } from './axios.js';
import { readGeoCountry, buildRegionNotice, JAPAN } from './region.js';
import { DMM_HEADERS, classifyDmmResponse } from './dmm.js';

const DLSITE_PROBE_URL =
  'https://www.dlsite.com/maniax/api/=/product.json?keyword=RJ&_locale=zh-cn';
const DMM_PROBE_URL = 'https://www.dmm.co.jp/search/=/searchstr=RJ/';

const finalUrl = (res) => res?.request?.res?.responseUrl || res?.request?.path || '';

/** DLsite reports the exit country on every response, so this probe is exact. */
const probeDlsite = async () => {
  try {
    const res = await scraperAxios.get(DLSITE_PROBE_URL, {
      headers: { cookie: 'locale=zh-cn' },
      timeout: 15000,
    });
    const country = readGeoCountry(res);
    return { country, isJapan: country === JAPAN, error: null };
  } catch (err) {
    return { country: null, isJapan: null, error: err.message };
  }
};

/**
 * DMM exposes no country header, so the exit is inferred from whether a normal search
 * page is served or the request is bounced to the region / login page.
 */
const probeDmm = async () => {
  try {
    const res = await scraperAxios.get(DMM_PROBE_URL, {
      headers: DMM_HEADERS,
      timeout: 15000,
      validateStatus: (s) => s === 200,
    });
    const blocked = classifyDmmResponse(
      finalUrl(res),
      typeof res.data === 'string' ? res.data : '',
    );
    return { isJapan: blocked === 'ok', blocked: blocked === 'region', error: null };
  } catch (err) {
    // A redirect out of the 200 range shows up as a rejection here.
    const blocked = classifyDmmResponse(
      err?.request?.res?.responseUrl || err?.request?.path || '',
      '',
    );
    if (blocked === 'region') return { isJapan: false, blocked: true, error: null };
    return { isJapan: null, blocked: false, error: err.message };
  }
};

/**
 * @returns {Promise<{isJapan: boolean|null, country: string|null, dlsite: object, dmm: object, region: object|null}>}
 */
const checkExit = async () => {
  const [dlsite, dmm] = await Promise.all([probeDlsite(), probeDmm()]);

  // DLsite's answer is authoritative when present; DMM only says reachable or not.
  let isJapan = null;
  if (dlsite.isJapan !== null) isJapan = dlsite.isJapan;
  else if (dmm.isJapan !== null) isJapan = dmm.isJapan;

  // Same shape the search responses carry, so the UI has one thing to render.
  let region = null;
  if (isJapan === false) {
    region = dlsite.country
      ? buildRegionNotice(dlsite.country)
      : {
          country: null,
          isJapan: false,
          // DMM refused the request but exposed no country, so do not invent one.
          message:
            'DMM refused the request and the network exit is not Japan. DLsite and DMM ' +
            'silently filter some works by IP - switch to a Japanese node and retry.',
        };
  }

  return { isJapan, country: dlsite.country, dlsite, dmm, region };
};

export { checkExit, probeDlsite, probeDmm };
