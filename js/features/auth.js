import { AppState } from '../state/app-state.js';

const API_BASE = 'api';

export async function checkSession() {
  try {
    const response = await fetch(`${API_BASE}/session-check.php`, { credentials: 'same-origin' });
    if (!response.ok) return false;
    const data = await response.json();
    AppState.isAdmin = !!data.isAdmin;
    AppState.isMasterAdmin = !!data.isMasterAdmin;
    AppState.currentUsername = data.username || '';
    AppState.currentUserId = data.userId || null;
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

function showRegisterError(message) {
  const errorEl = document.getElementById('registerError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

// Alterna entre as abas "Entrar" / "Cadastrar" da tela de login — troca só a aba visível, sem
// mexer em sessão nem servidor.
export function setAuthMode(mode) {
  document.getElementById('authTabLogin')?.classList.toggle('on', mode === 'login');
  document.getElementById('authTabRegister')?.classList.toggle('on', mode === 'register');
  document.getElementById('authPaneLogin').style.display = mode === 'login' ? '' : 'none';
  document.getElementById('authPaneRegister').style.display = mode === 'register' ? '' : 'none';
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
    const data = await response.json().catch(() => ({}));
    showLoginError(data.message || 'Usuário ou senha incorretos.');
  } catch {
    showLoginError('Erro de conexão com o servidor.');
  }
}

export async function submitRegister() {
  const username = (document.getElementById('registerUsername')?.value || '').trim();
  const password = document.getElementById('registerPassword')?.value || '';
  const passwordConfirm = document.getElementById('registerPasswordConfirm')?.value || '';
  // Campo isca contra bot: some visualmente e some da navegação por teclado (tabindex="-1"), um
  // humano de verdade nunca preenche. Se veio preenchido, finge sucesso sem criar nada — não dá
  // pra saber quando o bot verifica um usuário/senha errados.
  const honeypot = document.getElementById('registerWebsite')?.value || '';
  const errorEl = document.getElementById('registerError');
  if (errorEl) errorEl.style.display = 'none';

  if (honeypot) return;

  if (!username || username.length < 3) return showRegisterError('Escolha um usuário com pelo menos 3 caracteres.');
  if (password.length < 8) return showRegisterError('A senha precisa ter pelo menos 8 caracteres.');
  if (password !== passwordConfirm) return showRegisterError('As senhas não são iguais.');

  try {
    const response = await fetch(`${API_BASE}/register.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (response.ok) {
      window.location.reload();
      return;
    }
    const data = await response.json().catch(() => ({}));
    showRegisterError(data.message || 'Não deu pra criar a conta.');
  } catch {
    showRegisterError('Erro de conexão com o servidor.');
  }
}

export async function logout() {
  await fetch(`${API_BASE}/logout.php`, { method: 'POST', credentials: 'same-origin' });
  window.location.reload();
}
