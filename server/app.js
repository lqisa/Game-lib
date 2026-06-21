import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import routes from './routes/index.js'
import { getDataDir } from './config.js'

const createApp = (frontendDir) => {
  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.use('/api', routes)

  const coversDir = path.join(getDataDir(), 'covers')
  if (!fs.existsSync(coversDir)) {
    fs.mkdirSync(coversDir, { recursive: true })
  }
  app.use('/covers', express.static(coversDir))

  if (frontendDir) {
    app.use(express.static(frontendDir))
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(frontendDir, 'index.html'))
    })
  }

  app.use((err, req, res, _next) => {
    console.error('API Error:', err.message)
    res.status(err.status || 500).send({ error: err.message || 'Internal Server Error' })
  })

  return app
}

export { createApp }