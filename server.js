const express = require('express');
const app = express();
app.use(express.json());

const PROXY_SECRET = process.env.PROXY_SECRET;
const PORT = process.env.PORT || 3000;

app.get('/health', (_, res) => res.json({ ok: true }));

app.post('/proxy', async (req, res) => {
  const secret = req.headers['x-proxy-secret'];
  if (!PROXY_SECRET || secret !== PROXY_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { url, method = 'GET', headers = {}, body } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const fetchOptions = { method, headers };
    if (body) fetchOptions.body = body;

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`proxy listening on ${PORT}`));
