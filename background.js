if (typeof browser !== 'undefined' && browser.browserAction && browser.sidebarAction) {
  browser.browserAction.onClicked.addListener(async () => {
    try {
      await browser.sidebarAction.open();
    } catch {
      // Ignore - sidebar open can fail on some internal pages.
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === 'saveNote') {
        const { content, title } = { content: request.text, title: request.title };
        const resp = await createRemoteNote({ title, content });
        if (!resp.ok) return sendResponse(resp);
        return sendResponse({ ok: true, note: resp.note });
      }

      if (request.action === 'ncFetchNotes') {
        const resp = await fetchRemoteNotes({ chunkSize: request.chunkSize });
        return sendResponse(resp);
      }

      if (request.action === 'ncCreateNote') {
        const resp = await createRemoteNote({ title: request.title, content: request.content, category: request.category });
        return sendResponse(resp);
      }

      if (request.action === 'ncUpdateNote') {
        const resp = await updateRemoteNote({
          noteId: request.noteId,
          title: request.title,
          content: request.content,
          etag: request.etag,
          category: request.category
        });
        return sendResponse(resp);
      }

      if (request.action === 'ncDeleteNote') {
        const resp = await deleteRemoteNote({ noteId: request.noteId });
        return sendResponse(resp);
      }

      return sendResponse({ ok: false, error: 'Unknown action' });
    } catch (e) {
      const msg = e && typeof e.message === 'string' ? e.message : 'Unknown error';
      return sendResponse(responseWithError({ ok: false, error: msg }));
    }
  })();
  return true;
});

async function getCreds() {
  let data;
  // Firefox supports promise-based `browser.*` storage APIs; Chrome uses callback-based `chrome.*`.
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.sync && typeof browser.storage.sync.get === 'function') {
    data = await browser.storage.sync.get(['url', 'username', 'password']);
  } else {
    data = await new Promise(resolve => {
      // Callback-style fallback (Chromium / MV2).
      chrome.storage.sync.get(['url', 'username', 'password'], result => resolve(result || {}));
    });
  }
  const baseUrl = (data.url || '').trim().replace(/\/$/, '');
  const username = (data.username || '').trim();
  const password = (data.password || '').trim();
  if (!baseUrl || !username || !password) return null;
  return { baseUrl, username, password };
}

function basicAuthHeader(username, password) {
  return 'Basic ' + btoa(username + ':' + password);
}

function notesV1BaseUrl(baseUrl) {
  return baseUrl + '/index.php/apps/notes/api/v1';
}

async function parseError(res) {
  try {
    const text = await res.text();
    return text ? text : '';
  } catch {
    return '';
  }
}

/** Turn Notes API / Nextcloud JSON or text error bodies into a single string for the UI. */
function errorMessageFromFailedFetch(resp) {
  if (!resp || resp.ok) return '';
  const status = resp.status != null ? String(resp.status) : 'unknown';
  const d = resp.data;

  if (typeof d === 'string') {
    const t = d.trim();
    if (t) return t.length > 2000 ? t.slice(0, 2000) + '…' : t;
    return 'Nextcloud returned HTTP ' + status;
  }

  if (d && typeof d === 'object') {
    const msg =
      (typeof d.message === 'string' && d.message) ||
      (typeof d.error === 'string' && d.error) ||
      (d.ocs && d.ocs.meta && typeof d.ocs.meta.message === 'string' && d.ocs.meta.message) ||
      '';
    if (msg) return msg;
    try {
      const s = JSON.stringify(d);
      return s.length > 2000 ? s.slice(0, 2000) + '…' : s;
    } catch {
      return 'Nextcloud returned HTTP ' + status;
    }
  }

  return 'Nextcloud returned HTTP ' + status;
}

/** Guarantee message responses always carry a string `error` (structured clone safe). */
function responseWithError(base) {
  const out = { ...base };
  if (typeof out.error !== 'undefined' && typeof out.error !== 'string') {
    try {
      out.error =
        out.error && typeof out.error.message === 'string'
          ? out.error.message
          : JSON.stringify(out.error);
    } catch {
      out.error = 'Unknown error';
    }
  }
  return out;
}

async function fetchJsonOrText(url, options) {
  const res = await fetch(url, options);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (res.ok) {
    if (contentType.includes('application/json')) {
      return { ok: true, status: res.status, data: await res.json(), headers: res.headers };
    }
    return { ok: true, status: res.status, data: await res.text(), headers: res.headers };
  }

  // Nextcloud often returns JSON (e.g. 412 includes the current note state).
  if (contentType.includes('application/json')) {
    try {
      return { ok: false, status: res.status, data: await res.json(), headers: res.headers };
    } catch {
      const bodyText = await parseError(res);
      return { ok: false, status: res.status, data: bodyText, headers: res.headers };
    }
  }

  const bodyText = await parseError(res);
  return { ok: false, status: res.status, data: bodyText, headers: res.headers };
}

async function fetchRemoteNotes({ chunkSize }) {
  const creds = await getCreds();
  if (!creds) return { ok: false, code: 'NO_CREDS', error: 'Missing Nextcloud credentials.' };

  const apiBase = notesV1BaseUrl(creds.baseUrl);
  const listUrlBase = apiBase + '/notes';

  const requestedChunkSize = Number.isFinite(Number(chunkSize)) ? Number(chunkSize) : null;
  const useChunking = requestedChunkSize && requestedChunkSize > 0;

  const authHeader = basicAuthHeader(creds.username, creds.password);

  // Fetch all notes (either a single response or by chunk cursor until empty).
  let allNotes = [];
  let cursor = null;
  let iter = 0;

  while (true) {
    iter++;
    if (iter > 50) break; // safety

    const params = [];
    if (useChunking) params.push('chunkSize=' + encodeURIComponent(String(requestedChunkSize)));
    if (useChunking && cursor) params.push('chunkCursor=' + encodeURIComponent(cursor));

    const url = params.length ? listUrlBase + '?' + params.join('&') : listUrlBase;

    const resp = await fetchJsonOrText(url, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!resp.ok) {
      return responseWithError({ ok: false, error: errorMessageFromFailedFetch(resp), status: resp.status });
    }

    const notes = Array.isArray(resp.data) ? resp.data : [];
    allNotes = allNotes.concat(notes);

    if (!useChunking) break;

    const nextCursor = resp.headers.get('X-Notes-Chunk-Cursor');
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return { ok: true, notes: allNotes };
}

async function fetchRemoteNote({ noteId }) {
  const creds = await getCreds();
  if (!creds) return { ok: false, code: 'NO_CREDS', error: 'Missing Nextcloud credentials.' };

  const apiBase = notesV1BaseUrl(creds.baseUrl);
  const url = apiBase + '/notes/' + encodeURIComponent(String(noteId));
  const authHeader = basicAuthHeader(creds.username, creds.password);

  const resp = await fetchJsonOrText(url, {
    method: 'GET',
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
  });

  if (!resp.ok) {
    return responseWithError({ ok: false, error: errorMessageFromFailedFetch(resp), status: resp.status });
  }

  return { ok: true, note: resp.data };
}

async function createRemoteNote({ title, content, category }) {
  const creds = await getCreds();
  if (!creds) return { ok: false, code: 'NO_CREDS', error: 'Missing Nextcloud credentials.' };

  const apiBase = notesV1BaseUrl(creds.baseUrl);
  const url = apiBase + '/notes';
  const authHeader = basicAuthHeader(creds.username, creds.password);

  const body = {};
  if (typeof title === 'string' && title.trim()) body.title = title;
  if (typeof content === 'string') body.content = content;
  if (typeof category === 'string') body.category = category;

  const resp = await fetchJsonOrText(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    return responseWithError({
      ok: false,
      error: errorMessageFromFailedFetch(resp),
      status: resp.status
    });
  }

  if (!resp.data || typeof resp.data !== 'object' || typeof resp.data.id === 'undefined') {
    return responseWithError({
      ok: false,
      error: 'Create succeeded but server response was missing note id.',
      status: resp.status
    });
  }

  return { ok: true, note: resp.data };
}

async function updateRemoteNote({ noteId, title, content, etag, category }) {
  const creds = await getCreds();
  if (!creds) return { ok: false, code: 'NO_CREDS', error: 'Missing Nextcloud credentials.' };

  const apiBase = notesV1BaseUrl(creds.baseUrl);
  const url = apiBase + '/notes/' + encodeURIComponent(String(noteId));
  const authHeader = basicAuthHeader(creds.username, creds.password);

  const body = {};
  if (typeof title === 'string' && title.trim()) body.title = title;
  if (typeof content === 'string') body.content = content;
  if (typeof category === 'string') body.category = category;

  function normalizeEtagForIfMatch(v) {
    if (typeof v !== 'string') return null;
    const etag = v.trim();
    if (!etag) return null;
    // Nextcloud typically returns bare etag values in JSON (no quotes), but
    // HTTP ETag headers are often quoted. If-Match commonly expects the quoted form.
    if (etag.startsWith('"') || etag.startsWith('W/"')) return etag;
    return '"' + etag + '"';
  }

  const doPut = async (matchEtag) => {
    const headers = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    const normalized = normalizeEtagForIfMatch(matchEtag);
    if (normalized) headers['If-Match'] = normalized;

    const resp = await fetchJsonOrText(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    return resp;
  };

  let currentEtag = etag || null;
  let last = null;

  // Try a few times to handle the common "412 Precondition Failed" case,
  // where the server returns the current note state + newest ETag.
  for (let attempt = 0; attempt < 5; attempt++) {
    const resp = await doPut(currentEtag);
    if (resp.ok) return { ok: true, note: resp.data, conflicted: attempt > 0 };

    last = resp;

    if (resp.status === 412) {
      let nextEtag = null;

      // If Notes API returns JSON body, it usually includes the note state.
      if (resp.data && typeof resp.data === 'object' && resp.data.etag) {
        nextEtag = resp.data.etag;
      } else if (typeof resp.data === 'string' && resp.data.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(resp.data);
          if (parsed && typeof parsed === 'object' && parsed.etag) nextEtag = parsed.etag;
        } catch {
          // ignore JSON parse errors
        }
      }

      if (!nextEtag) {
        const latest = await fetchRemoteNote({ noteId });
        if (!latest.ok) break;
        nextEtag = latest.note && latest.note.etag ? latest.note.etag : null;
      }

      // If we can't extract a newer etag, stop retrying.
      if (!nextEtag) break;
      currentEtag = nextEtag;
      continue;
    }

    break; // non-412 errors
  }

  const err = last ? errorMessageFromFailedFetch(last) : 'Nextcloud returned unknown error';
  return responseWithError({ ok: false, error: err, status: last ? last.status : undefined });
}

async function deleteRemoteNote({ noteId }) {
  const creds = await getCreds();
  if (!creds) return { ok: false, code: 'NO_CREDS', error: 'Missing Nextcloud credentials.' };

  const apiBase = notesV1BaseUrl(creds.baseUrl);
  const url = apiBase + '/notes/' + encodeURIComponent(String(noteId));
  const authHeader = basicAuthHeader(creds.username, creds.password);

  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    }
  });

  if (!resp.ok) {
    const body = await parseError(resp);
    const err = body ? body : ('Nextcloud returned ' + resp.status);
    return { ok: false, error: err, status: resp.status };
  }

  return { ok: true };
}
