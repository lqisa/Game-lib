import { retryGet } from './axios.js'

const searchBangumi = async (keyword, token) => {
  const url = `https://api.bgm.tv/search/subject/${encodeURIComponent(keyword)}?type=4`
  const headers = { 'User-Agent': 'game-lib/1.0' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await retryGet(url, { headers })
  const data = response.data
  const list = data.list || []
  return list.map(item => ({
    id: String(item.id),
    name: item.name_cn || item.name || '',
    makerName: '',
    coverUrl: item.images?.large || item.images?.common || ''
  }))
}

const fetchBangumiDetail = async (subjectId, token) => {
  const headers = { 'User-Agent': 'game-lib/1.0' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let detail = null
  try {
    const url = `https://api.bgm.tv/v0/subjects/${subjectId}`
    const response = await retryGet(url, { headers })
    detail = response.data
  } catch {
    try {
      const url = `https://api.bgm.tv/subject/${subjectId}`
      const response = await retryGet(url, { headers })
      detail = response.data
    } catch {
      return null
    }
  }

  if (!detail) return null

  const work = {
    id: String(detail.id || subjectId),
    title: detail.name_cn || detail.name || '',
    coverURL: detail.images?.large || detail.images?.common || '',
    makers: [],
    genres: [],
    tags: [],
    description: detail.summary || ''
  }

  if (Array.isArray(detail.infobox)) {
    for (const info of detail.infobox) {
      if (info.key === '开发' || info.key === '开发商' || info.key === '制作') {
        const values = Array.isArray(info.value) ? info.value : [info.value]
        for (const v of values) {
          const name = typeof v === 'object' ? (v.name || v.v || '') : String(v)
          if (name) work.makers.push(name)
        }
      }
      if (info.key === '游戏类型' || info.key === '类型') {
        const values = Array.isArray(info.value) ? info.value : [info.value]
        for (const v of values) {
          const name = typeof v === 'object' ? (v.name || v.v || '') : String(v)
          if (name) work.genres.push(name)
        }
      }
    }
  }

  if (Array.isArray(detail.tags)) {
    for (const tag of detail.tags) {
      if (tag.name) work.tags.push(tag.name)
    }
  }

  return work
}

export { searchBangumi, fetchBangumiDetail }