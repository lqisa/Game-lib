const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const db = require('../database/db')
const { searchDLSite, fetchDLSiteDetail, splitKeyword } = require('../scraper/dlsite')
const { searchBangumi, fetchBangumiDetail } = require('../scraper/bangumi')
const { searchVNDB, fetchVNDBDetail } = require('../scraper/vndb')
const { getDataDir } = require('../config')

const COVERS_DIR = path.join(getDataDir(), 'covers')

if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true })
}

const getBangumiToken = async () => {
  return (await db.getSetting('bangumi_token')) || ''
}

router.post('/dlsite/segments', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name) {
      return res.status(400).send({ error: 'name is required' })
    }
    const { keyword, segments } = splitKeyword(name)
    res.send({ keyword, segments })
  } catch (err) {
    next(err)
  }
})

router.post('/dlsite/search', async (req, res, next) => {
  try {
    const { keyword } = req.body
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' })
    }
    const results = await searchDLSite(keyword)
    const { segments } = splitKeyword(keyword)
    res.send({ results, segments })
  } catch (err) {
    next(err)
  }
})

router.post('/dlsite/fetch', async (req, res, next) => {
  try {
    const code = req.body.rjcode || req.body.id
    if (!code) {
      return res.status(400).send({ error: 'rjcode or id is required' })
    }
    const detail = await fetchDLSiteDetail(code)
    res.send(detail)
  } catch (err) {
    next(err)
  }
})

router.post('/bangumi/search', async (req, res, next) => {
  try {
    const { keyword } = req.body
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' })
    }
    const token = await getBangumiToken()
    const results = await searchBangumi(keyword, token)
    const { segments } = splitKeyword(keyword)
    res.send({ results, segments })
  } catch (err) {
    next(err)
  }
})

router.post('/bangumi/fetch', async (req, res, next) => {
  try {
    const { id } = req.body
    if (!id) {
      return res.status(400).send({ error: 'id is required' })
    }
    const token = await getBangumiToken()
    const detail = await fetchBangumiDetail(id, token)
    if (!detail) {
      return res.status(404).send({ error: 'detail not found' })
    }
    res.send(detail)
  } catch (err) {
    next(err)
  }
})

router.post('/vndb/search', async (req, res, next) => {
  try {
    const { keyword } = req.body
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' })
    }
    const results = await searchVNDB(keyword)
    const { segments } = splitKeyword(keyword)
    res.send({ results, segments })
  } catch (err) {
    next(err)
  }
})

router.post('/vndb/fetch', async (req, res, next) => {
  try {
    const { id } = req.body
    if (!id) {
      return res.status(400).send({ error: 'id is required' })
    }
    const detail = await fetchVNDBDetail(id)
    if (!detail) {
      return res.status(404).send({ error: 'detail not found' })
    }
    res.send(detail)
  } catch (err) {
    next(err)
  }
})

router.post('/auto/search', async (req, res, next) => {
  try {
    const { keyword, name } = req.body
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' })
    }
    const searchName = name || keyword
    const hasRJ = /RJ\d+/.test(searchName)
    const sources = hasRJ
      ? ['dlsite', 'bangumi', 'vndb']
      : ['bangumi', 'dlsite', 'vndb']

    const { segments } = splitKeyword(keyword)
    const token = await getBangumiToken()

    for (const source of sources) {
      try {
        let results = []
        if (source === 'dlsite') {
          results = await searchDLSite(keyword)
        } else if (source === 'bangumi') {
          results = await searchBangumi(keyword, token)
        } else if (source === 'vndb') {
          results = await searchVNDB(keyword)
        }
        if (results.length > 0) {
          return res.send({ source, results, segments })
        }
      } catch {
        continue
      }
    }

    res.send({ source: null, results: [], segments })
  } catch (err) {
    next(err)
  }
})

router.post('/dlsite/batch', async (req, res, next) => {
  try {
    const { games } = req.body
    if (!Array.isArray(games)) {
      return res.status(400).send({ error: 'games is required' })
    }
    const results = []
    for (const game of games) {
      try {
        const keyword = game.keyword || game.name
        const searchResults = await searchDLSite(keyword)
        if (searchResults.length > 0) {
          const detail = await fetchDLSiteDetail(searchResults[0].rjcode)
          results.push({ gameId: game.id, success: true, data: detail })
        } else {
          results.push({ gameId: game.id, success: false, error: 'not found' })
        }
      } catch (err) {
        results.push({ gameId: game.id, success: false, error: err.message })
      }
    }
    res.send(results)
  } catch (err) {
    next(err)
  }
})

router.post('/adopt', async (req, res, next) => {
  try {
    const {
      gameId, sourceType, sourceId, sourceUrl,
      name, coverUrl, makers, genres, tags, description
    } = req.body

    if (!gameId || !sourceType || !sourceId) {
      return res.status(400).send({ error: 'gameId, sourceType, sourceId required' })
    }

    let coverPath = null
    if (coverUrl) {
      try {
        const ext = coverUrl.match(/\.(jpg|jpeg|png|webp)/)?.[1] || 'jpg'
        const filename = `${sourceType}_${sourceId}.${ext}`
        const filePath = path.join(COVERS_DIR, filename)
        const response = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 15000 })
        fs.writeFileSync(filePath, response.data)
        coverPath = filename
      } catch (err) {
        console.error('cover download failed:', err.message)
      }
    }

    await db.updateGame(gameId, { description, cover_path: coverPath })

    await db.insertGameSource({
      game_id: gameId,
      source_type: sourceType,
      source_id: sourceId,
      source_url: sourceUrl || null,
      raw_data: null
    })

    if (Array.isArray(makers) && makers.length > 0) {
      const makerIds = await db.insertMakers(makers)
      await db.syncGameMakers(gameId, makerIds)
    }

    if (Array.isArray(genres) && genres.length > 0) {
      const genreIds = await db.insertGenres(genres)
      await db.syncGameGenres(gameId, genreIds)
    }

    if (Array.isArray(tags) && tags.length > 0) {
      const tagIds = await db.insertTags(tags)
      await db.syncGameTags(gameId, tagIds)
    }

    const game = await db.getGameDetail(gameId)
    res.send(game)
  } catch (err) {
    next(err)
  }
})

module.exports = router