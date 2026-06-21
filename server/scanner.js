import fs from 'node:fs'

const scanDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const subDirs = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)

  return subDirs
}

export { scanDirectory }