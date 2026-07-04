import { load } from 'cheerio';
import { scraperAxios, retryGet } from './axios.js';

const buildDlsiteCoverUrl = (rjcode, isAnnounce) => {
  const match = rjcode.match(/^(RJ|VJ|BG|RE)(\d+)$/i);
  if (!match) return '';
  const prefix = match[1].toUpperCase();
  const num = parseInt(match[2], 10);
  const folder = String(Math.ceil(num / 1000) * 1000).padStart(8, '0');
  if (isAnnounce) {
    return `https://img.dlsite.jp/modpub/images2/ana/doujin/${prefix}${folder}/${rjcode.toUpperCase()}_ana_img_sam.jpg`;
  }
  return `https://img.dlsite.jp/modpub/images2/work/doujin/${prefix}${folder}/${rjcode.toUpperCase()}_img_main.jpg`;
};

const searchDLSite = async (keyword) => {
  const url = `https://www.dlsite.com/maniax/api/=/product.json?work_category%5B0%5D=%E5%90%8C%E4%BA%BA%E3%82%B2%E3%83%BC%E3%83%A0&keyword=${encodeURIComponent(keyword)}&order%5B%5D=trend&_locale=zh-cn`;
  const response = await retryGet(url, {
    headers: { cookie: 'locale=zh-cn' },
  });

  const items = response.data;
  if (Array.isArray(items) && items.length > 0) {
    return items
      .map((item) => {
        const workno = item.workno || '';
        const rjcode = workno;
        let coverUrl = '';
        const img = item.image_main || item.image_thum || item.image_mini;
        if (img && typeof img === 'object') {
          coverUrl = img.url || '';
        } else if (typeof img === 'string') {
          coverUrl = img;
        }
        if (coverUrl && coverUrl.startsWith('//')) {
          coverUrl = `https:${coverUrl}`;
        }
        return {
          id: rjcode,
          rjcode,
          name: item.work_name || '',
          makerName: item.maker_name || '',
          coverUrl,
        };
      })
      .filter((r) => r.rjcode && /^(RJ|VJ|BG|RE)\d+$/i.test(r.rjcode));
  }

  try {
    const suggestUrl = `https://www.dlsite.com/suggest/?term=${encodeURIComponent(keyword)}&site=adult-jp`;
    const suggestResp = await retryGet(suggestUrl, {
      headers: { cookie: 'locale=zh-cn' },
    });
    let suggestData = suggestResp.data;
    if (typeof suggestData === 'string') {
      const jsonpMatch = suggestData.match(/^[^(]*\((.+)\)$/s);
      suggestData = jsonpMatch ? JSON.parse(jsonpMatch[1]) : JSON.parse(suggestData);
    }
    const works = suggestData?.work || [];
    if (works.length > 0) {
      return works
        .map((w) => {
          const rjcode = w.workno || '';
          return {
            id: rjcode,
            rjcode,
            name: w.work_name || '',
            makerName: w.maker_name || '',
            coverUrl: w.is_ana ? buildDlsiteCoverUrl(rjcode, true) : '',
          };
        })
        .filter((r) => r.rjcode && /^(RJ|VJ|BG|RE)\d+$/i.test(r.rjcode));
    }
  } catch {}

  const codeMatch = keyword.match(/(RJ\d+)/i);
  if (codeMatch) {
    const rjcode = codeMatch[1].toUpperCase();
    const workUrl = `https://www.dlsite.com/maniax/work/=/product_id/${rjcode}.html`;
    try {
      await scraperAxios.get(workUrl, {
        timeout: 10000,
        headers: { cookie: 'locale=zh-cn' },
        validateStatus: (s) => s === 200,
      });
      return [{ id: rjcode, rjcode, name: rjcode, makerName: '', coverUrl: '' }];
    } catch {}
    const announceUrl = `https://www.dlsite.com/maniax/announce/=/product_id/${rjcode}.html`;
    try {
      await scraperAxios.get(announceUrl, {
        timeout: 10000,
        headers: { cookie: 'locale=zh-cn' },
        validateStatus: (s) => s === 200,
      });
      return [{ id: rjcode, rjcode, name: rjcode, makerName: '', coverUrl: '' }];
    } catch {}
  }

  return [];
};

const normalizeDlsiteCode = (code) => {
  const match = code.match(/^(RJ|VJ|BG|RE)(\d+)$/i);
  if (match) return { prefix: match[1].toUpperCase(), num: match[2] };
  return { prefix: 'RJ', num: code.replace(/^(RJ|VJ|BG|RE)/i, '') };
};

const fetchDLSiteDetail = async (rjcode) => {
  const { prefix, num } = normalizeDlsiteCode(rjcode);
  let response;
  let isAnnounce = false;

  try {
    response = await retryGet(
      `https://www.dlsite.com/maniax/work/=/product_id/${prefix}${num}.html`,
      { headers: { cookie: 'locale=zh-cn' }, validateStatus: (s) => s === 200 },
      1,
    );
  } catch {}

  if (!response) {
    try {
      response = await retryGet(
        `https://www.dlsite.com/maniax/announce/=/product_id/${prefix}${num}.html`,
        { headers: { cookie: 'locale=zh-cn' }, validateStatus: (s) => s === 200 },
        1,
      );
      isAnnounce = true;
    } catch {}
  }

  if (!response) {
    throw new Error(`Product ${prefix}${num} not found`);
  }

  const $ = load(response.data);

  const work = { id: rjcode, tags: [], genres: [], makers: [] };

  const title = $('meta[property="og:title"]').attr('content');
  work.title = title ? title.replace(/ \[.+\] \| DLsite$/, '') : '';

  const candidateStr = $('.work_slider_container .slider_item.active img-with-fallback').attr(
    ':candidates',
  );
  let imgList = [];
  if (candidateStr) {
    try {
      const parsed = JSON.parse(candidateStr.replace(/'/g, '"'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        imgList = Array.isArray(first) ? first : [first];
      }
    } catch {
      imgList = candidateStr
        .replace(/[\[\]'\\]/g, '')
        .split(',')
        .filter(Boolean);
    }
  }
  const fallbackImg = $("meta[itemprop='image']").attr('content') || '';
  const twitterImg = $('meta[name="twitter:image:src"]').attr('content') || '';
  let coverURL = '';
  if (imgList.length > 0) {
    coverURL = imgList[0].startsWith('//') ? `https:${imgList[0]}` : imgList[0];
  } else if (fallbackImg) {
    coverURL = fallbackImg.startsWith('//') ? `https:${fallbackImg}` : fallbackImg;
  } else if (twitterImg) {
    coverURL = twitterImg.startsWith('//') ? `https:${twitterImg}` : twitterImg;
  }
  if (!coverURL) {
    coverURL = buildDlsiteCoverUrl(rjcode, isAnnounce);
  }
  work.coverURL = coverURL;

  const circleEl = $('span[class="maker_name"]').children('a');
  const circleName = circleEl.text().trim();
  if (circleName) {
    work.makers.push(circleName);
  }

  if (!work.makers.length) {
    const authorEl = $('#work_outline th')
      .filter(function () {
        return $(this).text().trim() === '作者';
      })
      .parent()
      .children('td')
      .children('a')
      .first();
    const authorName = authorEl.text().trim();
    if (authorName) {
      work.makers.push(authorName);
    }
  }

  $('th').each((_, el) => {
    const label = $(el).text().trim();
    if (label === '分类') {
      $(el)
        .next('td')
        .find('a')
        .each((_, a) => {
          work.genres.push($(a).text().trim());
        });
    }
    if (label === '标签') {
      $(el)
        .next('td')
        .find('a')
        .each((_, a) => {
          work.tags.push($(a).text().trim());
        });
    }
  });

  work.description =
    $('.work_parts_container .work_parts .work_text').text().trim() ||
    $('meta[property="og:description"]')
      .attr('content')
      ?.replace(/「DLsite.*/, '')
      .trim() ||
    '';

  return work;
};

export { searchDLSite, fetchDLSiteDetail };