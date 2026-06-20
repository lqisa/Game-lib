const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const db = require('../database/db')
const { searchDLSite, fetchDLSiteDetail, splitKeyword } = require('../scraper/dlsite')

const COVERS_DIR = path.join(__dirname, '..', '..', 'data', 'covers')

if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true })
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
    const { rjcode } = req.body
    if (!rjcode) {
      return res.status(400).send({ error: 'rjcode is required' })
    }
    const detail = await fetchDLSiteDetail(rjcode)
    res.send(detail)
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