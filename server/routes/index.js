const express = require('express')
const router = express.Router()

router.use('/libraries', require('./library'))
router.use('/games', require('./game'))
router.use('/scraper', require('./scraper'))
router.use('/settings', require('./setting'))
router.use('/cover', require('./cover'))

router.get('/health', (req, res) => {
  res.send({ status: 'ok' })
})

module.exports = router