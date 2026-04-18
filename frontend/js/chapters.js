(function () {
  const params = new URLSearchParams(location.search);
  const bookId = params.get('id');
  const indexUrl = params.get('url');

  let book = storage.getBook(bookId);
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
      const html = await proxyFetch(indexUrl);
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

  // Selector modal
  document.getElementById('settingsBtn').addEventListener('click', () => {
    if (book) {
      document.getElementById('chapterListSelector').value = book.selectors.chapterList || '';
      try {
        document.getElementById('siteCookie').value =
          storage.getCookie(new URL(book.indexUrl).hostname);
      } catch (_) {}
    }
    document.getElementById('selectorModal').classList.add('open');
  });

  document.getElementById('selectorCancel').addEventListener('click', () => {
    document.getElementById('selectorModal').classList.remove('open');
  });

  document.getElementById('selectorSave').addEventListener('click', () => {
    const sel = document.getElementById('chapterListSelector').value.trim();
    const cookie = document.getElementById('siteCookie').value.trim();
    if (book) {
      storage.updateBook(bookId, {
        selectors: { ...book.selectors, chapterList: sel },
      });
      book = storage.getBook(bookId); // refresh local ref
      try {
        storage.setCookie(new URL(book.indexUrl).hostname, cookie);
      } catch (_) {}
    }
    document.getElementById('selectorModal').classList.remove('open');
    loadChapters();
  });

  loadChapters();
})();
