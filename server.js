const express = require('express');
const app = express();
app.use(express.json());

const PROXY_SECRET = process.env.PROXY_SECRET;
const PORT = process.env.PORT || 3000;

// In-memory cache: survives across requests on Render.com (always-running process)
const cache = new Map(); // key -> { body, status, cachedAt }
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Only cache Naver order/stats GET-like POST requests (not token requests)
function isCacheable(url, method) {
  if (method && method.toUpperCase() !== 'GET') return false;
  return url.includes('pay-order') || url.includes('bizdata-stats');
}

function getCacheKey(url) {
  // Strip auth-sensitive query params if any; URL itself is the key
  return url;
}

// Evict expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.cachedAt > CACHE_TTL) cache.delete(key);
  }
}, 5 * 60 * 1000);

app.get('/health', (_, res) => res.json({ ok: true, cacheSize: cache.size }));

app.post('/proxy', async (req, res) => {
  const secret = req.headers['x-proxy-secret'];
  if (!PROXY_SECRET || secret !== PROXY_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { url, method = 'GET', headers = {}, body } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const cacheKey = getCacheKey(url);
  if (isCacheable(url, method)) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      res.set('X-Cache', 'HIT');
      return res.status(cached.status).send(cached.body);
    }
  }

  try {
    const fetchOptions = { method, headers };
    if (body) fetchOptions.body = body;

    const response = await fetch(url, fetchOptions);
    const text = await response.text();

    if (isCacheable(url, method) && response.status >= 200 && response.status < 300) {
      cache.set(cacheKey, { body: text, status: response.status, cachedAt: Date.now() });
    }

    res.set('X-Cache', 'MISS');
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`proxy listening on ${PORT}`));
