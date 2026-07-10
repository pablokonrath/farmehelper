import { AppState } from '../state/app-state.js';

const API_BASE = 'api';

export async function checkSession() {
  try {
    const response = await fetch(`${API_BASE}/session-check.php`, { credentials: 'same-origin' });
    if (!response.ok) return false;
    const data = await response.json();
    AppState.isAdmin = !!data.isAdmin;
    return !!data.authenticated;
  } catch {
    return false;
  }
}

function showLoginError(message) {
  const errorEl = document.getElementById('loginError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

export async function submitLogin() {
  const username = document.getElementById('loginUsername')?.value || '';
  const password = document.getElementById('loginPassword')?.value || '';
  const errorEl = document.getElementById('loginError');
  if (errorEl) errorEl.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/login.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (response.ok) {
      window.location.reload();
      return;
    }
    showLoginError('Usuário ou senha incorretos.');
  } catch {
    showLoginError('Erro de conexão com o servidor.');
  }
}

export async function logout() {
  await fetch(`${API_BASE}/logout.php`, { method: 'POST', credentials: 'same-origin' });
  window.location.reload();
}
