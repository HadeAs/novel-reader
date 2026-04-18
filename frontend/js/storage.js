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

  getFontFamily() {
    return localStorage.getItem('font_family') || 'serif';
  },

  setFontFamily(key) {
    localStorage.setItem('font_family', key);
  },

  getTheme() {
    return localStorage.getItem('theme') || 'light';
  },

  setTheme(theme) {
    localStorage.setItem('theme', theme);
  },

  getScrollPos(bookId) {
    return parseFloat(localStorage.getItem(`scroll_${bookId}`) || '0');
  },

  setScrollPos(bookId, pct) {
    localStorage.setItem(`scroll_${bookId}`, String(pct));
  },

  getCookie(hostname) {
    return localStorage.getItem(`cookie_${hostname}`) || '';
  },

  setCookie(hostname, cookie) {
    if (cookie) {
      localStorage.setItem(`cookie_${hostname}`, cookie);
    } else {
      localStorage.removeItem(`cookie_${hostname}`);
    }
  },
};

if (typeof window !== 'undefined') window.storage = storage;
if (typeof module !== 'undefined') module.exports = storage;
