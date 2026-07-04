import axios from 'axios';
import * as db from '../database/db.js';

const scraperAxios = axios.create({
  timeout: 15000,
});

const initProxy = async () => {
  try {
    const enabled = await db.getSetting('proxy_enabled');
    if (enabled !== 'true') return;
    const host = (await db.getSetting('proxy_host')) || '127.0.0.1';
    const port = parseInt((await db.getSetting('proxy_port')) || '7890', 10);
    scraperAxios.defaults.proxy = {
      protocol: 'http',
      host,
      port,
    };
  } catch {
    // settings may not exist yet
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