(() => {
  'use strict';

  const STORAGE_NOTES = 'nn_notes';
  const STORAGE_PREFS = 'nn_prefs';
  const STORAGE_ACCENT = 'nn_accent';

  const PREFS_DEFAULTS = {
    editorFont: 'JetBrains Mono',
    previewFont: 'DM Sans',
    editorSize: 12,
    previewSize: 13,
    editorColor: null,
    previewColor: null
  };

  let prefs = { ...PREFS_DEFAULTS };
  let notes = [];
  let importPendingFiles = [];

  const $ = id => document.getElementById(id);

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function slugify(s) {
    return String(s || '').replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'note';
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
    const to2 = n => String(Math.round(n)).padStart(2, '0');
    return '#' + to2(r) + to2(g) + to2(b);
  }

  function lightenRgb(rgb, factor) {
    return {
      r: Math.round(rgb.r + (255 - rgb.r) * factor),
      g: Math.round(rgb.g + (255 - rgb.g) * factor),
      b: Math.round(rgb.b + (255 - rgb.b) * factor)
    };
  }

  function setPageAccentFromHex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const accent2 = rgbToHex(lightenRgb(rgb, 0.35));
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent2', accent2);
  }

  async function loadTheme() {
    const { nn_theme: t } = await chrome.storage.local.get(['nn_theme']);
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  }

  function toggleOptionsTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    chrome.storage.local.set({ nn_theme: next });
    syncColorPickersToTheme(next);
    applyPrefsToUI();
  }

  function syncColorPickersToTheme(theme) {
    if (!prefs.editorColor) $('opt-editor-color').value = theme === 'dark' ? '#e8e8ee' : '#1a1916';
    if (!prefs.previewColor) $('opt-preview-color').value = theme === 'dark' ? '#e8e8ee' : '#1a1916';
  }

  async function loadPrefs() {
    const r = await chrome.storage.local.get([STORAGE_PREFS, STORAGE_ACCENT]);
    prefs = { ...PREFS_DEFAULTS, ...(r[STORAGE_PREFS] || {}) };
    const accent = r[STORAGE_ACCENT] || '#0082C9';
    $('opt-accent-color').value = accent;
    setPageAccentFromHex(accent);
  }

  function savePrefs() {
    chrome.storage.local.set({ [STORAGE_PREFS]: prefs });
  }

  function populatePrefsForm() {
    $('opt-editor-font').value = prefs.editorFont;
    $('opt-preview-font').value = prefs.previewFont;
    $('opt-editor-size').value = prefs.editorSize;
    $('opt-editor-size-val').textContent = prefs.editorSize + 'px';
    $('opt-preview-size').value = prefs.previewSize;
    $('opt-preview-size-val').textContent = prefs.previewSize + 'px';

    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    $('opt-editor-color').value = prefs.editorColor || (theme === 'dark' ? '#e8e8ee' : '#1a1916');
    $('opt-preview-color').value = prefs.previewColor || (theme === 'dark' ? '#e8e8ee' : '#1a1916');
    applyPrefsToUI();
  }

  function applyPrefsToUI() {
    const demo = $('options-preview-demo');
    if (!demo) return;
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const ec = prefs.editorColor || (theme === 'dark' ? '#e8e8ee' : '#1a1916');
    const pc = prefs.previewColor || (theme === 'dark' ? '#e8e8ee' : '#1a1916');
    demo.style.fontFamily = `'${prefs.previewFont}', sans-serif`;
    demo.style.fontSize = prefs.previewSize + 'px';
    demo.style.color = pc;
    // Show editor font/size in a small line? Optional — preview uses preview font only.
    document.documentElement.style.setProperty('--user-preview-font', `'${prefs.previewFont}', sans-serif`);
    document.documentElement.style.setProperty('--user-preview-size', prefs.previewSize + 'px');
    document.documentElement.style.setProperty('--user-preview-color', pc);
  }

  async function loadNotesForModals() {
    const r = await chrome.storage.local.get([STORAGE_NOTES]);
    notes = Array.isArray(r[STORAGE_NOTES]) ? r[STORAGE_NOTES] : [];
  }

  // ── Nextcloud form ────────────────────────────────────────────────
  async function initNextcloudForm() {
    const form = $('settingsForm');
    const urlInput = $('url');
    const usernameInput = $('username');
    const passwordInput = $('password');
    const status = $('status');

    const data = await chrome.storage.sync.get(['url', 'username', 'password']);
    if (data.url) urlInput.value = data.url;
    if (data.username) usernameInput.value = data.username;
    if (data.password) passwordInput.value = data.password;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const url = urlInput.value.trim().replace(/\/$/, '');
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();
      await chrome.storage.sync.set({ url, username, password });
      if (url && username && password) {
        status.textContent = 'Connection saved. Open the side panel to sync.';
      } else {
        status.textContent = 'Saved. Running in local-only mode until URL and credentials are set.';
      }
    });
  }

  // ── Export ────────────────────────────────────────────────────────
  function openExportModal() {
    const modal = $('modal-export');
    const list = $('export-list');
    list.innerHTML = '';
    const sorted = [...notes].sort((a, b) => (b.updated || 0) - (a.updated || 0));

    sorted.forEach(note => {
      const item = document.createElement('div');
      item.className = 'modal-list-item';
      item.dataset.id = note.id;
      item.innerHTML = `
        <input type="checkbox" checked />
        <span class="modal-list-item-title">${escapeHtml(note.title || 'Untitled')}</span>
        <span class="modal-list-item-meta">${formatDate(note.updated)}</span>`;
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
    const checked = $('export-list').querySelectorAll('input:checked').length;
    $('export-selected-count').textContent = checked + ' selected';
    $('btn-export-run').disabled = checked === 0;
  }

  async function runExport() {
    const items = $('export-list').querySelectorAll('.modal-list-item');
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
      const a = $('dl-anchor');
      a.href = url;
      a.download = slugify(note.title || 'note') + '.txt';
      a.click();
      URL.revokeObjectURL(url);
      $('modal-export').classList.add('hidden');
      $('modal-export').setAttribute('aria-hidden', 'true');
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
      const a = $('dl-anchor');
      a.href = url;
      a.download = 'nextcloud-notes-export.zip';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      for (const note of selected) {
        const content = (note.title ? '# ' + note.title + '\n\n' : '') + (note.content || '');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = $('dl-anchor');
        a.href = url;
        a.download = slugify(note.title || 'note') + '.txt';
        a.click();
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 150));
      }
    }

    $('modal-export').classList.add('hidden');
    $('modal-export').setAttribute('aria-hidden', 'true');
    toast('Exported ' + selected.length + ' notes');
  }

  // ── Import ────────────────────────────────────────────────────────
  function openImportModal() {
    importPendingFiles = [];
    $('import-preview-list').innerHTML = '';
    $('import-preview-list').classList.add('hidden');
    $('import-file-count').textContent = '';
    $('btn-import-run').disabled = true;
    $('import-file-input').value = '';
    $('modal-import').classList.remove('hidden');
    $('modal-import').setAttribute('aria-hidden', 'false');
  }

  function handleImportFiles(files) {
    importPendingFiles = [...files].filter(f => /\.(txt|md)$/i.test(f.name));
    const list = $('import-preview-list');
    list.innerHTML = '';

    if (importPendingFiles.length === 0) {
      $('import-file-count').textContent = 'No .txt or .md files selected';
      $('btn-import-run').disabled = true;
      list.classList.add('hidden');
      return;
    }

    importPendingFiles.forEach(file => {
      const item = document.createElement('div');
      item.className = 'modal-list-item';
      item.style.cursor = 'default';
      item.innerHTML = `
        <span class="modal-list-item-title">${escapeHtml(file.name)}</span>
        <span class="modal-list-item-meta">${(file.size / 1024).toFixed(1)} KB</span>`;
      list.appendChild(item);
    });

    list.classList.remove('hidden');
    $('import-file-count').textContent =
      importPendingFiles.length + ' file' + (importPendingFiles.length !== 1 ? 's' : '') + ' ready';
    $('btn-import-run').disabled = false;
  }

  async function runImport() {
    if (importPendingFiles.length === 0) return;
    await loadNotesForModals();
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
    await chrome.storage.local.set({ [STORAGE_NOTES]: notes });
    $('modal-import').classList.add('hidden');
    $('modal-import').setAttribute('aria-hidden', 'true');
    toast('Imported ' + imported + ' note' + (imported !== 1 ? 's' : ''));
    importPendingFiles = [];
  }

  // ── Init ──────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    await loadTheme();
    await loadPrefs();
    await loadNotesForModals();
    populatePrefsForm();
    await initNextcloudForm();

    $('btn-options-theme').addEventListener('click', toggleOptionsTheme);

    $('opt-editor-font').addEventListener('change', e => {
      prefs.editorFont = e.target.value;
      savePrefs();
      applyPrefsToUI();
    });
    $('opt-preview-font').addEventListener('change', e => {
      prefs.previewFont = e.target.value;
      savePrefs();
      applyPrefsToUI();
    });
    $('opt-editor-size').addEventListener('input', e => {
      prefs.editorSize = +e.target.value;
      $('opt-editor-size-val').textContent = prefs.editorSize + 'px';
      savePrefs();
      applyPrefsToUI();
    });
    $('opt-preview-size').addEventListener('input', e => {
      prefs.previewSize = +e.target.value;
      $('opt-preview-size-val').textContent = prefs.previewSize + 'px';
      savePrefs();
      applyPrefsToUI();
    });
    $('opt-editor-color').addEventListener('input', e => {
      prefs.editorColor = e.target.value;
      savePrefs();
      applyPrefsToUI();
    });
    $('opt-preview-color').addEventListener('input', e => {
      prefs.previewColor = e.target.value;
      savePrefs();
      applyPrefsToUI();
    });
    $('opt-accent-color').addEventListener('input', e => {
      const hex = e.target.value;
      chrome.storage.local.set({ [STORAGE_ACCENT]: hex });
      setPageAccentFromHex(hex);
    });

    document.querySelectorAll('.btn-reset-color').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        const val = theme === 'dark' ? btn.dataset.dark : btn.dataset.light;
        $(target).value = val;
        if (target === 'opt-editor-color') prefs.editorColor = null;
        if (target === 'opt-preview-color') prefs.previewColor = null;
        if (target === 'opt-accent-color') {
          chrome.storage.local.set({ [STORAGE_ACCENT]: val });
          setPageAccentFromHex(val);
        }
        savePrefs();
        applyPrefsToUI();
      });
    });

    $('btn-reset-prefs').addEventListener('click', () => {
      prefs = { ...PREFS_DEFAULTS };
      savePrefs();
      const theme = document.documentElement.getAttribute('data-theme') || 'dark';
      const defAccent = '#0082C9';
      chrome.storage.local.set({ [STORAGE_ACCENT]: defAccent });
      $('opt-accent-color').value = defAccent;
      setPageAccentFromHex(defAccent);
      syncColorPickersToTheme(theme);
      populatePrefsForm();
      toast('Typography and colours reset');
    });

    $('btn-open-export').addEventListener('click', async () => {
      await loadNotesForModals();
      openExportModal();
    });
    $('btn-export-close').addEventListener('click', () => {
      $('modal-export').classList.add('hidden');
      $('modal-export').setAttribute('aria-hidden', 'true');
    });
    $('btn-export-select-all').addEventListener('click', () => {
      $('export-list').querySelectorAll('input').forEach(cb => { cb.checked = true; });
      updateExportCount();
    });
    $('btn-export-deselect').addEventListener('click', () => {
      $('export-list').querySelectorAll('input').forEach(cb => { cb.checked = false; });
      updateExportCount();
    });
    $('btn-export-run').addEventListener('click', () => void runExport());

    $('btn-open-import').addEventListener('click', openImportModal);
    $('btn-import-close').addEventListener('click', () => {
      $('modal-import').classList.add('hidden');
      $('modal-import').setAttribute('aria-hidden', 'true');
    });
    $('import-file-input').addEventListener('change', e => handleImportFiles(e.target.files));

    const dropZone = $('import-drop-zone');
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

    $('btn-import-run').addEventListener('click', () => void runImport());

    $('modal-export').addEventListener('click', e => {
      if (e.target === $('modal-export')) {
        $('modal-export').classList.add('hidden');
        $('modal-export').setAttribute('aria-hidden', 'true');
      }
    });
    $('modal-import').addEventListener('click', e => {
      if (e.target === $('modal-import')) {
        $('modal-import').classList.add('hidden');
        $('modal-import').setAttribute('aria-hidden', 'true');
      }
    });
  });
})();
