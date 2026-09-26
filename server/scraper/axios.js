import axios from 'axios';
// https-proxy-agent v7 has no usable default export: the default is the CJS namespace
// object, so `import HttpsProxyAgent from ...` gives an object and `new HttpsProxyAgent()`
// throws "not a constructor". The class is the named export.
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as db from '../database/db.js';

const scraperAxios = axios.create({
  timeout: 15000,
  // Proxy handling belongs to the app's own proxy_* settings (see initProxy), which sets
  // the agents explicitly. Without this, axios also honours HTTP_PROXY/HTTPS_PROXY from
  // the environment, and an env proxy that cannot tunnel https makes every scrape fail
  // with a confusing `Protocol "https:" not supported. Expected "http:"`.
  proxy: false,
});

const initProxy = async () => {
  try {
    const enabled = await db.getSetting('proxy_enabled');
    if (enabled !== 'true') {
      // Clear any agent from a previous run so turning the proxy off takes effect.
      scraperAxios.defaults.httpsAgent = undefined;
      scraperAxios.defaults.httpAgent = undefined;
      return;
    }
    const host = (await db.getSetting('proxy_host')) || '127.0.0.1';
    const port = parseInt((await db.getSetting('proxy_port')) || '7890', 10);
    const agent = new HttpsProxyAgent(`http://${host}:${port}`);
    scraperAxios.defaults.httpsAgent = agent;
    scraperAxios.defaults.httpAgent = agent;
    console.log(` * Scraper proxy enabled: http://${host}:${port}`);
  } catch (err) {
    // Never swallow this: a broken proxy setup silently disables every scrape.
    console.error(' * Failed to initialise the scraper proxy:', err.message);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryGet = async (url, options = {}, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await scraperAxios.get(url, options);
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
};

export { scraperAxios, initProxy, retryGet };