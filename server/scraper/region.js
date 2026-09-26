/**
 * Region awareness for Japanese sources.
 *
 * DLsite and DMM both filter content by IP, and neither tells you: the restricted
 * works are simply absent from the response. A search that comes back empty because
 * of the network exit looks exactly like a search that found nothing.
 *
 * DLsite makes this cheap to detect - it returns the exit country on every response:
 *
 *   GET https://www.dlsite.com/maniax/api/=/product.json?keyword=…
 *   → X-Geo-Country-Code: JP
 *
 * so the check costs no extra request. DMM has no such header; it has to be inferred
 * from where the request ends up (see scraper/dmm.js).
 */

const GEO_HEADER = 'x-geo-country-code';
const JAPAN = 'JP';

/** Read the exit country DLsite reports, or null when the header is absent. */
const readGeoCountry = (res) => {
  const raw = res?.headers?.[GEO_HEADER];
  if (!raw) return null;
  const code = String(raw).trim().toUpperCase();
  return code || null;
};

/**
 * Build a user-facing notice when the request did not come from Japan, or null when
 * it did (or when the exit could not be determined).
 *
 * Deliberately non-fatal: results may still be usable, the user just needs to know
 * that the list is potentially incomplete.
 */
const buildRegionNotice = (country) => {
  if (!country || country === JAPAN) return null;
  return {
    country,
    isJapan: false,
    message:
      `Network exit is ${country} (not Japan). DLsite and DMM silently filter some works ` +
      `by IP, so they may be missing from the results entirely with no error. ` +
      `Switch to a Japanese node and retry.`,
  };
};

/**
 * Notice for a search that came back empty. An empty result is ambiguous - the work
 * may not exist, or it may have been filtered by IP - so say which one it probably is
 * instead of leaving the user to guess.
 */
const buildEmptyResultNotice = (keyword, country) => {
  const hasProductCode =
    /(RJ|VJ|BG|RE)\d+/i.test(keyword || '') || /\bd_\d{3,}\b/i.test(keyword || '');
  if (!hasProductCode) return buildRegionNotice(country);

  if (country && country !== JAPAN) {
    // Almost certainly the cause, and the user can act on it.
    return buildRegionNotice(country);
  }
  if (country === JAPAN) {
    // The exit is already correct, so region is not the explanation - do not send
    // the user chasing their proxy settings for nothing.
    return {
      country,
      isJapan: true,
      message:
        'No results for a product-code search, and the network exit is already Japan - ' +
        'so the work most likely does not exist or has been delisted.',
    };
  }
  return {
    country: null,
    isJapan: null,
    message:
      'No results for a product-code search. If the work does exist, check that the ' +
      'network exit is Japan (region-restricted works are never returned, and no error is raised).',
  };
};

export { GEO_HEADER, JAPAN, readGeoCountry, buildRegionNotice, buildEmptyResultNotice };
