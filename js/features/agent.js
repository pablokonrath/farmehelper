import { AppState } from '../state/app-state.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

export async function loadAgentToken() {
  try {
    const res = await fetch(`${API_BASE}/agent-token.php`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    AppState.agentToken = data.token || null;
    renderPage();
  } catch (err) {
    console.error('Erro ao obter o token do agente:', err);
  }
}

export async function regenerateAgentToken() {
  if (!confirm('Gerar um token novo? O token atual para de funcionar — você vai precisar atualizar no agente do PC.')) return;
  try {
    const res = await fetch(`${API_BASE}/agent-token.php`, { method: 'POST', credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    AppState.agentToken = data.token || null;
    renderPage();
  } catch (err) {
    console.error('Erro ao regenerar o token do agente:', err);
  }
}
