import { createApp } from './app.js'
import { initDatabase } from './database/init.js'

const PORT = 19700

await initDatabase()

const app = createApp(null)
app.listen(PORT, '127.0.0.1', () => {
  console.log(`* Server running at http://127.0.0.1:${PORT}`)
})