const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')

const COVERS_DIR = path.join(__dirname, '..', '..', 'data', 'covers')

router.get('/:filename', (req, res) => {
  const filePath = path.join(COVERS_DIR, req.params.filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).send({ error: '封面不存在' })
  }
  res.sendFile(filePath)
})

module.exports = router