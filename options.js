document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm');
  const urlInput = document.getElementById('url');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const status = document.getElementById('status');

  const data = await chrome.storage.sync.get(['url', 'username', 'password']);
  if (data.url) urlInput.value = data.url;
  if (data.username) usernameInput.value = data.username;
  if (data.password) passwordInput.value = data.password;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const url = urlInput.value.trim().replace(/\/$/, '');
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    await chrome.storage.sync.set({ url, username, password });
    status.textContent = 'Settings saved.';
  });
});
