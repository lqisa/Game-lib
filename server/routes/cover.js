import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { getDataDir } from '../config.js'

const router = express.Router()

const COVERS_DIR = path.join(getDataDir(), 'covers')

router.get('/:filename', (req, res) => {
  const filePath = path.join(COVERS_DIR, req.params.filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).send({ error: 'Cover not found' })
  }
  res.sendFile(filePath)
})

export default router