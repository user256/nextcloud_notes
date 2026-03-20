chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveNote') {
    saveNoteFromStorage(request.text, request.title)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || 'Unknown error' }));
    return true;
  }
});

async function saveNoteFromStorage(noteText, noteTitle) {
  const data = await chrome.storage.sync.get(['url', 'username', 'password']);

  const baseUrl = (data.url || '').trim().replace(/\/$/, '');
  const username = (data.username || '').trim();
  const password = (data.password || '').trim();

  if (!baseUrl || !username || !password) {
    throw new Error('Please set your Nextcloud URL, username, and password in the extension options first.');
  }

  const apiUrl = baseUrl + '/index.php/apps/notes/api/v0.2/notes';
  const content = noteTitle ? noteTitle + '\n\n' + noteText : noteText;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(username + ':' + password),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const body = await safeText(response);
    throw new Error('Nextcloud returned ' + response.status + (body ? ': ' + body : ''));
  }

  return await response.json();
}

async function safeText(response) {
  try {
    return await response.text();
  } catch (e) {
    return '';
  }
}
