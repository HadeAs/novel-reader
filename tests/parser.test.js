const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const parser = require('../frontend/js/parser');

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
