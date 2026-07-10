import { AppState } from '../state/app-state.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

export async function loadUsers() {
  AppState.isAdminUsersLoading = true;
  renderPage();
  try {
    const response = await fetch(`${API_BASE}/users.php`, { credentials: 'same-origin' });
    AppState.adminUsers = response.ok ? await response.json() : [];
  } catch {
    AppState.adminUsers = [];
  }
  AppState.isAdminUsersLoading = false;
  renderPage();
}

export async function createUser() {
  const usernameInput = document.getElementById('newUserUsername');
  const passwordInput = document.getElementById('newUserPassword');
  const errorEl = document.getElementById('createUserError');
  if (errorEl) errorEl.style.display = 'none';

  const username = usernameInput?.value.trim() || '';
  const password = passwordInput?.value || '';

  try {
    const response = await fetch(`${API_BASE}/users.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (errorEl) {
        errorEl.textContent = data.message || 'Erro ao criar conta.';
        errorEl.style.display = 'block';
      }
      return;
    }
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    await loadUsers();
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Erro de conexão com o servidor.';
      errorEl.style.display = 'block';
    }
  }
}
