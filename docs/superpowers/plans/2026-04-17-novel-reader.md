# Novel Reader H5 App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal H5 novel reader app that fetches content from arbitrary URLs via a local proxy and displays it in a mobile-friendly reader interface.

**Architecture:** Node.js Express backend provides a single `/proxy` endpoint to bypass CORS. Vanilla HTML/CSS/JS frontend uses Mozilla Readability.js for auto-parsing plus a CSS selector fallback. Reading progress and preferences stored in localStorage.

**Tech Stack:** Node.js, Express, axios, iconv-lite (backend); Vanilla HTML/CSS/JS, Readability.js (frontend); Jest + supertest + jsdom (tests)

---

## File Map

| File | Responsibility |
|------|---------------|
| `backend/server.js` | Express app, `/proxy` endpoint, encoding/gzip handling, static file serving |
| `backend/package.json` | Backend production dependencies |
| `frontend/js/storage.js` | localStorage CRUD: shelf, reading progress, font size, theme |
| `frontend/js/parser.js` | DOM content extraction: Readability + chapter list heuristic + selector override |
| `frontend/js/vendor/Readability.js` | Mozilla Readability (vendored local copy) |
| `frontend/css/style.css` | All styles: light/dark themes, layout, all components |
| `frontend/index.html` | Book shelf page structure |
| `frontend/js/shelf.js` | Book shelf page logic |
| `frontend/chapters.html` | Chapter list page structure |
| `frontend/js/chapters.js` | Chapter list page logic |
| `frontend/reader.html` | Reader page structure |
| `frontend/js/reader.js` | Reader page logic: toolbar, TOC panel, theme, font size |
| `tests/proxy.test.js` | Backend proxy tests |
| `tests/storage.test.js` | Storage module tests |
| `tests/parser.test.js` | Parser module tests |
| `package.json` | Root: test tooling (Jest, jsdom, supertest) |
| `.gitignore` | Ignore node_modules, .superpowers |

---

## Chunk 1: Backend + Storage + Parser

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `backend/package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "novel-reader",
  "private": true,
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "jsdom": "^24.0.0",
    "supertest": "^7.0.0",
    "@mozilla/readability": "^0.5.0"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  }
}
```

Save to: `package.json`

- [ ] **Step 2: Create backend/package.json**

```json
{
  "name": "novel-reader-backend",
  "private": true,
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "axios": "^1.6.0",
    "iconv-lite": "^0.6.3"
  }
}
```

Save to: `backend/package.json`

- [ ] **Step 3: Create .gitignore**

```
node_modules/
backend/node_modules/
.superpowers/
```

Save to: `.gitignore`

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p frontend/css frontend/js/vendor backend tests
```

- [ ] **Step 5: Install root dependencies**

```bash
npm install
```

Expected: `node_modules/` created at root

- [ ] **Step 6: Install backend dependencies**

```bash
cd backend && npm install && cd ..
```

Expected: `backend/node_modules/` created

- [ ] **Step 7: Vendor Readability.js**

```bash
cp node_modules/@mozilla/readability/Readability.js frontend/js/vendor/Readability.js
```

Verify:
```bash
ls -lh frontend/js/vendor/Readability.js
```
Expected: file exists, ~100KB

- [ ] **Step 8: Initialize git and commit scaffold**

```bash
git init
git add package.json backend/package.json .gitignore
git commit -m "chore: project scaffold"
```

---

### Task 2: Backend Proxy Server

**Files:**
- Create: `tests/proxy.test.js`
- Create: `backend/server.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/proxy.test.js
const request = require('supertest');
const app = require('../backend/server');

describe('GET /proxy', () => {
  test('returns 400 when url param missing', async () => {
    const res = await request(app).get('/proxy');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('returns 502 when target URL unreachable', async () => {
    const res = await request(app)
      .get('/proxy')
      .query({ url: 'http://localhost:19999/nonexistent' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBeTruthy();
  });

  test('returns 200 or 502 for reachable URL (not 400/500)', async () => {
    const res = await request(app)
      .get('/proxy')
      .query({ url: 'http://example.com' });
    expect([200, 502]).toContain(res.status);
  });
});
```

Save to: `tests/proxy.test.js`

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/proxy.test.js
```

Expected: FAIL — "Cannot find module '../backend/server'"

- [ ] **Step 3: Implement backend/server.js**

```js
// backend/server.js
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
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      maxRedirects: 5,
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
    res.status(502).json({ error: err.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Novel Reader running at http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
```

Save to: `backend/server.js`

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test tests/proxy.test.js
```

Expected: PASS — all 3 tests pass

- [ ] **Step 5: Manual smoke test**

```bash
cd backend && node server.js &
curl "http://localhost:3000/proxy?url=http%3A%2F%2Fexample.com" | head -20
kill %1
cd ..
```

Expected: Returns HTML from example.com

- [ ] **Step 6: Commit**

```bash
git add backend/server.js tests/proxy.test.js
git commit -m "feat: backend proxy server with GBK encoding handling"
```

---

### Task 3: Storage Module

**Files:**
- Create: `tests/storage.test.js`
- Create: `frontend/js/storage.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/storage.test.js
const { JSDOM } = require('jsdom');

let storage;

beforeEach(() => {
  const dom = new JSDOM('', { url: 'http://localhost' });
  global.localStorage = dom.window.localStorage;
  jest.resetModules();
  storage = require('../frontend/js/storage');
});

describe('shelf CRUD', () => {
  const makeBook = (id, title) => ({
    id,
    title,
    indexUrl: 'http://example.com',
    currentChapterUrl: '',
    currentChapterTitle: '',
    lastRead: new Date().toISOString(),
    selectors: { content: '', chapterList: '' },
  });

  test('getShelf returns empty array initially', () => {
    expect(storage.getShelf()).toEqual([]);
  });

  test('addBook persists book', () => {
    storage.addBook(makeBook('abc', '斗破苍穹'));
    expect(storage.getShelf()).toHaveLength(1);
    expect(storage.getShelf()[0].title).toBe('斗破苍穹');
  });

  test('updateBook updates matching book', () => {
    storage.addBook(makeBook('abc', 'old'));
    storage.updateBook('abc', { title: 'new' });
    expect(storage.getBook('abc').title).toBe('new');
  });

  test('updateBook does nothing for unknown id', () => {
    storage.addBook(makeBook('abc', 'test'));
    storage.updateBook('xyz', { title: 'changed' });
    expect(storage.getShelf()).toHaveLength(1);
  });

  test('removeBook removes matching book', () => {
    storage.addBook(makeBook('abc', 'test'));
    storage.removeBook('abc');
    expect(storage.getShelf()).toHaveLength(0);
  });

  test('getBook returns null for missing id', () => {
    expect(storage.getBook('nonexistent')).toBeNull();
  });
});

describe('preferences', () => {
  test('getFontSize returns 17 by default', () => {
    expect(storage.getFontSize()).toBe(17);
  });

  test('setFontSize persists', () => {
    storage.setFontSize(20);
    expect(storage.getFontSize()).toBe(20);
  });

  test('getTheme returns light by default', () => {
    expect(storage.getTheme()).toBe('light');
  });

  test('setTheme persists', () => {
    storage.setTheme('dark');
    expect(storage.getTheme()).toBe('dark');
  });
});
```

Save to: `tests/storage.test.js`

- [ ] **Step 2: Run to verify fails**

```bash
npm test tests/storage.test.js
```

Expected: FAIL — "Cannot find module '../frontend/js/storage'"

- [ ] **Step 3: Implement storage.js**

```js
// frontend/js/storage.js
const SHELF_KEY = 'novel_shelf';

const storage = {
  getShelf() {
    try {
      return JSON.parse(localStorage.getItem(SHELF_KEY)) || [];
    } catch (_) {
      return [];
    }
  },

  saveShelf(shelf) {
    localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
  },

  addBook(book) {
    const shelf = this.getShelf();
    shelf.push(book);
    this.saveShelf(shelf);
  },

  updateBook(id, updates) {
    const shelf = this.getShelf();
    const idx = shelf.findIndex(b => b.id === id);
    if (idx === -1) return;
    shelf[idx] = { ...shelf[idx], ...updates };
    this.saveShelf(shelf);
  },

  removeBook(id) {
    this.saveShelf(this.getShelf().filter(b => b.id !== id));
  },

  getBook(id) {
    return this.getShelf().find(b => b.id === id) || null;
  },

  getFontSize() {
    return parseInt(localStorage.getItem('font_size') || '17', 10);
  },

  setFontSize(size) {
    localStorage.setItem('font_size', String(size));
  },

  getTheme() {
    return localStorage.getItem('theme') || 'light';
  },

  setTheme(theme) {
    localStorage.setItem('theme', theme);
  },
};

if (typeof window !== 'undefined') window.storage = storage;
if (typeof module !== 'undefined') module.exports = storage;
```

Save to: `frontend/js/storage.js`

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test tests/storage.test.js
```

Expected: PASS — all 10 tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/js/storage.js tests/storage.test.js
git commit -m "feat: storage module with shelf CRUD and preferences"
```

---

### Task 4: Parser Module

**Files:**
- Create: `tests/parser.test.js`
- Create: `frontend/js/parser.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/parser.test.js
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const parser = require('../frontend/js/parser');

// Inject test helpers
parser._Readability = Readability;
parser._jsdomParse = (html, url) => {
  return new JSDOM(html, { url: url || 'http://localhost' }).window.document;
};

describe('extractContent', () => {
  test('extracts content from article HTML', () => {
    const html = `<html><head><title>Ch1</title></head><body>
      <article><h1>Chapter 1</h1><p>${'story text '.repeat(30)}</p></article>
    </body></html>`;
    const doc = parser._jsdomParse(html, 'http://example.com/ch1');
    const result = parser.extractContent(doc, Readability);
    expect(result).not.toBeNull();
    expect(result.content).toContain('story text');
  });

  test('returns null for empty document', () => {
    const doc = parser._jsdomParse('<html><body></body></html>', 'http://example.com');
    const result = parser.extractContent(doc, Readability);
    expect(result).toBeNull();
  });
});

describe('extractChapterList', () => {
  test('returns chapters from link-dense container', () => {
    const html = `<html><body>
      <nav><a href="/home">首页</a><a href="/login">登录</a></nav>
      <div id="chapters">
        <a href="/ch1">第一章 开始</a>
        <a href="/ch2">第二章 出发</a>
        <a href="/ch3">第三章 历险</a>
        <a href="/ch4">第四章 归来</a>
      </div>
    </body></html>`;
    const doc = parser._jsdomParse(html, 'http://example.com/novel');
    const chapters = parser.extractChapterList(doc, 'http://example.com/novel');
    expect(chapters.length).toBe(4);
    expect(chapters[0].title).toBe('第一章 开始');
    expect(chapters[0].url).toMatch(/\/ch1/);
  });

  test('excludes nav element links', () => {
    const html = `<html><body>
      <nav><a href="/home">首页</a><a href="/search">搜索</a></nav>
      <div id="list">
        <a href="/ch1">第一章</a><a href="/ch2">第二章</a><a href="/ch3">第三章</a>
      </div>
    </body></html>`;
    const doc = parser._jsdomParse(html, 'http://example.com');
    const chapters = parser.extractChapterList(doc, 'http://example.com');
    expect(chapters.every(c => c.title !== '首页' && c.title !== '搜索')).toBe(true);
  });

  test('returns empty array when fewer than 3 candidates', () => {
    const html = `<html><body><a href="/a">Link A</a><a href="/b">Link B</a></body></html>`;
    const doc = parser._jsdomParse(html, 'http://example.com');
    expect(parser.extractChapterList(doc, 'http://example.com')).toEqual([]);
  });
});

describe('extractWithSelector', () => {
  test('returns innerHTML of matched element', () => {
    const html = `<html><body><div class="content"><p>Hello world</p></div></body></html>`;
    const doc = parser._jsdomParse(html);
    expect(parser.extractWithSelector(doc, '.content')).toContain('Hello world');
  });

  test('returns null when selector matches nothing', () => {
    const doc = parser._jsdomParse('<html><body></body></html>');
    expect(parser.extractWithSelector(doc, '.missing')).toBeNull();
  });
});

describe('extractChapterListWithSelector', () => {
  test('returns chapters from selector-matched container', () => {
    const html = `<html><body>
      <div class="book-chapters">
        <a href="/ch1">第一章</a><a href="/ch2">第二章</a>
      </div>
    </body></html>`;
    const doc = parser._jsdomParse(html, 'http://example.com');
    const chapters = parser.extractChapterListWithSelector(doc, '.book-chapters', 'http://example.com');
    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe('第一章');
  });

  test('returns empty array when selector matches nothing', () => {
    const doc = parser._jsdomParse('<html><body></body></html>');
    expect(parser.extractChapterListWithSelector(doc, '.missing', 'http://example.com')).toEqual([]);
  });
});
```

Save to: `tests/parser.test.js`

- [ ] **Step 2: Run to verify fails**

```bash
npm test tests/parser.test.js
```

Expected: FAIL — "Cannot find module '../frontend/js/parser'"

- [ ] **Step 3: Implement parser.js**

```js
// frontend/js/parser.js
const NAV_WORDS = /^(首页|登录|注册|搜索|书架|排行|分类|签到|充值|VIP|会员|下载|APP)$/;

const parser = {
  // doc: DOM Document. ReadabilityClass: Readability constructor.
  extractContent(doc, ReadabilityClass) {
    const R = ReadabilityClass
      || (typeof Readability !== 'undefined' ? Readability : null);
    if (!R) return null;
    const clone = doc.cloneNode(true);
    const article = new R(clone).parse();
    if (!article || !article.content) return null;
    return { title: article.title, content: article.content };
  },

  extractChapterList(doc, baseUrl) {
    const allAs = Array.from(doc.querySelectorAll('a[href]'));
    const candidates = allAs.filter(a => {
      if (a.closest('nav')) return false;
      const text = a.textContent.trim();
      if (text.length < 2) return false;
      if (NAV_WORDS.test(text)) return false;
      return true;
    });

    if (candidates.length < 3) return [];

    const counts = new Map();
    candidates.forEach(a => {
      const p = a.parentElement;
      if (p) counts.set(p, (counts.get(p) || 0) + 1);
    });

    let best = null, bestN = 0;
    counts.forEach((n, el) => {
      if (n > bestN) { bestN = n; best = el; }
    });

    if (!best || bestN < 3) return [];

    return Array.from(best.querySelectorAll('a[href]'))
      .filter(a => {
        if (a.closest('nav')) return false;
        const text = a.textContent.trim();
        if (text.length < 2) return false;
        if (NAV_WORDS.test(text)) return false;
        return true;
      })
      .map(a => ({
        title: a.textContent.trim(),
        url: this._resolveUrl(a.getAttribute('href'), baseUrl),
      }));
  },

  extractWithSelector(doc, selector) {
    const el = doc.querySelector(selector);
    return el ? el.innerHTML : null;
  },

  extractChapterListWithSelector(doc, selector, baseUrl) {
    const container = doc.querySelector(selector);
    if (!container) return [];
    return Array.from(container.querySelectorAll('a[href]'))
      .filter(a => a.textContent.trim().length > 0)
      .map(a => ({
        title: a.textContent.trim(),
        url: this._resolveUrl(a.getAttribute('href'), baseUrl),
      }));
  },

  _resolveUrl(href, baseUrl) {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (!baseUrl) return href;
    try { return new URL(href, baseUrl).href; } catch (_) { return href; }
  },

  // Injected by Node.js tests
  _Readability: null,
  _jsdomParse: null,
};

if (typeof window !== 'undefined') window.parser = parser;
if (typeof module !== 'undefined') module.exports = parser;
```

Save to: `frontend/js/parser.js`

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test tests/parser.test.js
```

Expected: PASS — all 9 tests pass

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All tests pass (proxy + storage + parser)

- [ ] **Step 6: Commit**

```bash
git add frontend/js/parser.js tests/parser.test.js
git commit -m "feat: parser module with Readability and chapter list heuristic"
```

---

## Chunk 2: Frontend Pages

### Task 5: CSS Styles

**Files:**
- Create: `frontend/css/style.css`

- [ ] **Step 1: Create style.css**

```css
/* frontend/css/style.css */
:root {
  --bg: #f5f0e8;
  --bg-card: #ffffff;
  --bg-bar: #ede8df;
  --text: #3a3028;
  --text-muted: #888;
  --accent: #8b6914;
  --accent-light: #e8d5b7;
  --border: #e0d5c0;
  --shadow: rgba(0,0,0,0.08);
  --font-size: 17px;
}

[data-theme="dark"] {
  --bg: #1a1a1a;
  --bg-card: #242424;
  --bg-bar: #1e1e1e;
  --text: #c8c8c8;
  --text-muted: #666;
  --accent: #e94560;
  --accent-light: #2a1f2a;
  --border: #333;
  --shadow: rgba(0,0,0,0.3);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  font-family: Georgia, 'Noto Serif SC', '宋体', serif;
  background: var(--bg);
  color: var(--text);
  -webkit-text-size-adjust: 100%;
}

a { color: var(--accent); text-decoration: none; }

/* ── Progress bar ── */
.progress-bar {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--border);
  z-index: 100;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.1s linear;
  width: 0%;
}

/* ── Nav bar ── */
.nav-bar {
  position: fixed;
  top: 3px; left: 0; right: 0;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  z-index: 99;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.nav-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 0;
  font-family: inherit;
}

/* ── Page wrapper ── */
.page { padding-top: 47px; min-height: 100vh; }

/* ── Shelf ── */
.shelf-container { padding: 16px; }
.shelf-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}
.book-card {
  background: var(--bg-card);
  border-radius: 10px;
  padding: 12px;
  box-shadow: 0 2px 6px var(--shadow);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.book-card:active { opacity: 0.7; }
.book-cover {
  background: var(--accent-light);
  height: 70px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: 8px;
}
.book-name {
  font-family: -apple-system, sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.book-chapter {
  font-family: -apple-system, sans-serif;
  font-size: 11px;
  color: var(--accent);
  text-align: center;
  margin-top: 2px;
}
.book-date {
  font-family: -apple-system, sans-serif;
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  margin-top: 1px;
}

.add-btn {
  display: block;
  width: 100%;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  font-family: -apple-system, sans-serif;
  cursor: pointer;
  text-align: center;
  margin-bottom: 12px;
}
.add-form {
  background: var(--bg-card);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 6px var(--shadow);
  margin-bottom: 16px;
  display: none;
}
.add-form.open { display: block; }
.form-label {
  font-family: -apple-system, sans-serif;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
  display: block;
}
.form-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  font-size: 13px;
  font-family: -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  margin-bottom: 8px;
}
.form-input:focus { outline: 1px solid var(--accent); }
.form-row { display: flex; gap: 8px; }
.btn-primary {
  flex: 1;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px;
  font-size: 13px;
  font-family: -apple-system, sans-serif;
  cursor: pointer;
}
.btn-secondary {
  background: var(--border);
  color: var(--text-muted);
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: -apple-system, sans-serif;
  cursor: pointer;
}
.loading-text {
  font-family: -apple-system, sans-serif;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  padding: 8px;
  display: none;
}

/* ── Chapters ── */
.chapters-list { padding: 8px 0; font-family: -apple-system, sans-serif; }
.chapter-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  color: var(--text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.chapter-item:active { background: var(--accent-light); }
.chapter-item.current { color: var(--accent); font-weight: 600; }

/* ── Reader content ── */
.reader-content {
  padding: 20px 20px 110px;
  font-size: var(--font-size);
  line-height: 1.9;
  letter-spacing: 0.02em;
  color: var(--text);
}
.reader-content h1,
.reader-content h2 {
  font-size: calc(var(--font-size) + 2px);
  text-align: center;
  margin-bottom: 24px;
  color: var(--accent);
}
.reader-content p { text-indent: 2em; margin-bottom: 14px; }

/* ── Bottom toolbar ── */
.bottom-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: var(--bg-bar);
  border-top: 1px solid var(--border);
  padding: 10px 16px 16px;
  font-family: -apple-system, sans-serif;
  z-index: 99;
}
.nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.nav-chapter-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 7px 16px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.nav-chapter-btn:disabled { opacity: 0.4; cursor: default; }
.chapter-counter { color: var(--text-muted); font-size: 12px; }
.control-row { display: flex; justify-content: space-around; align-items: center; }
.ctrl-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 12px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.ctrl-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

/* ── TOC panel ── */
.toc-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 200;
  display: none;
}
.toc-overlay.open { display: flex; }
.toc-panel {
  background: var(--bg);
  width: 80%;
  max-width: 320px;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  font-family: -apple-system, sans-serif;
}
.toc-header {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.toc-close {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-muted);
  cursor: pointer;
}
.toc-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toc-item:active { color: var(--accent); }
.toc-item.current { color: var(--accent); font-weight: 600; }

/* ── Selector modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 300;
  display: none;
  align-items: flex-end;
}
.modal-overlay.open { display: flex; }
.modal-sheet {
  background: var(--bg);
  width: 100%;
  border-radius: 16px 16px 0 0;
  padding: 20px 16px 32px;
  font-family: -apple-system, sans-serif;
}
.modal-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: var(--text); }
.modal-hint { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }

/* ── States ── */
.state-msg {
  text-align: center;
  padding: 60px 20px;
  font-family: -apple-system, sans-serif;
  font-size: 14px;
  color: var(--text-muted);
}
.state-msg .emoji { font-size: 40px; margin-bottom: 12px; display: block; }
```

Save to: `frontend/css/style.css`

- [ ] **Step 2: Commit**

```bash
git add frontend/css/style.css
git commit -m "feat: CSS with light/dark theme and all page components"
```

---

### Task 6: Book Shelf Page

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/js/shelf.js`

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>我的书架</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="nav-bar">
    <span style="width:60px"></span>
    <span class="nav-title">我的书架</span>
    <span style="width:60px"></span>
  </div>

  <div class="page">
    <div class="shelf-container">
      <div class="shelf-grid" id="shelfGrid"></div>

      <button class="add-btn" id="toggleAddBtn">＋ 添加新书</button>

      <div class="add-form" id="addForm">
        <label class="form-label">粘贴小说目录页网址</label>
        <input class="form-input" id="urlInput" type="url"
               placeholder="https://www.example.com/novel/xxx">
        <label class="form-label">书名（可选，留空自动识别）</label>
        <input class="form-input" id="titleInput" type="text" placeholder="例：斗破苍穹">
        <div class="form-row">
          <button class="btn-primary" id="addConfirmBtn">解析并添加</button>
          <button class="btn-secondary" id="addCancelBtn">取消</button>
        </div>
        <div class="loading-text" id="loadingText">正在解析，请稍候…</div>
      </div>

      <div id="emptyState" class="state-msg" style="display:none">
        <span class="emoji">📚</span>
        还没有书，添加一本吧
      </div>
    </div>
  </div>

  <script src="js/storage.js"></script>
  <script src="js/parser.js"></script>
  <script src="js/vendor/Readability.js"></script>
  <script src="js/shelf.js"></script>
</body>
</html>
```

Save to: `frontend/index.html`

- [ ] **Step 2: Create shelf.js**

```js
// frontend/js/shelf.js
(function () {
  function generateId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function relativeTime(isoStr) {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}小时前`;
    return `${Math.floor(hrs / 24)}天前`;
  }

  function renderShelf() {
    const shelf = storage.getShelf();
    const grid = document.getElementById('shelfGrid');
    const empty = document.getElementById('emptyState');
    grid.innerHTML = '';

    if (shelf.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    shelf.forEach(book => {
      const card = document.createElement('div');
      card.className = 'book-card';
      card.innerHTML = `
        <div class="book-cover">📖</div>
        <div class="book-name">${book.title}</div>
        <div class="book-chapter">${book.currentChapterTitle || '未开始'}</div>
        <div class="book-date">${relativeTime(book.lastRead)}</div>
      `;
      card.addEventListener('click', () => {
        if (book.currentChapterUrl) {
          location.href = `reader.html?id=${book.id}&url=${encodeURIComponent(book.currentChapterUrl)}`;
        } else {
          location.href = `chapters.html?id=${book.id}&url=${encodeURIComponent(book.indexUrl)}`;
        }
      });
      grid.appendChild(card);
    });
  }

  document.getElementById('toggleAddBtn').addEventListener('click', () => {
    document.getElementById('addForm').classList.toggle('open');
  });

  document.getElementById('addCancelBtn').addEventListener('click', () => {
    document.getElementById('addForm').classList.remove('open');
    document.getElementById('urlInput').value = '';
    document.getElementById('titleInput').value = '';
  });

  document.getElementById('addConfirmBtn').addEventListener('click', async () => {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { alert('请输入网址'); return; }

    const titleHint = document.getElementById('titleInput').value.trim();
    const loading = document.getElementById('loadingText');
    const confirmBtn = document.getElementById('addConfirmBtn');
    loading.style.display = 'block';
    confirmBtn.disabled = true;

    try {
      const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`代理请求失败: ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const title = titleHint
        || doc.querySelector('h1')?.textContent.trim()
        || doc.querySelector('title')?.textContent.trim()
        || '未知书名';

      const book = {
        id: generateId(),
        title,
        indexUrl: url,
        currentChapterUrl: '',
        currentChapterTitle: '',
        lastRead: new Date().toISOString(),
        selectors: { content: '', chapterList: '' },
      };
      storage.addBook(book);
      document.getElementById('addForm').classList.remove('open');
      document.getElementById('urlInput').value = '';
      document.getElementById('titleInput').value = '';
      location.href = `chapters.html?id=${book.id}&url=${encodeURIComponent(url)}`;
    } catch (err) {
      alert(`添加失败: ${err.message}`);
    } finally {
      loading.style.display = 'none';
      confirmBtn.disabled = false;
    }
  });

  document.documentElement.dataset.theme = storage.getTheme();
  renderShelf();
})();
```

Save to: `frontend/js/shelf.js`

- [ ] **Step 3: Start server and open browser**

```bash
cd backend && node server.js &
```

Open `http://localhost:3000` in browser DevTools mobile view (375px width).

- [ ] **Step 4: Manual verification checklist**

- [ ] Empty state shows "还没有书，添加一本吧"
- [ ] "添加新书" button toggles the form open/closed
- [ ] Entering a URL and clicking "解析并添加" shows loading text and disables button
- [ ] After successful add, redirects to chapters.html
- [ ] Back on shelf: book card appears with title, "未开始", and relative time
- [ ] Clicking book card with no progress → goes to chapters.html
- [ ] Clicking book card with progress → goes directly to reader.html

- [ ] **Step 5: Stop server and commit**

```bash
kill %1
cd ..
git add frontend/index.html frontend/js/shelf.js
git commit -m "feat: book shelf page"
```

---

### Task 7: Chapter List Page

**Files:**
- Create: `frontend/chapters.html`
- Create: `frontend/js/chapters.js`

- [ ] **Step 1: Create chapters.html**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>目录</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="nav-bar">
    <button class="nav-btn" id="backBtn">← 书架</button>
    <span class="nav-title" id="navTitle">目录</span>
    <span style="width:60px"></span>
  </div>

  <div class="page">
    <div id="chaptersList" class="chapters-list">
      <div class="state-msg" id="loadingState">
        <span class="emoji">⏳</span>
        加载中…
      </div>
    </div>
  </div>

  <script src="js/storage.js"></script>
  <script src="js/parser.js"></script>
  <script src="js/vendor/Readability.js"></script>
  <script src="js/chapters.js"></script>
</body>
</html>
```

Save to: `frontend/chapters.html`

- [ ] **Step 2: Create chapters.js**

```js
// frontend/js/chapters.js
(function () {
  const params = new URLSearchParams(location.search);
  const bookId = params.get('id');
  const indexUrl = params.get('url');

  const book = storage.getBook(bookId);
  document.documentElement.dataset.theme = storage.getTheme();

  document.getElementById('backBtn').addEventListener('click', () => {
    location.href = 'index.html';
  });

  if (!bookId || !indexUrl) {
    showError('缺少参数');
    return;
  }

  if (book) {
    document.getElementById('navTitle').textContent = book.title;
    document.title = book.title + ' · 目录';
  }

  async function loadChapters() {
    try {
      const res = await fetch(`/proxy?url=${encodeURIComponent(indexUrl)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      let chapters;
      if (book && book.selectors.chapterList) {
        chapters = parser.extractChapterListWithSelector(doc, book.selectors.chapterList, indexUrl);
      } else {
        chapters = parser.extractChapterList(doc, indexUrl);
      }

      if (chapters.length === 0) {
        showError('未能识别章节列表。请先进入阅读器，点击 ⚙ 选择器 配置章节列表选择器后重试。');
        return;
      }

      renderChapters(chapters);
    } catch (err) {
      showError(`加载失败: ${err.message}`);
    }
  }

  function renderChapters(chapters) {
    const list = document.getElementById('chaptersList');
    list.innerHTML = '';
    const currentUrl = book ? book.currentChapterUrl : '';

    chapters.forEach((ch, idx) => {
      const item = document.createElement('div');
      item.className = 'chapter-item' + (ch.url === currentUrl ? ' current' : '');
      item.textContent = ch.title;
      item.addEventListener('click', () => {
        if (book) {
          storage.updateBook(bookId, {
            currentChapterUrl: ch.url,
            currentChapterTitle: ch.title,
            lastRead: new Date().toISOString(),
          });
        }
        sessionStorage.setItem('chapters', JSON.stringify(chapters));
        sessionStorage.setItem('chapterIdx', String(idx));
        location.href = `reader.html?id=${bookId}&url=${encodeURIComponent(ch.url)}`;
      });
      list.appendChild(item);
    });

    const current = list.querySelector('.current');
    if (current) current.scrollIntoView({ block: 'center' });
  }

  function showError(msg) {
    document.getElementById('chaptersList').innerHTML =
      `<div class="state-msg"><span class="emoji">⚠️</span>${msg}</div>`;
  }

  loadChapters();
})();
```

Save to: `frontend/js/chapters.js`

- [ ] **Step 3: Start server and manual test**

```bash
cd backend && node server.js &
```

Navigate full flow: shelf → add book → chapters page.

- [ ] **Step 4: Manual verification checklist**

- [ ] Nav title shows book name
- [ ] Chapters list renders correctly
- [ ] Current chapter (if any) is highlighted in accent color
- [ ] Clicking a chapter navigates to reader.html with correct URL params
- [ ] Chapter index stored in sessionStorage for prev/next navigation
- [ ] Back button returns to index.html
- [ ] Graceful error when chapter list parsing fails

- [ ] **Step 5: Stop server and commit**

```bash
kill %1
cd ..
git add frontend/chapters.html frontend/js/chapters.js
git commit -m "feat: chapter list page"
```

---

### Task 8: Reader Page

**Files:**
- Create: `frontend/reader.html`
- Create: `frontend/js/reader.js`

- [ ] **Step 1: Create reader.html**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>阅读</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="progress-bar">
    <div class="progress-fill" id="progressFill"></div>
  </div>

  <div class="nav-bar">
    <button class="nav-btn" id="backBtn">← 书架</button>
    <span class="nav-title" id="navTitle">加载中…</span>
    <button class="nav-btn" id="tocBtn">目录 ☰</button>
  </div>

  <div class="page">
    <div class="reader-content" id="readerContent">
      <div class="state-msg">
        <span class="emoji">⏳</span>加载中…
      </div>
    </div>
  </div>

  <div class="bottom-bar">
    <div class="nav-row">
      <button class="nav-chapter-btn" id="prevBtn">◀ 上一章</button>
      <span class="chapter-counter" id="chapterCounter">—</span>
      <button class="nav-chapter-btn" id="nextBtn">下一章 ▶</button>
    </div>
    <div class="control-row">
      <button class="ctrl-btn" id="fontDecBtn">A−</button>
      <button class="ctrl-btn" id="fontIncBtn">A+</button>
      <button class="ctrl-btn" id="themeBtn">☾ 夜间</button>
      <button class="ctrl-btn" id="selectorBtn">⚙ 选择器</button>
    </div>
  </div>

  <!-- TOC overlay -->
  <div class="toc-overlay" id="tocOverlay">
    <div class="toc-panel">
      <div class="toc-header">
        目录
        <button class="toc-close" id="tocClose">✕</button>
      </div>
      <div id="tocList"></div>
    </div>
    <div style="flex:1" id="tocBackdrop"></div>
  </div>

  <!-- Selector modal -->
  <div class="modal-overlay" id="selectorModal">
    <div class="modal-sheet">
      <div class="modal-title">CSS 选择器配置</div>
      <div class="modal-hint">正文内容选择器（留空用 Readability 自动识别）</div>
      <input class="form-input" id="contentSelector" placeholder=".content, #chapter-content">
      <div class="modal-hint">章节列表选择器（留空用自动识别）</div>
      <input class="form-input" id="chapterListSelector" placeholder="#list, .chapter-list">
      <div class="form-row">
        <button class="btn-primary" id="selectorSave">保存并重新加载</button>
        <button class="btn-secondary" id="selectorCancel">取消</button>
      </div>
    </div>
  </div>

  <script src="js/storage.js"></script>
  <script src="js/parser.js"></script>
  <script src="js/vendor/Readability.js"></script>
  <script src="js/reader.js"></script>
</body>
</html>
```

Save to: `frontend/reader.html`

- [ ] **Step 2: Create reader.js**

```js
// frontend/js/reader.js
(function () {
  const params = new URLSearchParams(location.search);
  const bookId = params.get('id');
  const chapterUrl = params.get('url');

  const book = storage.getBook(bookId);
  const chapters = JSON.parse(sessionStorage.getItem('chapters') || 'null');
  let chapterIdx = parseInt(sessionStorage.getItem('chapterIdx') || '-1', 10);

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = document.getElementById('themeBtn');
    btn.textContent = theme === 'dark' ? '☀ 日间' : '☾ 夜间';
    btn.classList.toggle('active', theme === 'dark');
  }

  function applyFontSize(size) {
    document.documentElement.style.setProperty('--font-size', size + 'px');
  }

  applyTheme(storage.getTheme());
  applyFontSize(storage.getFontSize());

  function updateNavButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const counter = document.getElementById('chapterCounter');
    if (chapters && chapters.length > 0) {
      prevBtn.disabled = chapterIdx <= 0;
      nextBtn.disabled = chapterIdx >= chapters.length - 1;
      counter.textContent = `${chapterIdx + 1} / ${chapters.length}`;
    } else {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      counter.textContent = '—';
    }
  }

  function navigateChapter(idx) {
    if (!chapters || idx < 0 || idx >= chapters.length) return;
    const ch = chapters[idx];
    if (book) {
      storage.updateBook(bookId, {
        currentChapterUrl: ch.url,
        currentChapterTitle: ch.title,
        lastRead: new Date().toISOString(),
      });
    }
    sessionStorage.setItem('chapterIdx', String(idx));
    location.href = `reader.html?id=${bookId}&url=${encodeURIComponent(ch.url)}`;
  }

  document.getElementById('prevBtn').addEventListener('click', () => navigateChapter(chapterIdx - 1));
  document.getElementById('nextBtn').addEventListener('click', () => navigateChapter(chapterIdx + 1));
  document.getElementById('backBtn').addEventListener('click', () => { location.href = 'index.html'; });

  // Scroll progress
  window.addEventListener('scroll', () => {
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const pct = total > 0 ? Math.round((window.scrollY / total) * 100) : 0;
    document.getElementById('progressFill').style.width = pct + '%';
  });

  // TOC panel
  document.getElementById('tocBtn').addEventListener('click', () => {
    renderToc();
    document.getElementById('tocOverlay').classList.add('open');
  });
  document.getElementById('tocClose').addEventListener('click', closeToc);
  document.getElementById('tocBackdrop').addEventListener('click', closeToc);

  function closeToc() {
    document.getElementById('tocOverlay').classList.remove('open');
  }

  function renderToc() {
    const list = document.getElementById('tocList');
    list.innerHTML = '';
    if (!chapters) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">无目录信息，请从书架重新进入</div>';
      return;
    }
    chapters.forEach((ch, idx) => {
      const item = document.createElement('div');
      item.className = 'toc-item' + (idx === chapterIdx ? ' current' : '');
      item.textContent = ch.title;
      item.addEventListener('click', () => {
        closeToc();
        if (idx !== chapterIdx) navigateChapter(idx);
      });
      list.appendChild(item);
    });
    const current = list.querySelector('.current');
    if (current) setTimeout(() => current.scrollIntoView({ block: 'center' }), 50);
  }

  // Font size
  document.getElementById('fontDecBtn').addEventListener('click', () => {
    const cur = storage.getFontSize();
    if (cur <= 14) return;
    const next = cur - 2;
    storage.setFontSize(next);
    applyFontSize(next);
  });
  document.getElementById('fontIncBtn').addEventListener('click', () => {
    const cur = storage.getFontSize();
    if (cur >= 22) return;
    const next = cur + 2;
    storage.setFontSize(next);
    applyFontSize(next);
  });

  // Theme toggle
  document.getElementById('themeBtn').addEventListener('click', () => {
    const next = storage.getTheme() === 'dark' ? 'light' : 'dark';
    storage.setTheme(next);
    applyTheme(next);
  });

  // Selector modal
  document.getElementById('selectorBtn').addEventListener('click', () => {
    if (book) {
      document.getElementById('contentSelector').value = book.selectors.content || '';
      document.getElementById('chapterListSelector').value = book.selectors.chapterList || '';
    }
    document.getElementById('selectorModal').classList.add('open');
  });
  document.getElementById('selectorCancel').addEventListener('click', () => {
    document.getElementById('selectorModal').classList.remove('open');
  });
  document.getElementById('selectorSave').addEventListener('click', () => {
    const content = document.getElementById('contentSelector').value.trim();
    const chapterList = document.getElementById('chapterListSelector').value.trim();
    if (book) storage.updateBook(bookId, { selectors: { content, chapterList } });
    document.getElementById('selectorModal').classList.remove('open');
    loadChapter(chapterUrl);
  });

  // Load chapter
  async function loadChapter(url) {
    const contentEl = document.getElementById('readerContent');
    contentEl.innerHTML = '<div class="state-msg"><span class="emoji">⏳</span>加载中…</div>';

    try {
      const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const selectors = book ? book.selectors : { content: '', chapterList: '' };
      let title = '';
      let body = '';

      if (selectors.content) {
        body = parser.extractWithSelector(doc, selectors.content);
        title = doc.querySelector('h1')?.textContent.trim() || '';
      }

      if (!body) {
        const result = parser.extractContent(doc, Readability);
        if (result) { title = result.title; body = result.content; }
      }

      if (!body) {
        contentEl.innerHTML = '<div class="state-msg"><span class="emoji">⚠️</span>内容解析失败，请点击 ⚙ 选择器 配置正文选择器</div>';
        return;
      }

      document.getElementById('navTitle').textContent = title;
      document.title = title;
      contentEl.innerHTML = `<h1>${title}</h1>${body}`;
      window.scrollTo(0, 0);

      if (book) {
        storage.updateBook(bookId, {
          currentChapterUrl: url,
          currentChapterTitle: title,
          lastRead: new Date().toISOString(),
        });
      }
    } catch (err) {
      contentEl.innerHTML = `<div class="state-msg"><span class="emoji">⚠️</span>加载失败: ${err.message}</div>`;
    }
  }

  updateNavButtons();
  loadChapter(chapterUrl);
})();
```

Save to: `frontend/js/reader.js`

- [ ] **Step 3: Start server and manual test**

```bash
cd backend && node server.js &
```

Navigate: shelf → add book → chapters → reader.

- [ ] **Step 4: Manual verification checklist**

- [ ] Chapter content loads and renders with proper typography
- [ ] Title shown in nav bar
- [ ] Scroll updates top progress bar (0% → 100%)
- [ ] A− reduces font size (min 14px), A+ increases (max 22px)
- [ ] Font size persists after page reload
- [ ] ☾ 夜间 switches to dark mode; ☀ 日间 switches back; persists after reload
- [ ] 目录 ☰ opens TOC panel; current chapter highlighted; clicking navigates
- [ ] Clicking outside TOC panel closes it
- [ ] ⚙ 选择器 opens bottom sheet; saving reloads content with new selectors
- [ ] Prev/next chapter buttons navigate correctly; disabled at boundaries
- [ ] Back button returns to index.html
- [ ] Reload page: font size and theme still match last settings

- [ ] **Step 5: Stop server and commit**

```bash
kill %1
cd ..
git add frontend/reader.html frontend/js/reader.js
git commit -m "feat: reader page with toolbar, TOC, and CSS selector override"
```

---

### Task 9: End-to-End Smoke Test

- [ ] **Step 1: Run all automated tests**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 2: Full end-to-end flow**

```bash
cd backend && node server.js &
```

Complete flow:
1. Open `http://localhost:3000` in mobile DevTools view
2. Add a real Chinese novel index URL
3. Verify chapters parse and display
4. Read a chapter — check typography and progress bar
5. Test font size and theme toggle; reload to verify persistence
6. Use TOC panel to jump chapters
7. Test CSS selector override on a page where auto-parse fails
8. Verify reading progress shows on shelf card after returning

- [ ] **Step 3: Final commit**

```bash
kill %1
cd ..
git add .
git commit -m "chore: complete novel reader H5 app"
```
