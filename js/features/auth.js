const API_BASE = 'api';

export async function checkSession() {
  try {
    const response = await fetch(`${API_BASE}/session-check.php`, { credentials: 'same-origin' });
    if (!response.ok) return false;
    const data = await response.json();
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
  const input = document.getElementById('loginPassword');
  const password = input?.value || '';
  const errorEl = document.getElementById('loginError');
  if (errorEl) errorEl.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/login.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      window.location.reload();
      return;
    }
    const data = await response.json().catch(() => ({}));
    showLoginError(
      data.error === 'server_not_configured'
        ? 'Backend ainda não configurado (falta o hash da senha em api/config.php).'
        : 'Senha incorreta.'
    );
  } catch {
    showLoginError('Erro de conexão com o servidor.');
  }
}

export async function logout() {
  await fetch(`${API_BASE}/logout.php`, { method: 'POST', credentials: 'same-origin' });
  window.location.reload();
}
