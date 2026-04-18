const express = require('express');
const axios = require('axios');
const iconv = require('iconv-lite');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'url parameter required' });
  }

  try {
    const parsedUrl = new URL(url);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': `${parsedUrl.origin}/`,
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        ...(req.query.cookie ? { 'Cookie': req.query.cookie } : {}),
      },
      maxRedirects: 10,
    });

    const buf = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || '';
    let charsetMatch = contentType.match(/charset=([^\s;]+)/i);
    let charset = charsetMatch ? charsetMatch[1].toLowerCase() : null;

    if (!charset) {
      const preview = buf.toString('latin1', 0, 2000);
      const metaMatch = preview.match(/<meta[^>]+charset=["']?\s*([^"'\s;>]+)/i);
      if (metaMatch) charset = metaMatch[1].toLowerCase();
    }

    let html;
    if (charset && ['gbk', 'gb2312', 'gb18030'].includes(charset)) {
      html = iconv.decode(buf, charset);
    } else {
      html = buf.toString('utf-8');
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(502).json({ error: err.message || String(err) || 'Proxy request failed' });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Novel Reader running at http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
