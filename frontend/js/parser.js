const NAV_WORDS = /^(首页|登录|注册|搜索|书架|排行|分类|签到|充值|VIP|会员|下载|APP|上一[章页]|下一[章页]|返回|目录|加入书架|投票|举报)$/;
const CHAPTER_PAT = /第[零一二三四五六七八九十百千\d]+[章节卷篇]/;
const SKIP_TAGS = new Set(['NAV', 'HEADER', 'FOOTER']);

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

    const isCandidate = a => {
      if (SKIP_TAGS.has(a.closest('nav, header, footer')?.tagName)) return false;
      if (a.closest('nav, header, footer')) return false;
      const text = a.textContent.trim();
      if (text.length < 2 || text.length > 60) return false;
      if (NAV_WORDS.test(text)) return false;
      const href = a.getAttribute('href') || '';
      if (!href || href === '#' || href.startsWith('javascript:')) return false;
      return true;
    };

    const candidates = allAs.filter(isCandidate);
    if (candidates.length < 3) return [];

    // Score containers at up to 5 ancestor levels
    const scores = new Map();
    const chapterScores = new Map();
    candidates.forEach(a => {
      let el = a.parentElement;
      for (let i = 0; i < 5 && el && el.tagName !== 'BODY'; i++, el = el.parentElement) {
        scores.set(el, (scores.get(el) || 0) + 1);
        if (CHAPTER_PAT.test(a.textContent)) {
          chapterScores.set(el, (chapterScores.get(el) || 0) + 1);
        }
      }
    });

    // Prefer container with most chapter-pattern links; fall back to most links
    let best = null, bestN = 0;
    chapterScores.forEach((n, el) => {
      if (n > bestN) { bestN = n; best = el; }
    });
    if (!best || bestN < 3) {
      bestN = 0;
      scores.forEach((n, el) => {
        if (n > bestN) { bestN = n; best = el; }
      });
    }

    if (!best || bestN < 3) return [];

    return Array.from(best.querySelectorAll('a[href]'))
      .filter(isCandidate)
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
