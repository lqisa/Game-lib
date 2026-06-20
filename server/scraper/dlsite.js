const cheerio = require('cheerio')
const { retryGet } = require('./axios')

const searchDLSite = async (keyword) => {
  const url = `https://www.dlsite.com/maniax/fsr/=/keyword/${encodeURIComponent(keyword)}/work_category%5B0%5D/%E5%90%8C%E4%BA%BA%E3%82%B2%E3%83%BC%E3%83%A0/order%5B%5D/trend`
  const response = await retryGet(url, {
    headers: { cookie: 'locale=zh-cn' }
  })
  const $ = cheerio.load(response.data)
  const results = []

  $('table.work_1col tr').each((_, el) => {
    const titleEl = $(el).find('.work_name a')
    const name = titleEl.text().trim()
    const href = titleEl.attr('href') || ''
    const rjMatch = href.match(/RJ(\d+)/)
    if (name && rjMatch) {
      const rjcode = rjMatch[1]
      const makerEl = $(el).find('.maker_name a')
      const makerName = makerEl.text().trim()
      results.push({ rjcode, name, makerName })
    }
  })

  return results
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
  const imgList = candidateStr
    ? candidateStr.replace(/[['\\]\s]/g, '').split(',').filter(Boolean)
    : []
  const fallbackImg = $("meta[itemprop='image']").attr('content') || ''
  let coverURL = ''
  if (imgList.length > 0) {
    coverURL = imgList[0].startsWith('//') ? `https:${imgList[0]}` : imgList[0]
  } else if (fallbackImg) {
    coverURL = fallbackImg.startsWith('//') ? `https:${fallbackImg}` : fallbackImg
  }
  work.coverURL = coverURL

  const circleEl = $('span[class="maker_name"]').children('a')
  const circleName = circleEl.text().trim()
  if (circleName) {
    work.makers.push(circleName)
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

  return work
}

module.exports = { searchDLSite, fetchDLSiteDetail }