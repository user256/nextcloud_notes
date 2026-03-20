(() => {
  // ── State ──────────────────────────────────────────────────────────
  let notes = [];
  let currentNoteId = null;
  let saveTimer = null;
  let remoteSaveTimer = null;
  let isPreview = false;
  let searchQuery = '';

  let syncEnabled = false;
  let hasCreds = false;
  let lastSyncStatusText = '';
  let lastSyncErrorRaw = '';

  // ── DOM refs ────────────────────────────────────────────────────────
  const html = document.documentElement;
  const viewList = document.getElementById('view-list');
  const viewEditor = document.getElementById('view-editor');
  const notesList = document.getElementById('notes-list');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const noteTitle = document.getElementById('note-title');
  const noteEditor = document.getElementById('note-editor');
  const notePreview = document.getElementById('note-preview');
  const wordCount = document.getElementById('word-count');
  const saveStatus = document.getElementById('save-status');
  const syncStatus = document.getElementById('sync-status');
  const btnNewNote = document.getElementById('btn-new-note');
  const btnFetchRemote = document.getElementById('btn-fetch-remote');
  const btnSettings = document.getElementById('btn-settings');
  const btnBack = document.getElementById('btn-back');
  const btnPreview = document.getElementById('btn-preview');
  const btnSave = document.getElementById('btn-save');
  const btnDownload = document.getElementById('btn-download');
  const btnDelete = document.getElementById('btn-delete');
  const btnTheme = document.getElementById('btn-theme');
  const iconMoon = document.getElementById('icon-moon');
  const iconSun = document.getElementById('icon-sun');

  // ── Storage keys ────────────────────────────────────────────────────
  const STORAGE_NOTES_KEY = 'nn_notes';
  const STORAGE_SYNC_ENABLED_KEY = 'nn_sync_enabled';
  const STORAGE_ACCENT_KEY = 'nn_accent';

  // ── Theme ────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    if (theme === 'light') {
      iconMoon.style.display = 'none';
      iconSun.style.display = '';
      btnTheme.title = 'Switch to dark mode';
    } else {
      iconMoon.style.display = '';
      iconSun.style.display = 'none';
      btnTheme.title = 'Switch to light mode';
    }
  }

  function loadTheme() {
    chrome.storage.local.get(['nn_theme'], result => {
      applyTheme(result.nn_theme || 'dark');
    });
  }

  function toggleTheme() {
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    chrome.storage.local.set({ nn_theme: next });
  }

  btnTheme.addEventListener('click', toggleTheme);

  // ── Accent color ────────────────────────────────────────────────────
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const v = m[1];
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16)
    };
  }

  function rgbToHex({ r, g, b }) {
    const to2 = n => String(n).padStart(2, '0');
    return '#' + to2(r.toString(16)) + to2(g.toString(16)) + to2(b.toString(16));
  }

  function lightenRgb(rgb, factor) {
    return {
      r: Math.round(rgb.r + (255 - rgb.r) * factor),
      g: Math.round(rgb.g + (255 - rgb.g) * factor),
      b: Math.round(rgb.b + (255 - rgb.b) * factor)
    };
  }

  function setAccentColor(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;

    const accent = '#' + ('' + rgb.r.toString(16)).padStart(2, '0') + ('' + rgb.g.toString(16)).padStart(2, '0') + ('' + rgb.b.toString(16)).padStart(2, '0');
    const accent2Rgb = lightenRgb(rgb, 0.35);
    const accent2 = rgbToHex(accent2Rgb);

    html.style.setProperty('--accent', accent);
    html.style.setProperty('--accent2', accent2);
    html.style.setProperty('--accent-dim', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.13)`);
    html.style.setProperty('--accent-dim2', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.06)`);
    html.style.setProperty('--logo-fill', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.07)`);
  }

  async function loadAccentColor() {
    const result = await chrome.storage.local.get([STORAGE_ACCENT_KEY]);
    setAccentColor(result[STORAGE_ACCENT_KEY] || '#0082C9');
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!changes[STORAGE_ACCENT_KEY]) return;
    setAccentColor(changes[STORAGE_ACCENT_KEY].newValue);
  });

  function openOptionsPage() {
    if (chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    const url = chrome.runtime.getURL('options.html');
    window.open(url, '_blank');
  }

  if (btnSettings) btnSettings.addEventListener('click', openOptionsPage);

  // ── Sync UI ──────────────────────────────────────────────────────────
  function updateSyncStatus(text) {
    if (text) {
      syncStatus.textContent = text;
      lastSyncStatusText = text;
      if (/failed|error/i.test(text)) {
        syncStatus.style.color = 'var(--red)';
      } else if (/syncing/i.test(text) || /fetching/i.test(text)) {
        syncStatus.style.color = 'var(--accent)';
      } else {
        syncStatus.style.color = 'var(--text3)';
      }
      return;
    }
    if (!syncEnabled) {
      syncStatus.textContent = 'Local only';
      lastSyncStatusText = 'Local only';
      lastSyncErrorRaw = '';
      syncStatus.style.color = 'var(--text3)';
      return;
    }
    if (!hasCreds) {
      syncStatus.textContent = 'Connect required';
      lastSyncStatusText = 'Connect required';
      lastSyncErrorRaw = '';
      syncStatus.style.color = 'var(--red)';
      return;
    }
    syncStatus.textContent = 'Nextcloud sync: On';
    lastSyncStatusText = 'Nextcloud sync: On';
    lastSyncErrorRaw = '';
    syncStatus.style.color = 'var(--accent)';
  }

  async function refreshCredsAndSyncPref() {
    const data = await chrome.storage.sync.get(['url', 'username', 'password']);
    const baseUrl = (data.url || '').trim().replace(/\/$/, '');
    const username = (data.username || '').trim();
    const password = (data.password || '').trim();
    hasCreds = !!(baseUrl && username && password);

    const pref = await chrome.storage.local.get([STORAGE_SYNC_ENABLED_KEY]);
    const stored = pref[STORAGE_SYNC_ENABLED_KEY];

    if (typeof stored === 'boolean') {
      syncEnabled = stored && hasCreds;
    } else {
      // Preserve old behavior when credentials already exist.
      syncEnabled = hasCreds;
    }

    updateSyncStatus();
  }

  async function ensureCredsForNextcloud({ defaultEnableSync }) {
    if (hasCreds) {
      syncEnabled = !!defaultEnableSync;
      await chrome.storage.local.set({ [STORAGE_SYNC_ENABLED_KEY]: syncEnabled });
      updateSyncStatus();
      return true;
    }

    const result = await openCredModal({ defaultEnableSync });
    if (!result) return false;

    syncEnabled = !!result.enableSync;
    await chrome.storage.local.set({ [STORAGE_SYNC_ENABLED_KEY]: syncEnabled });
    await refreshCredsAndSyncPref();
    // refreshCredsAndSyncPref may turn syncEnabled off if creds still invalid.
    return hasCreds && syncEnabled;
  }

  async function openCredModal({ defaultEnableSync }) {
    const current = await chrome.storage.sync.get(['url', 'username', 'password']);
    const prefillUrl = (current.url || '').trim().replace(/\/$/, '');
    const prefillUsername = (current.username || '').trim();

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'cred-overlay';

      overlay.innerHTML = `
        <div class="cred-box" role="dialog" aria-modal="true">
          <div class="cred-title">Connect Nextcloud</div>
          <div class="cred-hint">Credentials are only needed for syncing to Nextcloud. You can always save locally.</div>

          <div class="cred-grid">
            <div>
              <label for="nc-url">Nextcloud URL</label>
              <input id="nc-url" type="url" placeholder="https://example.com" value="${escapeAttr(prefillUrl)}" />
            </div>
            <div>
              <label for="nc-username">Username</label>
              <input id="nc-username" type="text" placeholder="username" value="${escapeAttr(prefillUsername)}" />
            </div>
            <div>
              <label for="nc-password">Password or app password</label>
              <input id="nc-password" type="password" placeholder="••••••••" />
            </div>
          </div>

          <label style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--text2);margin-bottom:12px;">
            <input id="nc-enable-sync" type="checkbox" ${defaultEnableSync ? 'checked' : ''}/>
            Enable Nextcloud sync (auto-save to cloud)
          </label>

          <div class="cred-error" id="nc-error"></div>

          <div class="cred-actions">
            <button class="cred-btn cred-btn-secondary" id="nc-local-only">Save locally only</button>
            <button class="cred-btn cred-btn-primary" id="nc-connect">Connect</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const errorBox = overlay.querySelector('#nc-error');
      const btnConnect = overlay.querySelector('#nc-connect');
      const btnLocalOnly = overlay.querySelector('#nc-local-only');
      const urlInput = overlay.querySelector('#nc-url');
      const usernameInput = overlay.querySelector('#nc-username');
      const passwordInput = overlay.querySelector('#nc-password');
      const enableSyncInput = overlay.querySelector('#nc-enable-sync');

      function close(result) {
        overlay.remove();
        resolve(result);
      }

      overlay.addEventListener('click', e => {
        if (e.target === overlay) close(null);
      });

      btnLocalOnly.addEventListener('click', () => close({ enableSync: false }));

      btnConnect.addEventListener('click', async () => {
        errorBox.classList.remove('visible');
        errorBox.textContent = '';

        const url = (urlInput.value || '').trim().replace(/\/$/, '');
        const username = (usernameInput.value || '').trim();
        const password = (passwordInput.value || '').trim();

        if (!url || !username || !password) {
          errorBox.textContent = 'Please fill URL, username, and password.';
          errorBox.classList.add('visible');
          return;
        }

        await chrome.storage.sync.set({ url, username, password });

        // Validate credentials with a tiny request (fetch 1 note chunk).
        updateSyncStatus('Connecting...');
        const resp = await sendNcMessage('ncFetchNotes', { chunkSize: 1 });
        if (resp && resp.ok) {
          close({ enableSync: !!enableSyncInput.checked });
          return;
        }

        const msg = (resp && resp.error) ? resp.error : 'Failed to connect to Nextcloud.';
        errorBox.textContent = msg;
        errorBox.classList.add('visible');
        updateSyncStatus();
      });
    });
  }

  // ── Storage ──────────────────────────────────────────────────────────
  function loadNotes() {
    return new Promise(resolve => {
      chrome.storage.local.get([STORAGE_NOTES_KEY], result => {
        notes = result[STORAGE_NOTES_KEY] || [];
        resolve(notes);
      });
    });
  }

  function saveNotes() {
    return new Promise(resolve => {
      chrome.storage.local.set({ [STORAGE_NOTES_KEY]: notes }, resolve);
    });
  }

  // ── Note helpers ────────────────────────────────────────────────────
  function createNote() {
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: '',
      content: '',
      created: Date.now(),
      updated: Date.now(),
      remote: null // { id, etag, readonly, modified, category, favorite }
    };
  }

  function getNoteById(id) {
    return notes.find(n => n.id === id);
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    const day = 86400000;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < day) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 2 * day) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function getPreviewText(content) {
    return content
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  // ── Render list ────────────────────────────────────────────────────
  function renderList() {
    const filtered = searchQuery
      ? notes.filter(n =>
          n.title.toLowerCase().includes(searchQuery) ||
          n.content.toLowerCase().includes(searchQuery)
        )
      : notes;

    const sorted = [...filtered].sort((a, b) => b.updated - a.updated);

    notesList.innerHTML = '';

    if (sorted.length === 0) {
      if (!searchQuery) {
        notesList.appendChild(emptyState);
        emptyState.style.display = 'flex';
      } else {
        notesList.innerHTML = '<div class="empty-state"><svg width="36" height="36" viewBox="0 0 36 36" fill="none" class="empty-pad-icon"><rect x="5" y="7" width="26" height="25" rx="3" stroke="var(--border2)" stroke-width="1.8"/><circle cx="12" cy="7" r="2.5" fill="var(--bg)" stroke="var(--border2)" stroke-width="1.5"/><circle cx="18" cy="7" r="2.5" fill="var(--bg)" stroke="var(--border2)" stroke-width="1.5"/><circle cx="24" cy="7" r="2.5" fill="var(--bg)" stroke="var(--border2)" stroke-width="1.5"/><line x1="10" y1="17" x2="26" y2="17" stroke="var(--border2)" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="22" x2="26" y2="22" stroke="var(--border2)" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="27" x2="20" y2="27" stroke="var(--border2)" stroke-width="1.5" stroke-linecap="round"/></svg><p>No results found</p></div>';
      }
      return;
    }

    emptyState.style.display = 'none';

    sorted.forEach(note => {
      const item = document.createElement('div');
      item.className = 'note-item';
      item.dataset.id = note.id;

      const preview = getPreviewText(note.content);
      const title = note.title || 'Untitled';
      const isReadonlyRemote = !!(note.remote && note.remote.readonly);

      const remoteTag = syncEnabled && note.remote ? (isReadonlyRemote ? ' (read-only)' : '') : '';

      item.innerHTML =
        '<div class="note-item-click">' +
          '<svg class="note-item-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
            '<rect x="1.5" y="2" width="11" height="11" rx="1.5" fill="var(--accent-dim)" stroke="var(--accent)" stroke-width="1.2"/>' +
            '<line x1="3.5" y1="5.5" x2="10.5" y2="5.5" stroke="var(--accent)" stroke-width="0.9" stroke-linecap="round" opacity="0.7"/>' +
            '<line x1="3.5" y1="7.5" x2="10.5" y2="7.5" stroke="var(--accent)" stroke-width="0.9" stroke-linecap="round" opacity="0.55"/>' +
            '<line x1="3.5" y1="9.5" x2="7.5" y2="9.5" stroke="var(--accent)" stroke-width="0.9" stroke-linecap="round" opacity="0.4"/>' +
          '</svg>' +
          '<div class="note-item-body">' +
            '<div class="note-item-title">' + escapeHtml(title + remoteTag) + '</div>' +
            (preview ? '<div class="note-item-preview">' + escapeHtml(preview) + '</div>' : '') +
            '<div class="note-item-meta"><span class="note-item-date">' + formatDate(note.updated) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<button class="note-item-delete" title="Delete note" data-id="' + escapeAttr(note.id) + '">' +
          '<svg width="13" height="13" viewBox="0 0 13 13" fill="none">' +
            '<path d="M2 3.5h9M4.5 3.5V3h4v.5M3.5 3.5v6.5h6V3.5h-6z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>' +
        '</button>';

      item.querySelector('.note-item-click').addEventListener('click', () => openNote(note.id));
      item.querySelector('.note-item-delete').addEventListener('click', e => {
        e.stopPropagation();
        confirmDeleteById(note.id, title);
      });

      notesList.appendChild(item);
    });
  }

  // ── Views ────────────────────────────────────────────────────────────
  function showView(name) {
    viewList.classList.toggle('active', name === 'list');
    viewEditor.classList.toggle('active', name === 'editor');
  }

  function openNote(id) {
    // If the user clicks into another note while the previous one is "dirty",
    // force-save immediately so our later sync uses the right content.
    if (currentNoteId && currentNoteId !== id) {
      clearTimeout(saveTimer);
      clearTimeout(remoteSaveTimer);
      const oldId = currentNoteId;
      saveCurrentNote();
      scheduleRemoteSync(oldId);
    }

    const note = getNoteById(id);
    if (!note) return;

    currentNoteId = id;

    noteTitle.value = note.title;
    noteEditor.value = note.content;

    const isReadonlyRemote = !!(note.remote && note.remote.readonly);
    noteEditor.readOnly = isReadonlyRemote;
    noteTitle.disabled = isReadonlyRemote;
    noteTitle.style.opacity = isReadonlyRemote ? '0.7' : '';

    btnDelete.disabled = false;
    noteEditor.classList.remove('hidden');
    notePreview.classList.add('hidden');

    isPreview = false;
    btnPreview.classList.remove('active');

    updateWordCount();
    showView('editor');
    noteEditor.focus();
  }

  function openNewNote() {
    const note = createNote();
    notes.unshift(note);
    saveNotes();
    openNote(note.id);
  }

  function goBack() {
    const noteId = currentNoteId;
    // Prevent any pending save timers from running against an empty editor state.
    clearTimeout(saveTimer);
    clearTimeout(remoteSaveTimer);
    saveCurrentNote();
    scheduleRemoteSync(noteId);
    showView('list');
    renderList();
    currentNoteId = null;
  }

  // ── Save ────────────────────────────────────────────────────────────
  function saveCurrentNote() {
    if (!currentNoteId) return;
    const note = getNoteById(currentNoteId);
    if (!note) return;

    const titleRaw = (noteTitle.value || '').trim();
    if (!titleRaw) {
      const derived = deriveTitleFromContent(noteEditor.value);
      noteTitle.value = derived;
      note.title = derived;
    } else {
      note.title = noteTitle.value;
    }
    note.content = noteEditor.value;
    note.updated = Date.now();

    return saveNotes();
  }

  function debouncedSave() {
    clearTimeout(saveTimer);
    saveStatus.textContent = 'Saving…';
    saveStatus.classList.add('visible');
    const noteId = currentNoteId;
    saveTimer = setTimeout(async () => {
      await saveCurrentNote();
      saveStatus.textContent = 'Saved';
      setTimeout(() => saveStatus.classList.remove('visible'), 1800);
      scheduleRemoteSync(noteId);
    }, 600);
  }

  function scheduleRemoteSync(noteId) {
    if (!noteId) return;
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(async () => {
      if (!syncEnabled) return;
      if (!hasCreds) return;
      await syncNoteToNextcloud(noteId);
    }, 1400);
  }

  // ── Nextcloud sync ─────────────────────────────────────────────────
  function sendNcMessage(action, payload) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action, ...payload }, response => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || 'Unknown error', code: 'RUNTIME' });
          return;
        }
        resolve(response);
      });
    });
  }

  function mapRemoteToLocal(remote) {
    const modifiedMs = remote && typeof remote.modified === 'number' ? remote.modified * 1000 : Date.now();
    return {
      id: 'nc-' + remote.id,
      title: remote.title || '',
      content: remote.content || '',
      created: modifiedMs,
      updated: modifiedMs,
      remote: {
        id: remote.id,
        etag: remote.etag || null,
        readonly: !!remote.readonly,
        modified: remote.modified || null,
        category: remote.category || '',
        favorite: !!remote.favorite
      }
    };
  }

  function hasNonEmptyNote(note) {
    return !!((note.title || '').trim() || (note.content || '').trim());
  }

  function deriveTitleFromContent(content) {
    const text = String(content || '')
      // Remove common markdown punctuation so we get cleaner "words"
      .replace(/[>#*_`\[\]()-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) return '';

    // Take first 5 "words" (alnum + apostrophes/hyphens)
    const words = (text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []);
    return words.slice(0, 5).join(' ');
  }

  async function syncNoteToNextcloud(noteId) {
    if (!noteId) return;
    const note = getNoteById(noteId);
    if (!note) return;

    if (!hasNonEmptyNote(note)) return;

    if (note.remote && note.remote.readonly) {
      updateSyncStatus('Read-only note');
      return;
    }

    updateSyncStatus('Syncing…');

    if (!note.remote) {
      const resp = await sendNcMessage('ncCreateNote', { title: note.title, content: note.content });
      if (resp && resp.ok) {
        const created = resp.note;
        const modifiedMs = (created.modified ? created.modified * 1000 : Date.now());
        note.remote = {
          id: created.id,
          etag: created.etag || null,
          readonly: !!created.readonly,
          modified: created.modified || null,
          category: created.category || '',
          favorite: !!created.favorite
        };
        note.updated = modifiedMs;
        await saveNotes();
        updateSyncStatus();
        return;
      }

      if (resp && resp.code === 'NO_CREDS') {
        await refreshCredsAndSyncPref();
        updateSyncStatus();
        return;
      }

      console.error('[Nextcloud Notes] Create failed', resp);
      if (resp && typeof resp.error !== 'undefined') lastSyncErrorRaw = resp.error;
      updateSyncStatus('Sync failed' + formatSyncError(resp));
      return;
    }

    const resp = await sendNcMessage('ncUpdateNote', {
      noteId: note.remote.id,
      title: note.title,
      content: note.content,
      etag: note.remote.etag
    });

    if (resp && resp.ok) {
      const updated = resp.note;
      note.remote.etag = updated.etag || note.remote.etag;
      note.remote.readonly = !!updated.readonly;
      note.updated = (updated.modified ? updated.modified * 1000 : Date.now());
      note.remote.modified = updated.modified || note.remote.modified;
      note.remote.category = updated.category || note.remote.category;
      note.remote.favorite = !!updated.favorite;
      await saveNotes();
      updateSyncStatus();
      return;
    }

    if (resp && resp.code === 'NO_CREDS') {
      await refreshCredsAndSyncPref();
      updateSyncStatus();
      return;
    }

    console.error('[Nextcloud Notes] Update failed', { noteId, resp });
    if (resp && typeof resp.error !== 'undefined') lastSyncErrorRaw = resp.error;
    updateSyncStatus('Sync failed' + formatSyncError(resp));
  }

  async function fetchRemoteNotes({ replaceLocal = false } = {}) {
    updateSyncStatus('Fetching…');
    const resp = await sendNcMessage('ncFetchNotes', { chunkSize: 0 });
    if (!resp || !resp.ok) {
      console.error('[Nextcloud Notes] Fetch failed', resp);
      if (resp && typeof resp.error !== 'undefined') lastSyncErrorRaw = resp.error;
      updateSyncStatus('Sync failed' + formatSyncError(resp));
      return { ok: false, error: resp && resp.error ? resp.error : 'Failed to fetch notes.' };
    }

    const remoteNotes = Array.isArray(resp.notes) ? resp.notes : [];
    const mapped = remoteNotes.map(mapRemoteToLocal);

    if (replaceLocal) {
      // Keep unsynced local notes.
      const unsynced = notes.filter(n => !n.remote);
      notes = [...mapped, ...unsynced];
    } else {
      const byRemoteId = new Map();
      notes.forEach(n => {
        if (n.remote && typeof n.remote.id === 'number') byRemoteId.set(n.remote.id, n);
      });

      mapped.forEach(rn => {
        const existing = byRemoteId.get(rn.remote.id);
        if (existing) {
          existing.title = rn.title;
          existing.content = rn.content;
          existing.updated = rn.updated;
          existing.remote = rn.remote;
        } else {
          notes.unshift(rn);
        }
      });
    }

    await saveNotes();
    renderList();
    updateSyncStatus();
    return { ok: true };
  }

  // ── Word count ──────────────────────────────────────────────────────
  function updateWordCount() {
    const text = noteEditor.value.trim();
    const count = text ? text.split(/\s+/).length : 0;
    wordCount.textContent = count + ' word' + (count !== 1 ? 's' : '');
  }

  // ── Markdown preview ────────────────────────────────────────────────
  function renderPreview() {
    const md = noteEditor.value || '*Nothing to preview yet.*';
    notePreview.innerHTML = (typeof marked !== 'undefined' && marked.parse)
      ? marked.parse(md)
      : '<pre>' + escapeHtml(md) + '</pre>';
  }

  function togglePreview() {
    isPreview = !isPreview;
    if (isPreview) {
      renderPreview();
      noteEditor.classList.add('hidden');
      notePreview.classList.remove('hidden');
      btnPreview.classList.add('active');
    } else {
      noteEditor.classList.remove('hidden');
      notePreview.classList.add('hidden');
      btnPreview.classList.remove('active');
      noteEditor.focus();
    }
  }

  // ── Download ─────────────────────────────────────────────────────────
  function downloadNote() {
    if (!currentNoteId) return;
    const note = getNoteById(currentNoteId);
    if (!note) return;
    const title = note.title || 'untitled';
    const content = (note.title ? '# ' + note.title + '\n\n' : '') + note.content;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (title.replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'note') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Delete ───────────────────────────────────────────────────────────
  async function confirmDeleteById(id, title) {
    const note = getNoteById(id);
    const isRemoteReadOnly = !!(note && note.remote && note.remote.readonly);

    const short = (title || '').length > 28 ? (title || '').slice(0, 28) + '…' : (title || '');
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    overlay.innerHTML =
      '<div class="confirm-box">' +
        '<p>Delete &ldquo;' + escapeHtml(short) + '&rdquo;?</p>' +
        '<span>This action cannot be undone.</span>' +
        '<div class="confirm-actions">' +
          '<button class="btn-cancel">Cancel</button>' +
          '<button class="btn-confirm-delete">Delete</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('.btn-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('.btn-confirm-delete').addEventListener('click', async () => {
      if (!note) {
        overlay.remove();
        return;
      }

      try {
        if (note.remote && syncEnabled && hasCreds) {
          if (!isRemoteReadOnly) {
            const resp = await sendNcMessage('ncDeleteNote', { noteId: note.remote.id });
            if (!resp || !resp.ok) {
              saveStatus.textContent = (resp && resp.error) ? resp.error : 'Failed to delete.';
              saveStatus.classList.add('visible');
              overlay.remove();
              setTimeout(() => saveStatus.classList.remove('visible'), 2200);
              return;
            }
          }
          // If read-only on server, we still allow local removal.
        }

        notes = notes.filter(n => n.id !== id);
        await saveNotes();

        overlay.remove();

        if (id === currentNoteId) {
          currentNoteId = null;
          showView('list');
        }
        renderList();
        updateSyncStatus();
      } catch (e) {
        overlay.remove();
      }
    });
  }

  function confirmDelete() {
    if (!currentNoteId) return;
    const note = getNoteById(currentNoteId);
    confirmDeleteById(currentNoteId, note ? (note.title || 'Untitled') : 'this note');
  }

  // ── Toolbar ───────────────────────────────────────────────────────────
  function insertAtCursor(before, after, placeholder) {
    after = after || '';
    placeholder = placeholder || '';
    const ta = noteEditor;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end) || placeholder;
    const insert = before + selected + after;
    ta.setRangeText(insert, start, end, 'end');
    if (!ta.value.slice(start, end)) {
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + placeholder.length;
    }
    ta.focus();
    debouncedSave();
    updateWordCount();
  }

  function insertLine(prefix) {
    const ta = noteEditor;
    const start = ta.selectionStart;
    const val = ta.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const line = val.slice(lineStart, lineEnd === -1 ? val.length : lineEnd);
    ta.setRangeText(prefix + line, lineStart, lineEnd === -1 ? val.length : lineEnd, 'end');
    ta.focus();
    debouncedSave();
  }

  document.querySelectorAll('.tool-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const action = btn.dataset.action;
      if (action === 'h1') insertLine('# ');
      else if (action === 'h2') insertLine('## ');
      else if (action === 'h3') insertLine('### ');
      else if (action === 'bold') insertAtCursor('**', '**', 'bold text');
      else if (action === 'italic') insertAtCursor('_', '_', 'italic text');
      else if (action === 'code-inline') insertAtCursor('`', '`', 'code');
      else if (action === 'ul') insertLine('- ');
      else if (action === 'ol') insertLine('1. ');
      else if (action === 'link') insertAtCursor('[', '](https://)', 'link text');
      else if (action === 'table') insertAtCursor('', '', '| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Cell     | Cell     | Cell     |\n| Cell     | Cell     | Cell     |');
      else if (action === 'code-block') insertAtCursor('```\n', '\n```', 'code here');
    });
  });

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  noteEditor.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); insertAtCursor('**', '**', 'bold text'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); insertAtCursor('_', '_', 'italic text'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); insertAtCursor('[', '](https://)', 'link text'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); togglePreview(); }
    if (e.key === 'Tab') { e.preventDefault(); insertAtCursor('  '); }
  });

  // ── Event listeners ─────────────────────────────────────────────────
  btnNewNote.addEventListener('click', openNewNote);
  btnBack.addEventListener('click', goBack);
  btnPreview.addEventListener('click', togglePreview);
  btnDownload.addEventListener('click', downloadNote);
  btnDelete.addEventListener('click', confirmDelete);
  if (btnSave) btnSave.addEventListener('click', manualSave);
  noteTitle.addEventListener('input', debouncedSave);
  noteEditor.addEventListener('input', function() { debouncedSave(); updateWordCount(); });
  searchInput.addEventListener('input', function() {
    searchQuery = searchInput.value.toLowerCase().trim();
    renderList();
  });

  syncStatus.addEventListener('click', async () => {
    // If the status is currently showing a sync failure message,
    // clicking it copies the message instead of toggling sync.
    const current = (syncStatus.textContent || '').trim();
    if (/^sync failed/i.test(current) || /failed/i.test(current) || /error/i.test(current)) {
      const ok = await copyTextToClipboard(lastSyncErrorRaw || lastSyncStatusText || current);
      if (ok) {
        const prev = syncStatus.textContent;
        syncStatus.textContent = 'Copied';
        setTimeout(() => updateSyncStatus(prev), 1400);
      }
      return;
    }

    if (syncEnabled) {
      syncEnabled = false;
      await chrome.storage.local.set({ [STORAGE_SYNC_ENABLED_KEY]: false });
      updateSyncStatus();
      return;
    }

    // Enabling sync is optional; if no creds are present we prompt.
    const ok = await ensureCredsForNextcloud({ defaultEnableSync: true });
    if (ok) syncEnabled = true;
    await chrome.storage.local.set({ [STORAGE_SYNC_ENABLED_KEY]: syncEnabled });
    updateSyncStatus();
  });

  btnFetchRemote.addEventListener('click', async () => {
    // Retrieval requires creds, but syncing can remain off.
    const result = await ensureCredsForNextcloud({ defaultEnableSync: syncEnabled });
    if (!result) {
      // ensureCredsForNextcloud returns only when syncEnabled ends up on; for fetch we might still proceed after connection.
      // If credentials were stored but sync is still off, we still want to fetch; so check creds again.
      await refreshCredsAndSyncPref();
      if (!hasCreds) return;
    }
    await fetchRemoteNotes({ replaceLocal: false });
  });

  // ── Helpers ──────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function manualSave() {
    if (!currentNoteId) return;
    clearTimeout(saveTimer);
    clearTimeout(remoteSaveTimer);

    saveStatus.textContent = 'Saving…';
    saveStatus.classList.add('visible');

    await saveCurrentNote();
    saveStatus.textContent = 'Saved';
    setTimeout(() => saveStatus.classList.remove('visible'), 1200);

    // If sync is enabled, push immediately.
    if (syncEnabled && hasCreds) {
      updateSyncStatus('Syncing…');
      await syncNoteToNextcloud(currentNoteId);
    } else {
      updateSyncStatus();
    }
  }

  function formatSyncError(resp) {
    const err = resp && typeof resp.error !== 'undefined' ? resp.error : '';
    if (!err) return '';

    const raw = typeof err === 'string' ? err : JSON.stringify(err);
    const compact = raw.replace(/\s+/g, ' ').trim();

    // If Nextcloud returns the current note JSON on HTTP 412, translate it into a concise message.
    // The payload typically looks like: { id, title, modified, internalPath, etag, readonly, ... }
    if (compact.startsWith('{') && compact.endsWith('}')) {
      try {
        const obj = JSON.parse(compact);
        if (obj && typeof obj === 'object' && obj.etag && obj.internalPath) {
          const serverTag = obj.etag ? String(obj.etag) : 'unknown';
          const title = obj.title ? String(obj.title) : '';
          return ': 412 Precondition Failed (remote note changed).' + (title ? ' Note: ' + title : '') + ' Server etag: ' + serverTag;
        }
      } catch {
        // Fall through to truncation
      }
    }

    if (compact.length > 220) return ': ' + compact.slice(0, 220) + '…';
    return ': ' + compact;
  }

  async function copyTextToClipboard(text) {
    const value = String(text || '');
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fallback for environments where Clipboard API is blocked.
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }

  function escapeAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Init ────────────────────────────────────────────────────────────
  async function init() {
    loadTheme();
    await loadAccentColor();
    await loadNotes();
    await refreshCredsAndSyncPref();
    renderList();
    showView('list');
    updateSyncStatus();

    // If we have stored credentials, automatically retrieve existing notes.
    // (Uploading local changes still depends on the user's sync toggle.)
    if (hasCreds) {
      await fetchRemoteNotes({ replaceLocal: false });
    }
  }

  init();
})();

