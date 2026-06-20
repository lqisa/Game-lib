const cheerio = require('cheerio')
const { retryGet } = require('./axios')

const searchDLSite = async (keyword) => {
  const rjMatch = keyword.match(/RJ(\d+)/)
  if (rjMatch) {
    return [{ rjcode: rjMatch[1], name: keyword, makerName: '' }]
  }

  const url = `https://www.dlsite.com/maniax/api/=/product.json?work_category%5B0%5D=%E5%90%8C%E4%BA%BA%E3%82%B2%E3%83%BC%E3%83%A0&keyword=${encodeURIComponent(keyword)}&order%5B%5D=trend&_locale=zh-cn`
  const response = await retryGet(url, {
    headers: { cookie: 'locale=zh-cn' }
  })

  const items = response.data
  if (!Array.isArray(items)) return []

  return items.map(item => {
    const workno = item.workno || ''
    const rjcode = workno.replace('RJ', '')
    return {
      rjcode,
      name: item.work_name || '',
      makerName: item.maker_name || ''
    }
  }).filter(r => r.rjcode)
}

const fetchDLSiteDetail = async (rjcode) => {
  const url = `https://www.dlsite.com/maniax/work/=/product_id/RJ${rjcode}.html`
  const response = await retryGet(url, {
    headers: { cookie: 'locale=zh-cn' }
  })
  const $ = cheerio.load(response.data)

  const work = { id: rjcode, tags: [], genres: [], makers: [] }

  const title = $('meta[property="og:title"]').attr('content')
  work.title = title ? title.replace(/ \[.+\] \| DLsite$/, '') : ''

  const candidateStr = $('.work_slider_container .slider_item.active img-with-fallback').attr(':candidates')
  let imgList = []
  if (candidateStr) {
    try {
      const parsed = JSON.parse(candidateStr.replace(/'/g, '"'))
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0]
        imgList = Array.isArray(first) ? first : [first]
      }
    } catch {
      imgList = candidateStr.replace(/[\[\]'\\]/g, '').split(',').filter(Boolean)
    }
  }
  const fallbackImg = $("meta[itemprop='image']").attr('content') || ''
  const twitterImg = $('meta[name="twitter:image:src"]').attr('content') || ''
  let coverURL = ''
  if (imgList.length > 0) {
    coverURL = imgList[0].startsWith('//') ? `https:${imgList[0]}` : imgList[0]
  } else if (fallbackImg) {
    coverURL = fallbackImg.startsWith('//') ? `https:${fallbackImg}` : fallbackImg
  } else if (twitterImg) {
    coverURL = twitterImg.startsWith('//') ? `https:${twitterImg}` : twitterImg
  }
  work.coverURL = coverURL

  const circleEl = $('span[class="maker_name"]').children('a')
  const circleName = circleEl.text().trim()
  if (circleName) {
    work.makers.push(circleName)
  }

  if (!work.makers.length) {
    const authorEl = $('#work_outline th').filter(function () { return $(this).text().trim() === '作者' })
      .parent().children('td').children('a').first()
    const authorName = authorEl.text().trim()
    if (authorName) {
      work.makers.push(authorName)
    }
  }

  $('th').each((_, el) => {
    const label = $(el).text().trim()
    if (label === '分类') {
      $(el).next('td').find('a').each((_, a) => {
        work.genres.push($(a).text().trim())
      })
    }
    if (label === '标签') {
      $(el).next('td').find('a').each((_, a) => {
        work.tags.push($(a).text().trim())
      })
    }
  })

  work.description = $('.work_parts_container .work_parts .work_text').text().trim()
    || $('meta[property="og:description"]').attr('content')?.replace(/「DLsite.*/, '').trim()
    || ''

  return work
}

module.exports = { searchDLSite, fetchDLSiteDetail }