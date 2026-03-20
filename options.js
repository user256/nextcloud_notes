document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm');
  const urlInput = document.getElementById('url');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const accentColorInput = document.getElementById('accentColor');
  const status = document.getElementById('status');

  const data = await chrome.storage.sync.get(['url', 'username', 'password']);
  if (data.url) urlInput.value = data.url;
  if (data.username) usernameInput.value = data.username;
  if (data.password) passwordInput.value = data.password;

  const localAccent = await chrome.storage.local.get(['nn_accent']);
  if (localAccent.nn_accent) accentColorInput.value = localAccent.nn_accent;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const url = urlInput.value.trim().replace(/\/$/, '');
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const accentColor = (accentColorInput.value || '#0082C9').trim();

    await chrome.storage.sync.set({ url, username, password });
    await chrome.storage.local.set({ nn_accent: accentColor });
    if (url && username && password) status.textContent = 'Settings saved. Nextcloud sync is enabled.';
    else status.textContent = 'Settings saved. Nextcloud sync is disabled (local-only mode).';
  });
});
