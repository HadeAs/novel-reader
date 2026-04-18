(function () {
  let managing = false;
  let editingId = null;

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
        <div class="card-actions">
          <button class="card-action-btn edit">✏</button>
          <button class="card-action-btn delete">✕</button>
        </div>
      `;

      card.querySelector('.card-action-btn.edit').addEventListener('click', e => {
        e.stopPropagation();
        openEdit(book);
      });

      card.querySelector('.card-action-btn.delete').addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`删除《${book.title}》？`)) {
          storage.removeBook(book.id);
          renderShelf();
        }
      });

      card.addEventListener('click', () => {
        if (managing) return;
        if (book.currentChapterUrl) {
          location.href = `reader.html?id=${book.id}&url=${encodeURIComponent(book.currentChapterUrl)}`;
        } else {
          location.href = `chapters.html?id=${book.id}&url=${encodeURIComponent(book.indexUrl)}`;
        }
      });

      grid.appendChild(card);
    });

    grid.className = managing ? 'shelf-grid manage-mode' : 'shelf-grid';
  }

  // Manage toggle
  document.getElementById('manageBtn').addEventListener('click', () => {
    managing = !managing;
    document.getElementById('manageBtn').textContent = managing ? '完成' : '管理';
    renderShelf();
  });

  // Edit modal
  function openEdit(book) {
    editingId = book.id;
    document.getElementById('editTitle').value = book.title;
    document.getElementById('editUrl').value = book.indexUrl;
    document.getElementById('editModal').classList.add('open');
  }

  document.getElementById('editCancel').addEventListener('click', () => {
    document.getElementById('editModal').classList.remove('open');
  });

  document.getElementById('editSave').addEventListener('click', () => {
    const title = document.getElementById('editTitle').value.trim();
    const indexUrl = document.getElementById('editUrl').value.trim();
    if (!title || !indexUrl) { alert('书名和网址不能为空'); return; }
    storage.updateBook(editingId, { title, indexUrl });
    document.getElementById('editModal').classList.remove('open');
    renderShelf();
  });

  // Add book form
  document.getElementById('toggleAddBtn').addEventListener('click', () => {
    document.getElementById('addForm').classList.toggle('open');
  });

  document.getElementById('addCancelBtn').addEventListener('click', () => {
    document.getElementById('addForm').classList.remove('open');
    document.getElementById('urlInput').value = '';
    document.getElementById('titleInput').value = '';
    document.getElementById('cookieInput').value = '';
  });

  document.getElementById('addConfirmBtn').addEventListener('click', async () => {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { alert('请输入网址'); return; }

    const titleHint = document.getElementById('titleInput').value.trim();
    const cookie = document.getElementById('cookieInput').value.trim();
    const loading = document.getElementById('loadingText');
    const confirmBtn = document.getElementById('addConfirmBtn');
    loading.style.display = 'block';
    confirmBtn.disabled = true;

    try {
      if (cookie) {
        try { storage.setCookie(new URL(url).hostname, cookie); } catch (_) {}
      }
      const html = await proxyFetch(url);
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
      document.getElementById('cookieInput').value = '';
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
