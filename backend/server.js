const express = require('express');
const axios = require('axios');
const iconv = require('iconv-lite');
const path = require('path');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteerExtra.use(StealthPlugin());

// Per-domain cookie cache (survives for the lifetime of the process)
const cookieCache = new Map();

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteerExtra.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    browser.on('disconnected', () => { browser = null; });
  }
  return browser;
}

async function fetchWithPuppeteer(url) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const html = await page.content();
    // Extract and cache cookies for this domain
    const cookies = await page.cookies();
    if (cookies.length > 0) {
      const hostname = new URL(url).hostname;
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      cookieCache.set(hostname, cookieStr);
      console.log(`[proxy] cached ${cookies.length} cookies for ${hostname}`);
    }
    return html;
  } finally {
    await page.close();
  }
}

const app = express();

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'url parameter required' });
  }

  let parsedUrl;
  try { parsedUrl = new URL(url); } catch (_) {
    return res.status(400).json({ error: 'invalid url' });
  }

  // Use cached domain cookie if available, fallback to client-provided cookie
  const cachedCookie = cookieCache.get(parsedUrl.hostname) || '';
  const cookie = req.query.cookie || cachedCookie;

  try {
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
        ...(cookie ? { 'Cookie': cookie } : {}),
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
    // 403: Cloudflare or bot-protection — fall back to puppeteer, which auto-solves challenges
    if (err.response && err.response.status === 403) {
      console.log(`[proxy] 403 on ${parsedUrl.hostname}, retrying with puppeteer stealth...`);
      try {
        const html = await fetchWithPuppeteer(url);
        res.set('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } catch (ppErr) {
        console.error(`[proxy] puppeteer fallback failed: ${ppErr.message}`);
        return res.status(502).json({ error: `Puppeteer fallback failed: ${ppErr.message}` });
      }
    }
    console.error(`[proxy] ${err.response ? err.response.status : 'ERR'} ${url} — ${err.message}`);
    res.status(502).json({ error: err.message || String(err) || 'Proxy request failed' });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Novel Reader running at http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
