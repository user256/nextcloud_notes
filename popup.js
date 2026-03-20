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

    chrome.runtime.sendMessage(
      {
        action: 'saveNote',
        text,
        title
      },
      (response) => {
        saveButton.disabled = false;

        if (chrome.runtime.lastError) {
          status.textContent = 'Error: ' + chrome.runtime.lastError.message;
          return;
        }

        if (response && response.ok) {
          status.textContent = 'Saved.';
          noteText.value = '';
          noteTitle.value = '';
          noteText.focus();
        } else {
          status.textContent = (response && response.error) ? response.error : 'Failed to save note.';
        }
      }
    );
  });
});
