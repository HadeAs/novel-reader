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
