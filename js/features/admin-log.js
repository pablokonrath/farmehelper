import { AppState } from '../state/app-state.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

export async function loadAdminActionLog() {
  AppState.isAdminActionLogLoading = true;
  renderPage();
  try {
    const response = await fetch(`${API_BASE}/admin-log.php`, { credentials: 'same-origin' });
    AppState.adminActionLog = response.ok ? await response.json() : [];
  } catch {
    AppState.adminActionLog = [];
  }
  AppState.isAdminActionLogLoading = false;
  renderPage();
}

export async function loadIntegrityFlags() {
  AppState.isIntegrityFlagsLoading = true;
  renderPage();
  try {
    const response = await fetch(`${API_BASE}/integrity-flags.php`, { credentials: 'same-origin' });
    AppState.integrityFlags = response.ok ? await response.json() : [];
  } catch {
    AppState.integrityFlags = [];
  }
  AppState.isIntegrityFlagsLoading = false;
  renderPage();
}

// Chamada junto de cada ação de admin em admin.js — fire-and-forget (uma falha aqui não deve
// travar a ação principal, só perde o registro dessa vez), mas recarrega a lista em caso de
// sucesso pra já refletir na tela sem precisar sair e voltar na página Admin.
export async function logAdminAction(action, details) {
  try {
    const response = await fetch(`${API_BASE}/admin-log.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, details }),
    });
    if (!response.ok) {
      console.error('Falha ao logar ação de admin:', response.status, await response.text());
      return;
    }
    await loadAdminActionLog();
  } catch (err) {
    console.error('Erro de conexão ao logar ação de admin:', err);
  }
}
