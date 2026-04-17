const NAV_WORDS = /^(首页|登录|注册|搜索|书架|排行|分类|签到|充值|VIP|会员|下载|APP)$/;

const parser = {
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

  _Readability: null,
  _jsdomParse: null,
};

if (typeof window !== 'undefined') window.parser = parser;
if (typeof module !== 'undefined') module.exports = parser;
