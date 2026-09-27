import { createApp } from './app.js';
import { initDatabase } from './database/init.js';
import { initProxy } from './scraper/axios.js';
import { seed } from './__tests__/seed.js';
import { getDataDir, isTestEnv } from './config.js';
import { maybeStartSimilarScan, startSimilarScanPolling } from './similar.js';
import { startNsfwPolling } from './nsfw-classifier.js';

const PORT = parseInt(process.env.VITE_API_PORT || '19700', 10);

await initDatabase();
await initProxy();

// Seeding is only meaningful for an ephemeral in-memory db, which starts empty.
if (isTestEnv()) {
  const testDataDir = getDataDir();
  await seed(testDataDir);
  console.log('✓ E2E seed data created for test environment');
}

// Historical similar pairs are computed once on the first boot; polling picks up newly
// adopted games afterwards. Skipped in tests so assertions see a quiet task list.
if (!isTestEnv()) {
  void maybeStartSimilarScan();
  startSimilarScanPolling();
  startNsfwPolling();
}

const app = createApp(null);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`* Server running at http://127.0.0.1:${PORT}`);
});