import express from 'express';
import { scraperAxios } from '../scraper/axios.js';

const router = express.Router();

router.get('/image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send({ error: 'url is required' });
    }

    const decodedUrl = decodeURIComponent(url);
    const response = await scraperAxios.get(decodedUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(response.data));
  } catch (err) {
    console.error('[proxy/image] ERROR:', err.message, err.response?.status, err.response?.headers?.['content-type']);
    res.status(502).send({ error: 'Failed to proxy image' });
  }
});

export default router;