document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('noteForm');
  const noteText = document.getElementById('noteText');
  const noteTitle = document.getElementById('noteTitle');
  const saveButton = document.getElementById('saveButton');
  const status = document.getElementById('status');

  noteText.focus();

  noteTitle.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const text = noteText.value.trim();
    const title = noteTitle.value.trim();

    if (!text) {
      status.textContent = 'Please enter some note text.';
      noteText.focus();
      return;
    }

    saveButton.disabled = true;
    status.textContent = 'Saving...';

    const message = { action: 'saveNote', text, title };
    const handleResponse = (response) => {
      saveButton.disabled = false;
      if (response && response.ok) {
        status.textContent = 'Saved.';
        noteText.value = '';
        noteTitle.value = '';
        noteText.focus();
      } else {
        status.textContent = (response && response.error) ? response.error : 'Failed to save note.';
      }
    };

    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
      browser.runtime.sendMessage(message)
        .then(handleResponse)
        .catch(err => {
          saveButton.disabled = false;
          status.textContent = 'Error: ' + (err && err.message ? err.message : 'Unknown error');
        });
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      saveButton.disabled = false;
      if (chrome.runtime.lastError) {
        status.textContent = 'Error: ' + chrome.runtime.lastError.message;
        return;
      }
      handleResponse(response);
    });
  });
});
