import { load } from 'cheerio';
import { retryGet } from './axios.js';

const STEAM_SEARCH_API = 'https://store.steampowered.com/api/storesearch/';
const STEAM_DETAIL_API = 'https://store.steampowered.com/api/appdetails';
const STEAM_LOCALE_CN = { cc: 'cn', l: 'schinese' };
const STEAM_LOCALE_EN = { cc: 'us', l: 'english' };

const stripHtmlTags = (html) => {
  if (!html) return '';
  try {
    const $ = load(html);
    return $.text().trim();
  } catch {
    return html.replace(/<[^>]+>/g, '').trim();
  }
};

const fetchWithLocale = async (appId, locale) => {
  const url = `${STEAM_DETAIL_API}?appids=${appId}&cc=${locale.cc}&l=${locale.l}`;
  let response;
  try {
    response = await retryGet(url);
  } catch (err) {
    console.error(`steam detail failed (${locale.l}):`, err.message);
    return null;
  }

  const data = response.data?.[appId];
  if (!data?.success) return null;

  const appData = data.data;
  if (!appData) return null;

  return {
    id: appId,
    title: appData.name || '',
    coverURL: appData.header_image || '',
    makers: Array.isArray(appData.developers)
      ? [...new Set(appData.developers)]
      : [],
    genres: Array.isArray(appData.genres)
      ? appData.genres.map((g) => g.description).filter(Boolean)
      : [],
    tags: Array.isArray(appData.tags)
      ? appData.tags.map((t) => t.name).filter(Boolean)
      : [],
    description: stripHtmlTags(appData.short_description || ''),
  };
};

const searchSteam = async (keyword) => {
  const url = `${STEAM_SEARCH_API}?term=${encodeURIComponent(keyword)}&cc=${STEAM_LOCALE_CN.cc}&l=${STEAM_LOCALE_CN.l}`;
  const response = await retryGet(url);

  const items = response.data?.items || [];
  return items
    .map((item) => {
      const appId = String(item.id);
      return {
        id: appId,
        name: item.name || '',
        makerName: Array.isArray(item.developer)
          ? item.developer[0]
          : typeof item.developer === 'string'
            ? item.developer
            : '',
        coverUrl: (item.tiny_image || '').trim(),
      };
    })
    .filter((r) => r.id && r.name);
};

const fetchSteamDetail = async (appId) => {
  let detail = await fetchWithLocale(appId, STEAM_LOCALE_CN);

  if (
    !detail ||
    !detail.title ||
    detail.title === appId ||
    detail.title.match(/^\d+$/)
  ) {
    detail = await fetchWithLocale(appId, STEAM_LOCALE_EN);
  }

  return detail;
};

export { searchSteam, fetchSteamDetail };