import express from 'express'
import libraryRoutes from './library.js'
import gameRoutes from './game.js'
import scraperRoutes from './scraper.js'
import settingRoutes from './setting.js'
import coverRoutes from './cover.js'
import cacheRoutes from './cache.js'

const router = express.Router()

router.use('/libraries', libraryRoutes)
router.use('/games', gameRoutes)
router.use('/scraper', scraperRoutes)
router.use('/settings', settingRoutes)
router.use('/cover', coverRoutes)
router.use('/cache', cacheRoutes)

router.get('/health', (req, res) => {
  res.send({ status: 'ok' })
})

export default router