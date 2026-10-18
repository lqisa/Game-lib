import { createApp } from './app.js';
import { initDatabase } from './database/init.js';
import { initProxy } from './scraper/axios.js';
import { seed } from './__tests__/seed.js';
import { API_PORTS, resolveApiPort, resolveListenHost } from './ports.js';
import { getDataDir, isTestEnv } from './config.js';
import { startBackgroundWorkers } from './background-manager.js';

const PORT = isTestEnv() ? API_PORTS.test : resolveApiPort(API_PORTS.dev);
const HOST = resolveListenHost('127.0.0.1');

await initDatabase();
await initProxy();

// Seeding is only meaningful for an ephemeral in-memory db, which starts empty.
if (isTestEnv()) {
  const testDataDir = getDataDir();
  await seed(testDataDir);
  console.log('✓ E2E seed data created for test environment');
}

// Background workers are triggered by the frontend render-complete callback (POST /api/tasks/start-workers)
// or by this conservative fallback timer if the client does not report.
if (!isTestEnv()) {
  setTimeout(() => {
    startBackgroundWorkers();
  }, 15000);
}

const app = createApp(null);
app.listen(PORT, HOST, () => {
  console.log(`* Server running at http://${HOST}:${PORT}`);
});
