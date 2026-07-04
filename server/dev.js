import { createApp } from './app.js';
import { initDatabase } from './database/init.js';
import { initProxy } from './scraper/axios.js';

const PORT = 19700;

await initDatabase();
await initProxy();

const app = createApp(null);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`* Server running at http://127.0.0.1:${PORT}`);
});