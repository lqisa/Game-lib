const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')
const fs = require('fs')
const routes = require('./routes')
const { getDataDir } = require('./config')

const createApp = () => {
  const app = express()

  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: true }))

  app.use('/api', routes)

  const coversDir = path.join(getDataDir(), 'covers')
  if (!fs.existsSync(coversDir)) {
    fs.mkdirSync(coversDir, { recursive: true })
  }
  app.use('/covers', express.static(coversDir))

  app.use((err, req, res, _next) => {
    console.error('API Error:', err.message)
    res.status(err.status || 500).send({ error: err.message || 'Internal Server Error' })
  })

  return app
}

module.exports = { createApp }