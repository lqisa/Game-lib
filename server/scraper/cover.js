/**
 * Cover image handling.
 *
 * Covers are downloaded to `<dataDir>/covers/<sourceType>_<sourceId>.<ext>` and the file name is
 * stored in `game.cover_path`. A download can fail (network, or the app being closed mid-run) and
 * then nothing ever retries it, so the list keeps showing a placeholder until the game is scraped
 * by hand again. `resolveCoverUrl()` + the repair pass in routes/cover.js make that self-healing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../config.js';
import { scraperAxios } from './axios.js';
import { buildDlsiteCoverUrl } from './dlsite.js';
import { fetchDMMDetail } from './dmm.js';
import { fetchVNDBDetail } from './vndb.js';
import { fetchBangumiDetail } from './bangumi.js';
import { fetchSteamDetail } from './steam.js';

const COVERS_DIR = path.join(getDataDir(), 'covers');

const ensureCoversDir = () => {
  if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
  }
};

const coverExists = (coverPath) =>
  Boolean(coverPath) && fs.existsSync(path.join(COVERS_DIR, coverPath));

/**
 * DMM answers 302 to this asset for a path that does not exist, and axios follows the
 * redirect, so a wrong guess downloads a 2.7 KB "now printing" image that looks like a
 * success. Treat it as "no cover" rather than storing a placeholder as the real thing.
 */
const PLACEHOLDER_MARKER = 'now_printing';

const isPlaceholderImage = (finalUrl) => String(finalUrl || '').includes(PLACEHOLDER_MARKER);

// Image magic bytes. A cover URL that no longer resolves often answers 200 with an HTML
// error page (measured: a dead Steam path returns 200 + `text/html`, 1 MB of markup).
// Writing that as `steam_570.jpg` sets cover_path, so coverExists() reports true and the
// repair flow never revisits the row - the user just sees a broken image forever.
const IMAGE_SIGNATURES = [
  [0xff, 0xd8, 0xff], // jpeg
  [0x89, 0x50, 0x4e, 0x47], // png
  [0x47, 0x49, 0x46, 0x38], // gif
  [0x42, 0x4d], // bmp
];

const looksLikeImage = (buffer) => {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (buf.length < 12) return false;
  if (IMAGE_SIGNATURES.some((sig) => sig.every((byte, i) => buf[i] === byte))) return true;
  // webp is `RIFF....WEBP`
  return (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  );
};

/**
 * Download a cover and return the stored file name, or null when it could not be fetched.
 * The file is written before the name is returned, so `cover_path` never points at a missing file.
 */
const downloadCover = async (coverUrl, sourceType, sourceId) => {
  if (!coverUrl) return null;
  try {
    ensureCoversDir();
    const ext = coverUrl.match(/\.(jpg|jpeg|png|webp)/)?.[1] || 'jpg';
    const filename = `${sourceType}_${sourceId}.${ext}`;
    const filePath = path.join(COVERS_DIR, filename);
    const headers = {};
    if (coverUrl.includes('img.dlsite.jp')) {
      headers['Referer'] = 'https://www.dlsite.com/';
    }
    const response = await scraperAxios.get(coverUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers,
    });
    const finalUrl = response.request?.res?.responseUrl || coverUrl;
    if (isPlaceholderImage(finalUrl)) {
      console.warn(`cover is a placeholder for ${sourceType}:${sourceId} (${finalUrl})`);
      return null;
    }
    const body = Buffer.from(response.data);
    if (!looksLikeImage(body)) {
      // Not an image, so this is a dead URL or an error page - refuse it rather than
      // store something coverExists() would later treat as a healthy cover.
      console.warn(
        `cover is not an image for ${sourceType}:${sourceId} ` +
          `(content-type=${response.headers?.['content-type'] || '?'}, ${body.length}B, ${finalUrl})`,
      );
      return null;
    }
    fs.writeFileSync(filePath, body);
    return filename;
  } catch (err) {
    console.error('cover download failed:', err.message);
    return null;
  }
};

/**
 * Work out where a game's cover can be fetched from.
 * Prefers the URL recorded at adopt time (`game_source.raw_data`), and falls back to the
 * deterministic DLsite URL, which can be rebuilt from the RJ code alone.
 */
const resolveCoverUrl = (sourceType, sourceId, rawData) => {
  if (rawData) {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed.coverUrl === 'string' && parsed.coverUrl) {
        return parsed.coverUrl;
      }
    } catch {
      /* older rows stored null or non-JSON here */
    }
  }
  if (sourceType === 'dlsite' && typeof sourceId === 'string' && /^(RJ|VJ|BG|RE)\d+$/i.test(sourceId)) {
    return buildDlsiteCoverUrl(sourceId);
  }
  // DMM ids are `d_xxxxx`. Its asset path segment (`game` vs `comic`) is NOT derivable from
  // the id, and guessing wrong does not fail cleanly: DMM answers 302 to a "now printing"
  // placeholder, axios follows it, and the download looks successful - so the guess ends up
  // stored as the cover. Rather than guess, return null and let fetchCoverUrlFromSource()
  // read the real URL off the entry (DMM is in DETAIL_FETCH_SOURCES for this reason).
  return null;
};

// Sources whose cover URL can be recovered by re-reading the entry from the source itself.
// DLsite is absent on purpose: its cover URL is fully derivable from the RJ code, so
// resolveCoverUrl() already covers it without a network call.
// DMM IS here despite being a "no extra request" source in the happy path, because its
// cover URL is NOT derivable - the asset path contains a type segment (`/digital/game/`
// vs `/digital/comic/`) that cannot be read off the id. raw_data normally supplies the
// real URL, but when it is missing this is the only way to get the right one instead of
// a coin-flip guess.
const DETAIL_FETCH_SOURCES = new Set(['vndb', 'bangumi', 'steam', 'dmm']);

/**
 * Last resort for rows adopted before the cover URL was persisted: ask the source for the
 * entry again and take its cover URL. Costs one network call, so callers must bound it.
 * The bangumi token is passed in rather than read here, to keep this module free of db access.
 */
const fetchCoverUrlFromSource = async (sourceType, sourceId, bangumiToken = '') => {
  if (!DETAIL_FETCH_SOURCES.has(sourceType) || !sourceId) return null;
  try {
    if (sourceType === 'vndb') {
      const detail = await fetchVNDBDetail(sourceId);
      return detail?.coverURL || null;
    }
    if (sourceType === 'bangumi') {
      const detail = await fetchBangumiDetail(sourceId, bangumiToken);
      return detail?.coverURL || null;
    }
    if (sourceType === 'steam') {
      const detail = await fetchSteamDetail(sourceId);
      return detail?.coverURL || null;
    }
    if (sourceType === 'dmm') {
      // fetchDMMDetail throws on a region block rather than returning null, and that must
      // not abort the whole repair run - the catch below turns it into "no URL for this
      // row", which is the right outcome for a row we simply cannot resolve right now.
      const detail = await fetchDMMDetail(sourceId);
      return detail?.coverURL || null;
    }
  } catch (err) {
    console.error(`cover URL lookup failed for ${sourceType}:${sourceId}:`, err.message);
  }
  return null;
};

export {
  COVERS_DIR,
  coverExists,
  downloadCover,
  resolveCoverUrl,
  fetchCoverUrlFromSource,
  isPlaceholderImage,
  looksLikeImage,
  DETAIL_FETCH_SOURCES,
  ensureCoversDir,
};
