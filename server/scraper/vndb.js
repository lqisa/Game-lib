const axios = require('axios')

const VNDB_API = 'https://api.vndb.org/kana/vn'

const searchVNDB = async (keyword) => {
  const response = await axios.post(VNDB_API, {
    filters: ['search', '=', keyword],
    fields: 'title,image.url,developers.name',
    results: 10
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000
  })

  const items = response.data?.results || []
  return items.map(item => ({
    id: item.id,
    name: item.title || '',
    makerName: item.developers?.map(d => d.name).join(', ') || '',
    coverUrl: item.image?.url || ''
  }))
}

const fetchVNDBDetail = async (vnId) => {
  const response = await axios.post(VNDB_API, {
    filters: ['id', '=', vnId],
    fields: 'title,image.url,developers.name,description,tags.name',
    results: 1
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000
  })

  const item = response.data?.results?.[0]
  if (!item) return null

  return {
    id: item.id,
    title: item.title || '',
    coverURL: item.image?.url || '',
    makers: item.developers?.map(d => d.name) || [],
    genres: [],
    tags: item.tags?.map(t => t.name) || [],
    description: item.description || ''
  }
}

module.exports = { searchVNDB, fetchVNDBDetail }