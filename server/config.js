const path = require('path')
const fs = require('fs')

const getDataDir = () => {
  if (process.env.GAME_LIB_DATA_DIR) {
    return process.env.GAME_LIB_DATA_DIR
  }
  return path.join(__dirname, '..', '..', 'data')
}

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

module.exports = { getDataDir, ensureDir }