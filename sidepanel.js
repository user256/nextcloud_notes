(() => {
  // ── State ──────────────────────────────────────────────────────────
  let notes = [];
  let currentNoteId = null;
  let saveTimer = null;
  let remoteSaveTimer = null;
  let isPreview = false;
  let searchQuery = '';
  let categoryFilter = 'all';

  let syncEnabled = false;
  let hasCreds = false;
  let lastSyncStatusText = '';
  let lastSyncErrorRaw = '';
  let categoryModalValue = '';
  let activeTagFilters = [];
  let importPendingFiles = [];

  // ── DOM refs ────────────────────────────────────────────────────────
  const html = document.documentElement;
  const viewList = document.getElementById('view-list');
  const viewEditor = document.getElementById('view-editor');
  const viewSettings = document.getElementById('view-settings');
  const notesList = document.getElementById('notes-list');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const categorySelect = document.getElementById('category-select');
  const noteTitle = document.getElementById('note-title');
  const noteEditor = document.getElementById('note-editor');
  const notePreview = document.getElementById('note-preview');
  const wordCount = document.getElementById('word-count');
  const saveStatus = document.getElementById('save-status');
  const syncStatus = document.getElementById('sync-status');
  const noteCategorySelect = document.getElementById('note-category-select');
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

  const categoryOverlay = document.getElementById('category-overlay');
  const categoryBubbles = document.getElementById('category-bubbles');
  const categoryInput = document.getElementById('category-input');
  const btnCategoryApply = document.getElementById('btn-category-apply');
  const btnCategoryClear = document.getElementById('btn-category-clear');
  const btnCategoryCancel = document.getElementById('btn-category-cancel');

  const tagSuggestions = document.getElementById('tag-suggestions');
  const activeFiltersEl = document.getElementById('active-filters');
  const noteCountEl = document.getElementById('note-count');
  const tagsList = document.getElementById('tags-list');
  const tagInput = document.getElementById('tag-input');

  const btnSettingsBack = document.getElementById('btn-settings-back');
  const settingsUrl = document.getElementById('settings-url');
  const settingsUsername = document.getElementById('settings-username');
  const settingsPassword = document.getElementById('settings-password');
  const settingsEnableSync = document.getElementById('settings-enable-sync');
  const settingsNcStatus = document.getElementById('settings-nc-status');
  const btnSettingsSave = document.getElementById('btn-settings-save');
  const btnSettingsTest = document.getElementById('btn-settings-test');
  const btnSettingsTheme = document.getElementById('btn-settings-theme');

  // ── Storage keys ────────────────────────────────────────────────────
  const STORAGE_NOTES_KEY = 'nn_notes';
  const STORAGE_SYNC_ENABLED_KEY = 'nn_sync_enabled';
  const STORAGE_ACCENT_KEY = 'nn_accent';
  const STORAGE_PREFS_KEY = 'nn_prefs';
  const STORAGE_CATEGORY_FILTER_KEY = 'nn_category_filter';
  const CATEGORY_EMPTY_VALUE = '__empty__';

  const PREFS_DEFAULTS = {
    editorFont: 'JetBrains Mono',
    previewFont: 'DM Sans',
    editorSize: 12,
    previewSize: 13,
    editorColor: null,
    previewColor: null
  };
  let editorPrefs = { ...PREFS_DEFAULTS };

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
    syncAppearanceColorPickersToTheme();
    updateAppearancePreviewDemo();
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
    if (changes[STORAGE_ACCENT_KEY]) {
      setAccentColor(changes[STORAGE_ACCENT_KEY].newValue);
    }
    if (changes[STORAGE_PREFS_KEY]) {
      editorPrefs = { ...PREFS_DEFAULTS, ...(changes[STORAGE_PREFS_KEY].newValue || {}) };
      applyEditorPrefs();
      updateAppearancePreviewDemo();
    }
  });

  function applyEditorPrefs() {
    const root = html.style;
    root.setProperty('--user-editor-font', '\'' + editorPrefs.editorFont + '\', monospace');
    root.setProperty('--user-preview-font', '\'' + editorPrefs.previewFont + '\', sans-serif');
    root.setProperty('--user-editor-size', editorPrefs.editorSize + 'px');
    root.setProperty('--user-preview-size', editorPrefs.previewSize + 'px');
    if (editorPrefs.editorColor) {
      root.setProperty('--user-editor-color', editorPrefs.editorColor);
    } else {
      root.removeProperty('--user-editor-color');
    }
    if (editorPrefs.previewColor) {
      root.setProperty('--user-preview-color', editorPrefs.previewColor);
    } else {
      root.removeProperty('--user-preview-color');
    }
  }

  async function loadEditorPrefs() {
    const r = await chrome.storage.local.get([STORAGE_PREFS_KEY]);
    editorPrefs = { ...PREFS_DEFAULTS, ...(r[STORAGE_PREFS_KEY] || {}) };
    applyEditorPrefs();
  }

  function slugify(s) {
    return String(s || '').replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'note';
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'settings-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function syncAppearanceColorPickersToTheme() {
    const theme = html.getAttribute('data-theme') || 'dark';
    const oec = document.getElementById('opt-editor-color');
    const opc = document.getElementById('opt-preview-color');
    if (oec && !editorPrefs.editorColor) {
      oec.value = theme === 'dark' ? '#e8e8ee' : '#1a1916';
    }
    if (opc && !editorPrefs.previewColor) {
      opc.value = theme === 'dark' ? '#e8e8ee' : '#1a1916';
    }
  }

  function updateAppearancePreviewDemo() {
    const demo = document.getElementById('options-preview-demo');
    if (!demo) return;
    const theme = html.getAttribute('data-theme') || 'dark';
    const pc = editorPrefs.previewColor || (theme === 'dark' ? '#e8e8ee' : '#1a1916');
    demo.style.fontFamily = '\'' + editorPrefs.previewFont + '\', sans-serif';
    demo.style.fontSize = editorPrefs.previewSize + 'px';
    demo.style.color = pc;
  }

  function persistEditorPrefs() {
    return chrome.storage.local.set({ [STORAGE_PREFS_KEY]: editorPrefs });
  }

  async function populateAppearanceForm() {
    const r = await chrome.storage.local.get([STORAGE_PREFS_KEY, STORAGE_ACCENT_KEY]);
    editorPrefs = { ...PREFS_DEFAULTS, ...(r[STORAGE_PREFS_KEY] || {}) };
    applyEditorPrefs();
    const theme = html.getAttribute('data-theme') || 'dark';

    const ef = document.getElementById('opt-editor-font');
    if (ef) ef.value = editorPrefs.editorFont;
    const pf = document.getElementById('opt-preview-font');
    if (pf) pf.value = editorPrefs.previewFont;
    const es = document.getElementById('opt-editor-size');
    if (es) es.value = String(editorPrefs.editorSize);
    const esv = document.getElementById('opt-editor-size-val');
    if (esv) esv.textContent = editorPrefs.editorSize + 'px';
    const ps = document.getElementById('opt-preview-size');
    if (ps) ps.value = String(editorPrefs.previewSize);
    const psv = document.getElementById('opt-preview-size-val');
    if (psv) psv.textContent = editorPrefs.previewSize + 'px';

    const oac = document.getElementById('opt-accent-color');
    if (oac) oac.value = r[STORAGE_ACCENT_KEY] || '#0082C9';
    const oec = document.getElementById('opt-editor-color');
    if (oec) oec.value = editorPrefs.editorColor || (theme === 'dark' ? '#e8e8ee' : '#1a1916');
    const opc = document.getElementById('opt-preview-color');
    if (opc) opc.value = editorPrefs.previewColor || (theme === 'dark' ? '#e8e8ee' : '#1a1916');

    updateAppearancePreviewDemo();
  }

  function wireSettingsAppearanceAndData() {
    if (btnSettingsTheme) {
      btnSettingsTheme.addEventListener('click', () => toggleTheme());
    }

    const onPrefChange = () => {
      void persistEditorPrefs();
      applyEditorPrefs();
      updateAppearancePreviewDemo();
    };

    const ef = document.getElementById('opt-editor-font');
    if (ef) {
      ef.addEventListener('change', e => {
        editorPrefs.editorFont = e.target.value;
        onPrefChange();
      });
    }
    const pf = document.getElementById('opt-preview-font');
    if (pf) {
      pf.addEventListener('change', e => {
        editorPrefs.previewFont = e.target.value;
        onPrefChange();
      });
    }
    const es = document.getElementById('opt-editor-size');
    if (es) {
      es.addEventListener('input', e => {
        editorPrefs.editorSize = +e.target.value;
        const esv = document.getElementById('opt-editor-size-val');
        if (esv) esv.textContent = editorPrefs.editorSize + 'px';
        onPrefChange();
      });
    }
    const ps = document.getElementById('opt-preview-size');
    if (ps) {
      ps.addEventListener('input', e => {
        editorPrefs.previewSize = +e.target.value;
        const psv = document.getElementById('opt-preview-size-val');
        if (psv) psv.textContent = editorPrefs.previewSize + 'px';
        onPrefChange();
      });
    }
    const oec = document.getElementById('opt-editor-color');
    if (oec) {
      oec.addEventListener('input', e => {
        editorPrefs.editorColor = e.target.value;
        onPrefChange();
      });
    }
    const opc = document.getElementById('opt-preview-color');
    if (opc) {
      opc.addEventListener('input', e => {
        editorPrefs.previewColor = e.target.value;
        onPrefChange();
      });
    }
    const oac = document.getElementById('opt-accent-color');
    if (oac) {
      oac.addEventListener('input', e => {
        const hex = e.target.value;
        chrome.storage.local.set({ [STORAGE_ACCENT_KEY]: hex });
        setAccentColor(hex);
      });
    }

    document.querySelectorAll('#view-settings .btn-reset-color').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        const theme = html.getAttribute('data-theme') || 'dark';
        const val = theme === 'dark' ? btn.getAttribute('data-dark') : btn.getAttribute('data-light');
        const el = document.getElementById(target);
        if (!el || !val) return;
        el.value = val;
        if (target === 'opt-editor-color') editorPrefs.editorColor = null;
        if (target === 'opt-preview-color') editorPrefs.previewColor = null;
        if (target === 'opt-accent-color') {
          chrome.storage.local.set({ [STORAGE_ACCENT_KEY]: val });
          setAccentColor(val);
        } else {
          void persistEditorPrefs();
          applyEditorPrefs();
        }
        updateAppearancePreviewDemo();
      });
    });

    const btnResetPrefs = document.getElementById('btn-reset-prefs');
    if (btnResetPrefs) {
      btnResetPrefs.addEventListener('click', async () => {
        editorPrefs = { ...PREFS_DEFAULTS };
        await persistEditorPrefs();
        const defAccent = '#0082C9';
        await chrome.storage.local.set({ [STORAGE_ACCENT_KEY]: defAccent });
        setAccentColor(defAccent);
        syncAppearanceColorPickersToTheme();
        await populateAppearanceForm();
        toast('Typography and colours reset');
      });
    }

    const btnOpenImport = document.getElementById('btn-open-import');
    const btnOpenExport = document.getElementById('btn-open-export');
    if (btnOpenImport) btnOpenImport.addEventListener('click', () => openImportModal());
    if (btnOpenExport) btnOpenExport.addEventListener('click', () => openExportModal());

    const btnExportClose = document.getElementById('btn-export-close');
    const modalExport = document.getElementById('modal-export');
    if (btnExportClose && modalExport) {
      btnExportClose.addEventListener('click', () => {
        modalExport.classList.add('hidden');
        modalExport.setAttribute('aria-hidden', 'true');
      });
      modalExport.addEventListener('click', e => {
        if (e.target === modalExport) {
          modalExport.classList.add('hidden');
          modalExport.setAttribute('aria-hidden', 'true');
        }
      });
    }
    const btnExportSelectAll = document.getElementById('btn-export-select-all');
    const btnExportDeselect = document.getElementById('btn-export-deselect');
    const btnExportRun = document.getElementById('btn-export-run');
    if (btnExportSelectAll) {
      btnExportSelectAll.addEventListener('click', () => {
        document.querySelectorAll('#export-list input').forEach(cb => { cb.checked = true; });
        updateExportCount();
      });
    }
    if (btnExportDeselect) {
      btnExportDeselect.addEventListener('click', () => {
        document.querySelectorAll('#export-list input').forEach(cb => { cb.checked = false; });
        updateExportCount();
      });
    }
    if (btnExportRun) btnExportRun.addEventListener('click', () => void runExportFromModal());

    const btnImportClose = document.getElementById('btn-import-close');
    const modalImport = document.getElementById('modal-import');
    if (btnImportClose && modalImport) {
      btnImportClose.addEventListener('click', () => {
        modalImport.classList.add('hidden');
        modalImport.setAttribute('aria-hidden', 'true');
      });
      modalImport.addEventListener('click', e => {
        if (e.target === modalImport) {
          modalImport.classList.add('hidden');
          modalImport.setAttribute('aria-hidden', 'true');
        }
      });
    }
    const importInput = document.getElementById('import-file-input');
    if (importInput) importInput.addEventListener('change', e => handleImportFiles(e.target.files));
    const dropZone = document.getElementById('import-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleImportFiles(e.dataTransfer.files);
      });
    }
    const btnImportRun = document.getElementById('btn-import-run');
    if (btnImportRun) btnImportRun.addEventListener('click', () => void runImportFromModal());
  }

  function openExportModal() {
    const modal = document.getElementById('modal-export');
    const list = document.getElementById('export-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const sorted = [...notes].sort((a, b) => (b.updated || 0) - (a.updated || 0));
    sorted.forEach(note => {
      const item = document.createElement('div');
      item.className = 'modal-list-item';
      item.dataset.id = note.id;
      item.innerHTML =
        '<input type="checkbox" checked />' +
        '<span class="modal-list-item-title">' + escapeHtml(note.title || 'Untitled') + '</span>' +
        '<span class="modal-list-item-meta">' + formatDate(note.updated) + '</span>';
      const cb = item.querySelector('input');
      cb.addEventListener('change', updateExportCount);
      item.addEventListener('click', e => {
        if (e.target !== cb) {
          cb.checked = !cb.checked;
          updateExportCount();
        }
      });
      list.appendChild(item);
    });
    updateExportCount();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function updateExportCount() {
    const list = document.getElementById('export-list');
    const countEl = document.getElementById('export-selected-count');
    const runBtn = document.getElementById('btn-export-run');
    if (!list || !countEl || !runBtn) return;
    const checked = list.querySelectorAll('input:checked').length;
    countEl.textContent = checked + ' selected';
    runBtn.disabled = checked === 0;
  }

  async function runExportFromModal() {
    const list = document.getElementById('export-list');
    const modal = document.getElementById('modal-export');
    const anchor = document.getElementById('dl-anchor');
    if (!list || !modal || !anchor) return;
    const items = list.querySelectorAll('.modal-list-item');
    const selected = [];
    items.forEach(item => {
      if (item.querySelector('input').checked) {
        const note = notes.find(n => n.id === item.dataset.id);
        if (note) selected.push(note);
      }
    });
    if (selected.length === 0) return;

    if (selected.length === 1) {
      const note = selected[0];
      const content = (note.title ? '# ' + note.title + '\n\n' : '') + (note.content || '');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      anchor.href = url;
      anchor.download = slugify(note.title || 'note') + '.txt';
      anchor.click();
      URL.revokeObjectURL(url);
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      toast('Exported 1 note');
      return;
    }

    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();
      const usedNames = {};
      selected.forEach(note => {
        let name = slugify(note.title || 'note');
        if (usedNames[name]) {
          usedNames[name]++;
          name += '-' + usedNames[name];
        } else usedNames[name] = 1;
        const content = (note.title ? '# ' + note.title + '\n\n' : '') + (note.content || '');
        zip.file(name + '.txt', content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      anchor.href = url;
      anchor.download = 'nextcloud-notes-export.zip';
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      for (const note of selected) {
        const content = (note.title ? '# ' + note.title + '\n\n' : '') + (note.content || '');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        anchor.href = url;
        anchor.download = slugify(note.title || 'note') + '.txt';
        anchor.click();
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 150));
      }
    }

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    toast('Exported ' + selected.length + ' notes');
  }

  function openImportModal() {
    importPendingFiles = [];
    const list = document.getElementById('import-preview-list');
    const modal = document.getElementById('modal-import');
    const countEl = document.getElementById('import-file-count');
    const runBtn = document.getElementById('btn-import-run');
    const input = document.getElementById('import-file-input');
    if (!modal) return;
    if (list) {
      list.innerHTML = '';
      list.classList.add('hidden');
    }
    if (countEl) countEl.textContent = '';
    if (runBtn) runBtn.disabled = true;
    if (input) input.value = '';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function handleImportFiles(files) {
    importPendingFiles = [...files].filter(f => /\.(txt|md)$/i.test(f.name));
    const list = document.getElementById('import-preview-list');
    const countEl = document.getElementById('import-file-count');
    const runBtn = document.getElementById('btn-import-run');
    if (!list) return;
    list.innerHTML = '';
    if (importPendingFiles.length === 0) {
      if (countEl) countEl.textContent = 'No .txt or .md files selected';
      if (runBtn) runBtn.disabled = true;
      list.classList.add('hidden');
      return;
    }
    importPendingFiles.forEach(file => {
      const item = document.createElement('div');
      item.className = 'modal-list-item';
      item.style.cursor = 'default';
      item.innerHTML =
        '<span class="modal-list-item-title">' + escapeHtml(file.name) + '</span>' +
        '<span class="modal-list-item-meta">' + (file.size / 1024).toFixed(1) + ' KB</span>';
      list.appendChild(item);
    });
    list.classList.remove('hidden');
    if (countEl) {
      countEl.textContent =
        importPendingFiles.length + ' file' + (importPendingFiles.length !== 1 ? 's' : '') + ' ready';
    }
    if (runBtn) runBtn.disabled = false;
  }

  async function runImportFromModal() {
    if (importPendingFiles.length === 0) return;
    const modal = document.getElementById('modal-import');
    let imported = 0;
    for (const file of importPendingFiles) {
      const text = await file.text();
      const h1Match = text.match(/^#\s+(.+)/m);
      const title = h1Match ? h1Match[1].trim() : file.name.replace(/\.(txt|md)$/i, '');
      const content = h1Match ? text.replace(/^#\s+.+\n?/, '').trim() : text;
      const note = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + imported,
        title,
        content,
        category: '',
        tags: [],
        created: Date.now(),
        updated: Date.now(),
        remote: null
      };
      notes.unshift(note);
      imported++;
    }
    await saveNotes();
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    toast('Imported ' + imported + ' note' + (imported !== 1 ? 's' : ''));
    importPendingFiles = [];
    buildCategoryOptions();
    buildNoteCategoryDropdownOptions();
    renderActiveFilters();
    renderList();
  }

  if (btnSettings) btnSettings.addEventListener('click', () => void openSettingsView());

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

  // ── In-panel settings (Nextcloud) ─────────────────────────────────
  async function populateSettingsForm() {
    await refreshCredsAndSyncPref();
    const data = await chrome.storage.sync.get(['url', 'username', 'password']);
    if (settingsUrl) settingsUrl.value = (data.url || '').trim().replace(/\/$/, '');
    if (settingsUsername) settingsUsername.value = (data.username || '').trim();
    if (settingsPassword) settingsPassword.value = (data.password || '').trim();
    if (settingsEnableSync) {
      const pref = await chrome.storage.local.get([STORAGE_SYNC_ENABLED_KEY]);
      const stored = pref[STORAGE_SYNC_ENABLED_KEY];
      if (typeof stored === 'boolean') {
        settingsEnableSync.checked = stored;
      } else {
        settingsEnableSync.checked = !!hasCreds;
      }
    }
    if (settingsNcStatus) {
      settingsNcStatus.textContent = '';
      settingsNcStatus.className = 'settings-status';
    }
  }

  async function openSettingsView() {
    await populateSettingsForm();
    await populateAppearanceForm();
    showView('settings');
  }

  function setSettingsStatus(msg, kind) {
    if (!settingsNcStatus) return;
    settingsNcStatus.textContent = msg || '';
    settingsNcStatus.className = 'settings-status' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
  }

  async function saveSettingsConnection() {
    const url = settingsUrl ? (settingsUrl.value || '').trim().replace(/\/$/, '') : '';
    const username = settingsUsername ? (settingsUsername.value || '').trim() : '';
    const password = settingsPassword ? (settingsPassword.value || '').trim() : '';
    await chrome.storage.sync.set({ url, username, password });
    await refreshCredsAndSyncPref();
    if (url && username && password) {
      setSettingsStatus('Saved.', 'ok');
    } else {
      setSettingsStatus('Saved. Add URL and credentials to enable cloud sync.', '');
    }
    updateSyncStatus();
  }

  async function testSettingsConnection() {
    const url = settingsUrl ? (settingsUrl.value || '').trim().replace(/\/$/, '') : '';
    const username = settingsUsername ? (settingsUsername.value || '').trim() : '';
    const password = settingsPassword ? (settingsPassword.value || '').trim() : '';
    if (!url || !username || !password) {
      setSettingsStatus('Fill server URL, username, and password first.', 'err');
      return;
    }
    await chrome.storage.sync.set({ url, username, password });
    updateSyncStatus('Connecting…');
    const resp = await sendNcMessage('ncFetchNotes', { chunkSize: 1 });
    await refreshCredsAndSyncPref();
    updateSyncStatus();
    if (resp && resp.ok) {
      setSettingsStatus('Connection OK.', 'ok');
    } else {
      let detail =
        resp && typeof resp.error !== 'undefined'
          ? typeof resp.error === 'string'
            ? resp.error
            : JSON.stringify(resp.error)
          : 'Connection failed.';
      if (detail.length > 220) detail = detail.slice(0, 220) + '…';
      setSettingsStatus(detail, 'err');
    }
  }

  if (btnSettingsBack) {
    btnSettingsBack.addEventListener('click', () => showView('list'));
  }
  if (btnSettingsSave) {
    btnSettingsSave.addEventListener('click', () => void saveSettingsConnection());
  }
  if (btnSettingsTest) {
    btnSettingsTest.addEventListener('click', () => void testSettingsConnection());
  }
  if (settingsEnableSync) {
    settingsEnableSync.addEventListener('change', async () => {
      await chrome.storage.local.set({ [STORAGE_SYNC_ENABLED_KEY]: settingsEnableSync.checked });
      await refreshCredsAndSyncPref();
      updateSyncStatus();
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
      category: '',
      tags: [],
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

  function getNoteCategory(note) {
    if (!note) return '';
    if (typeof note.category === 'string') return note.category;
    if (note.remote && typeof note.remote.category === 'string') return note.remote.category;
    return '';
  }

  function buildCategoryOptions() {
    if (!categorySelect) return;

    const cats = new Set();
    let hasEmpty = false;

    notes.forEach(n => {
      const c = getNoteCategory(n);
      if (c) cats.add(c);
      else hasEmpty = true;
    });

    const sorted = [...cats].sort((a, b) => a.localeCompare(b));

    const prev = categoryFilter;

    categorySelect.innerHTML = '';

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'All';
    categorySelect.appendChild(optAll);

    if (hasEmpty) {
      const optEmpty = document.createElement('option');
      optEmpty.value = CATEGORY_EMPTY_VALUE;
      optEmpty.textContent = 'Uncategorized';
      categorySelect.appendChild(optEmpty);
    }

    sorted.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      categorySelect.appendChild(opt);
    });

    // Restore selection if still present, otherwise fall back to "All".
    if (prev === 'all') categoryFilter = 'all';
    if (prev !== 'all') {
      const stillExists =
        prev === CATEGORY_EMPTY_VALUE ||
        [...cats].some(x => x === prev);
      categoryFilter = stillExists ? prev : 'all';
    }

    categorySelect.value = categoryFilter;
  }

  function buildNoteCategoryDropdownOptions() {
    if (!noteCategorySelect) return;

    const cats = new Set();
    let hasEmpty = false;

    notes.forEach(n => {
      const c = getNoteCategory(n);
      if (c) cats.add(c);
      else hasEmpty = true;
    });

    // Always include the current note's category even if it's the only one.
    const current = currentNoteId ? getNoteById(currentNoteId) : null;
    const currentCat = current ? getNoteCategory(current) : '';
    const currentIsEmpty = !currentCat;
    if (currentIsEmpty) hasEmpty = true;
    if (!currentIsEmpty && currentCat) cats.add(currentCat);

    const sorted = [...cats].sort((a, b) => a.localeCompare(b));

    const currentValue = currentIsEmpty ? '__empty__' : currentCat || '__empty__';

    noteCategorySelect.innerHTML = '';

    if (hasEmpty) {
      const optEmpty = document.createElement('option');
      optEmpty.value = '__empty__';
      optEmpty.textContent = 'Uncategorized';
      noteCategorySelect.appendChild(optEmpty);
    }

    sorted.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      noteCategorySelect.appendChild(opt);
    });

    const optCustom = document.createElement('option');
    optCustom.value = '__custom__';
    optCustom.textContent = 'Custom…';
    noteCategorySelect.appendChild(optCustom);

    noteCategorySelect.value = currentValue;
    updateNoteCategorySelectAppearance();
  }

  function updateNoteCategorySelectAppearance() {
    if (!noteCategorySelect) return;
    const note = currentNoteId ? getNoteById(currentNoteId) : null;
    const cat = note ? getNoteCategory(note) : '';
    const hasCat = !!(cat && String(cat).trim());
    noteCategorySelect.classList.toggle('has-category', hasCat);
  }

  // ── Tags (local-only metadata; not synced to Nextcloud) ─────────────
  function getAllTags() {
    const set = new Set();
    notes.forEach(n => (n.tags || []).forEach(t => set.add(t)));
    return [...set].sort();
  }

  function renderActiveFilters() {
    if (!activeFiltersEl) return;
    activeFiltersEl.innerHTML = '';
    if (activeTagFilters.length === 0) {
      activeFiltersEl.classList.add('hidden');
      return;
    }
    activeFiltersEl.classList.remove('hidden');
    activeTagFilters.forEach(tag => {
      const chip = document.createElement('div');
      chip.className = 'filter-tag';
      chip.innerHTML = '#' + escapeHtml(tag) + ' <button type="button" title="Remove filter">&times;</button>';
      chip.querySelector('button').addEventListener('click', () => {
        activeTagFilters = activeTagFilters.filter(t => t !== tag);
        renderActiveFilters();
        renderList();
      });
      activeFiltersEl.appendChild(chip);
    });
  }

  function buildTagSuggestions(rawQuery) {
    if (!tagSuggestions) return;
    const q = (rawQuery || '').trim();
    if (!q.startsWith('#') && q.length < 1) {
      tagSuggestions.classList.add('hidden');
      return;
    }
    const needle = q.startsWith('#') ? q.slice(1) : q;
    const allTags = getAllTags();
    const matches = allTags.filter(t => t.toLowerCase().includes(needle.toLowerCase()));
    if (matches.length === 0) {
      tagSuggestions.classList.add('hidden');
      return;
    }
    tagSuggestions.innerHTML = '';
    matches.forEach(tag => {
      const item = document.createElement('div');
      item.className = 'tag-suggestion-item';
      const count = notes.filter(n => (n.tags || []).includes(tag)).length;
      item.innerHTML = '<span>#</span>' + escapeHtml(tag) + ' <span style="margin-left:auto;opacity:0.5">' + count + '</span>';
      item.addEventListener('click', () => {
        if (!activeTagFilters.includes(tag)) activeTagFilters.push(tag);
        renderActiveFilters();
        searchInput.value = '';
        searchQuery = '';
        tagSuggestions.classList.add('hidden');
        renderList();
      });
      tagSuggestions.appendChild(item);
    });
    tagSuggestions.classList.remove('hidden');
  }

  function renderTagChips(tags) {
    if (!tagsList) return;
    tagsList.innerHTML = '';
    const note = currentNoteId ? getNoteById(currentNoteId) : null;
    const readOnly = !!(note && note.remote && note.remote.readonly);
    (tags || []).forEach(tag => {
      const chip = document.createElement('div');
      chip.className = 'tag-chip';
      if (readOnly) {
        chip.textContent = '#' + tag;
      } else {
        chip.innerHTML = '#' + escapeHtml(tag) + ' <button type="button" title="Remove tag">&times;</button>';
        chip.querySelector('button').addEventListener('click', () => {
          const n = getNoteById(currentNoteId);
          if (!n) return;
          n.tags = (n.tags || []).filter(t => t !== tag);
          renderTagChips(n.tags);
          debouncedSave();
        });
      }
      tagsList.appendChild(chip);
    });
  }

  // ── Render list ────────────────────────────────────────────────────
  function renderList() {
    const q = searchQuery;
    const filtered = notes.filter(n => {
      const noteCat = getNoteCategory(n);
      const passCategory =
        categoryFilter === 'all'
          ? true
          : categoryFilter === CATEGORY_EMPTY_VALUE
            ? !noteCat
            : noteCat === categoryFilter;

      if (!passCategory) return false;

      if (activeTagFilters.length > 0) {
        const tgs = n.tags || [];
        if (!activeTagFilters.every(ft => tgs.includes(ft))) return false;
      }

      if (!q) return true;
      const qq = q.replace(/^#/, '');
      const title = (n.title || '').toLowerCase();
      const content = (n.content || '').toLowerCase();
      return (
        title.includes(qq) ||
        content.includes(qq) ||
        (n.tags || []).some(t => t.toLowerCase().includes(qq))
      );
    });

    const sorted = [...filtered].sort((a, b) => b.updated - a.updated);
    const total = notes.length;

    if (noteCountEl) {
      noteCountEl.textContent =
        total === 0
          ? ''
          : sorted.length === total
            ? total + ' note' + (total !== 1 ? 's' : '')
            : sorted.length + ' of ' + total;
    }

    notesList.innerHTML = '';

    if (sorted.length === 0) {
      const noFilters =
        !searchQuery && categoryFilter === 'all' && activeTagFilters.length === 0;
      if (noFilters) {
        notesList.appendChild(emptyState);
        emptyState.style.display = 'flex';
      } else {
        const label =
          categoryFilter === CATEGORY_EMPTY_VALUE
            ? 'Uncategorized'
            : categoryFilter;
        let byCategoryText =
          categoryFilter === 'all' ? 'No results found' : 'No notes found in ' + label;
        if (activeTagFilters.length) {
          byCategoryText += ' (tags: ' + activeTagFilters.map(t => '#' + t).join(', ') + ')';
        }
        const bySearchText = byCategoryText + (searchQuery ? ' for "' + searchQuery + '"' : '');
        notesList.innerHTML =
          '<div class="empty-state">' +
            '<svg width="36" height="36" viewBox="0 0 36 36" fill="none" class="empty-pad-icon">' +
              '<rect x="5" y="7" width="26" height="25" rx="3" stroke="var(--border2)" stroke-width="1.8"/>' +
              '<circle cx="12" cy="7" r="2.5" fill="var(--bg)" stroke="var(--border2)" stroke-width="1.5"/>' +
              '<circle cx="18" cy="7" r="2.5" fill="var(--bg)" stroke="var(--border2)" stroke-width="1.5"/>' +
              '<circle cx="24" cy="7" r="2.5" fill="var(--bg)" stroke="var(--border2)" stroke-width="1.5"/>' +
              '<line x1="10" y1="17" x2="26" y2="17" stroke="var(--border2)" stroke-width="1.5" stroke-linecap="round"/>' +
              '<line x1="10" y1="22" x2="26" y2="22" stroke="var(--border2)" stroke-width="1.5" stroke-linecap="round"/>' +
              '<line x1="10" y1="27" x2="20" y2="27" stroke="var(--border2)" stroke-width="1.5" stroke-linecap="round"/>' +
            '</svg>' +
            '<p>' + escapeHtml(bySearchText) + '</p>' +
          '</div>';
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
      const noteCat = getNoteCategory(note);
      const tagList = note.tags || [];
      const tagPills = tagList
        .map(t => '<span class="note-tag-pill" data-tag="' + escapeAttr(t) + '">#' + escapeHtml(t) + '</span>')
        .join('');

      const remoteTag = syncEnabled && note.remote ? (isReadonlyRemote ? ' (read-only)' : '') : '';

      item.innerHTML =
        '<div class="note-item-click">' +
          '<svg class="note-item-icon" width="14" height="14" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<path d="M20 0h88c11 0 20 9 20 20v88c0 11-9 20-20 20H20c-11 0-20-9-20-20V20C0 9 9 0 20 0" style="fill:#0082c9"/>' +
            '<path d="M15 94.2V115h20.8l61.4-61.4-20.8-20.9zm98.4-56.7c2.2-2.2 2.2-5.7 0-7.8l-13-13c-2.2-2.2-5.7-2.2-7.8 0L82.4 26.8l20.8 20.8z" style="fill:#fff"/>' +
          '</svg>' +
          '<div class="note-item-body">' +
            '<div class="note-item-title">' + escapeHtml(title + remoteTag) + '</div>' +
            (preview ? '<div class="note-item-preview">' + escapeHtml(preview) + '</div>' : '') +
            '<div class="note-item-meta">' +
              '<span class="note-item-date">' + formatDate(note.updated) + '</span>' +
              (noteCat ? '<span class="note-item-category">' + escapeHtml(noteCat) + '</span>' : '') +
              (tagPills ? '<div class="note-item-tags">' + tagPills + '</div>' : '') +
            '</div>' +
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
      item.querySelectorAll('.note-tag-pill').forEach(pill => {
        pill.addEventListener('click', e => {
          e.stopPropagation();
          const tag = pill.getAttribute('data-tag') || '';
          if (!tag || activeTagFilters.includes(tag)) return;
          activeTagFilters.push(tag);
          renderActiveFilters();
          renderList();
        });
      });

      notesList.appendChild(item);
    });
  }

  // ── Views ────────────────────────────────────────────────────────────
  function showView(name) {
    viewList.classList.toggle('active', name === 'list');
    viewEditor.classList.toggle('active', name === 'editor');
    if (viewSettings) viewSettings.classList.toggle('active', name === 'settings');
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

    if (noteCategorySelect) {
      const cat = getNoteCategory(note);
      const value = cat ? cat : '__empty__';
      noteCategorySelect.value = value;
      noteCategorySelect.disabled = isReadonlyRemote;
      updateNoteCategorySelectAppearance();
    }

    if (!note.tags) note.tags = [];
    renderTagChips(note.tags);
    if (tagInput) {
      tagInput.value = '';
      tagInput.disabled = isReadonlyRemote;
    }

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
    renderTagChips([]);
    if (tagInput) {
      tagInput.value = '';
      tagInput.disabled = false;
    }
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

  function openCategoryModal() {
    if (!currentNoteId) return;
    const note = getNoteById(currentNoteId);
    if (!note) return;
    const isRemoteReadOnly = !!(note.remote && note.remote.readonly);

    if (noteCategorySelect) {
      noteCategorySelect.disabled = isRemoteReadOnly;
    }

    categoryModalValue = getNoteCategory(note);
    if (categoryInput) categoryInput.value = categoryModalValue;

    if (btnCategoryApply) btnCategoryApply.disabled = isRemoteReadOnly;
    if (categoryInput) categoryInput.disabled = isRemoteReadOnly;

    // Build bubbles (tag cloud) from current notes.
    if (categoryBubbles) {
      const cats = new Set();
      let hasEmpty = false;
      notes.forEach(n => {
        const c = getNoteCategory(n);
        if (c) cats.add(c);
        else hasEmpty = true;
      });

      const sorted = [...cats].sort((a, b) => a.localeCompare(b));
      categoryBubbles.innerHTML = '';

      const makeBubble = (val, label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cat-bubble';
        if (val === '') b.dataset.catValue = CATEGORY_EMPTY_VALUE;
        else b.dataset.catValue = val;
        b.textContent = label;
        if (label.toLowerCase() === 'uncategorized') {
          // no-op; bubble value stored in dataset
        }
        // active state
        const active = (val === '' && categoryModalValue === '') || (val !== '' && categoryModalValue === val);
        if (active) b.classList.add('active');
        b.addEventListener('click', () => {
          // Selecting a bubble updates input but does not apply until Apply.
          if (val === '') {
            categoryModalValue = '';
            if (categoryInput) categoryInput.value = '';
          } else {
            categoryModalValue = val;
            if (categoryInput) categoryInput.value = val;
          }
          // Update active bubble styles without rebuilding the whole list.
          if (categoryBubbles) {
            Array.from(categoryBubbles.querySelectorAll('.cat-bubble')).forEach(el => {
              const ds = el.dataset && el.dataset.catValue ? el.dataset.catValue : '';
              const effective = ds === CATEGORY_EMPTY_VALUE ? '' : ds;
              el.classList.toggle('active', effective === categoryModalValue);
            });
          }
        });
        return b;
      };

      if (hasEmpty) categoryBubbles.appendChild(makeBubble('', 'Uncategorized'));
      sorted.forEach(c => categoryBubbles.appendChild(makeBubble(c, c)));
    }

    if (categoryOverlay) categoryOverlay.style.display = 'flex';
  }

  function closeCategoryModal() {
    if (categoryOverlay) categoryOverlay.style.display = 'none';
    if (noteCategorySelect && currentNoteId) {
      const note = getNoteById(currentNoteId);
      const isRemoteReadOnly = !!(note && note.remote && note.remote.readonly);
      noteCategorySelect.disabled = isRemoteReadOnly;
    }
  }

  async function applyCategoryChange() {
    if (!currentNoteId) return;
    const note = getNoteById(currentNoteId);
    if (!note) return;

    const isRemoteReadOnly = !!(note.remote && note.remote.readonly);
    if (isRemoteReadOnly) {
      closeCategoryModal();
      return;
    }

    const raw = categoryInput ? categoryInput.value : '';
    const newCategory = (raw || '').trim();
    const finalCategory = newCategory ? newCategory : '';

    note.category = finalCategory;
    if (note.remote) {
      note.remote.category = finalCategory;
    }
    note.updated = Date.now();

    await saveNotes();
    buildCategoryOptions();
    buildNoteCategoryDropdownOptions();
    if (noteCategorySelect) {
      noteCategorySelect.value = finalCategory ? finalCategory : '__empty__';
    }
    renderList();

    closeCategoryModal();

    if (syncEnabled && hasCreds) {
      await syncNoteToNextcloud(currentNoteId);
    }
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
      category: remote.category || '',
      tags: [],
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
      const resp = await sendNcMessage('ncCreateNote', { title: note.title, content: note.content, category: note.category || '' });
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
        note.category = created.category || '';
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

      console.error('[Nextcloud Notes] Create failed:', syncFailureDetail(resp) || '(no detail)', resp);
      lastSyncErrorRaw = syncFailureDetail(resp);
      updateSyncStatus('Sync failed' + formatSyncError(resp));
      return;
    }

    const resp = await sendNcMessage('ncUpdateNote', {
      noteId: note.remote.id,
      title: note.title,
      content: note.content,
      etag: note.remote.etag,
      category: note.category || ''
    });

    if (resp && resp.ok) {
      const updated = resp.note;
      note.remote.etag = updated.etag || note.remote.etag;
      note.remote.readonly = !!updated.readonly;
      note.updated = (updated.modified ? updated.modified * 1000 : Date.now());
      note.remote.modified = updated.modified || note.remote.modified;
      note.remote.category = updated.category || note.remote.category;
      note.remote.favorite = !!updated.favorite;
      note.category = updated.category || note.category || '';
      await saveNotes();
      updateSyncStatus();
      return;
    }

    if (resp && resp.code === 'NO_CREDS') {
      await refreshCredsAndSyncPref();
      updateSyncStatus();
      return;
    }

    console.error('[Nextcloud Notes] Update failed:', syncFailureDetail(resp) || '(no detail)', { noteId, resp });
    lastSyncErrorRaw = syncFailureDetail(resp);
    updateSyncStatus('Sync failed' + formatSyncError(resp));
  }

  async function fetchRemoteNotes({ replaceLocal = false } = {}) {
    updateSyncStatus('Fetching…');
    const resp = await sendNcMessage('ncFetchNotes', { chunkSize: 0 });
    if (!resp || !resp.ok) {
      console.error('[Nextcloud Notes] Fetch failed:', syncFailureDetail(resp) || '(no detail)', resp);
      lastSyncErrorRaw = syncFailureDetail(resp);
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
          const keepTags = existing.tags || [];
          existing.title = rn.title;
          existing.content = rn.content;
          existing.updated = rn.updated;
          existing.remote = rn.remote;
          existing.category = rn.category || '';
          existing.tags = keepTags;
        } else {
          notes.unshift(rn);
        }
      });
    }

    await saveNotes();
    buildCategoryOptions();
    buildNoteCategoryDropdownOptions();
    updateNoteCategorySelectAppearance();
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
    buildTagSuggestions(searchInput.value.trim());
    renderList();
  });
  searchInput.addEventListener('blur', function() {
    setTimeout(function() {
      if (tagSuggestions) tagSuggestions.classList.add('hidden');
    }, 200);
  });

  if (tagInput) {
    tagInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const raw = tagInput.value.replace(/[,#\s]+/g, ' ').trim();
        if (!raw) return;
        const tag = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        if (!tag) return;
        const note = getNoteById(currentNoteId);
        if (!note || (note.remote && note.remote.readonly)) return;
        note.tags = note.tags || [];
        if (!note.tags.includes(tag)) {
          note.tags.push(tag);
          renderTagChips(note.tags);
          debouncedSave();
        }
        tagInput.value = '';
      }
      if (e.key === 'Backspace' && tagInput.value === '') {
        const note = getNoteById(currentNoteId);
        if (note && note.tags && note.tags.length > 0 && !(note.remote && note.remote.readonly)) {
          note.tags.pop();
          renderTagChips(note.tags);
          debouncedSave();
        }
      }
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener('change', async () => {
      categoryFilter = categorySelect.value;
      await chrome.storage.local.set({ [STORAGE_CATEGORY_FILTER_KEY]: categoryFilter });
      renderList();
    });
  }
  if (noteCategorySelect) {
    noteCategorySelect.addEventListener('change', async () => {
      if (!currentNoteId) return;
      const val = noteCategorySelect.value;

      if (val === '__custom__') {
        // Revert selection so the dropdown reflects the current note's real category.
        const note = getNoteById(currentNoteId);
        const cat = note ? getNoteCategory(note) : '';
        noteCategorySelect.value = cat ? cat : '__empty__';
        openCategoryModal();
        return;
      }

      const newCategory = val === '__empty__' ? '' : val;
      // Avoid redundant updates.
      const note = getNoteById(currentNoteId);
      const currentCategory = note ? getNoteCategory(note) : '';
      if (newCategory === currentCategory) {
        noteCategorySelect.value = newCategory ? newCategory : '__empty__';
        return;
      }

      // Apply immediately (local + optional sync).
      const isRemoteReadOnly = !!(note && note.remote && note.remote.readonly);
      if (isRemoteReadOnly) {
        const currentCat = note ? getNoteCategory(note) : '';
        noteCategorySelect.value = currentCat ? currentCat : '__empty__';
        return;
      }

      note.category = newCategory;
      if (note.remote) note.remote.category = newCategory;
      note.updated = Date.now();
      await saveNotes();

      buildCategoryOptions();
      buildNoteCategoryDropdownOptions();
      renderList();
      closeCategoryModal();

      if (syncEnabled && hasCreds) {
        await syncNoteToNextcloud(currentNoteId);
      }
    });
  }

  if (btnCategoryCancel) btnCategoryCancel.addEventListener('click', closeCategoryModal);
  if (btnCategoryClear) {
    btnCategoryClear.addEventListener('click', () => {
      categoryModalValue = '';
      if (categoryInput) categoryInput.value = '';
    });
  }
  if (btnCategoryApply) btnCategoryApply.addEventListener('click', async () => {
    await applyCategoryChange();
  });

  if (categoryInput) {
    categoryInput.addEventListener('input', () => {
      categoryModalValue = (categoryInput.value || '').trim();
      if (categoryModalValue === '') categoryModalValue = '';
    });
  }

  if (categoryOverlay) {
    categoryOverlay.addEventListener('click', e => {
      if (e.target === categoryOverlay) closeCategoryModal();
    });
  }

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

  /** Always a plain string (never [object Object] in UI / clipboard). */
  function syncErrorToPlainString(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  function syncFailureDetail(resp) {
    if (!resp) return '';
    const fromErr = syncErrorToPlainString(resp.error);
    if (fromErr) return fromErr;
    if (resp.status != null) return 'HTTP ' + resp.status;
    if (resp.code) return String(resp.code);
    return '';
  }

  function formatSyncError(resp) {
    if (!resp) return '';
    let err = typeof resp.error !== 'undefined' ? resp.error : '';
    const plain = syncErrorToPlainString(err);
    if (!plain) {
      if (resp.status != null) return ': HTTP ' + resp.status;
      if (resp.code) return ': ' + String(resp.code);
      return '';
    }

    const raw = typeof err === 'string' ? err : plain;
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
    await loadEditorPrefs();
    updateAppearancePreviewDemo();
    wireSettingsAppearanceAndData();
    await loadNotes();
    await refreshCredsAndSyncPref();

    const pref = await chrome.storage.local.get([STORAGE_CATEGORY_FILTER_KEY]);
    if (typeof pref[STORAGE_CATEGORY_FILTER_KEY] === 'string' && pref[STORAGE_CATEGORY_FILTER_KEY]) {
      categoryFilter = pref[STORAGE_CATEGORY_FILTER_KEY];
    }

    buildCategoryOptions();
    buildNoteCategoryDropdownOptions();
    renderActiveFilters();
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

