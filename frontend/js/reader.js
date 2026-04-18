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

  // Scroll progress bar
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
      try {
        const hostname = new URL(book.indexUrl).hostname;
        document.getElementById('siteCookie').value = storage.getCookie(hostname);
      } catch (_) {}
    }
    document.getElementById('selectorModal').classList.add('open');
  });
  document.getElementById('selectorCancel').addEventListener('click', () => {
    document.getElementById('selectorModal').classList.remove('open');
  });
  document.getElementById('selectorSave').addEventListener('click', () => {
    const content = document.getElementById('contentSelector').value.trim();
    const chapterList = document.getElementById('chapterListSelector').value.trim();
    const cookie = document.getElementById('siteCookie').value.trim();
    if (book) {
      storage.updateBook(bookId, { selectors: { content, chapterList } });
      try {
        const hostname = new URL(book.indexUrl).hostname;
        storage.setCookie(hostname, cookie);
      } catch (_) {}
    }
    document.getElementById('selectorModal').classList.remove('open');
    loadChapter(chapterUrl);
  });

  // Load chapter content
  async function loadChapter(url) {
    const contentEl = document.getElementById('readerContent');
    contentEl.innerHTML = '<div class="state-msg"><span class="emoji">⏳</span>加载中…</div>';

    try {
      const html = await proxyFetch(url);
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
