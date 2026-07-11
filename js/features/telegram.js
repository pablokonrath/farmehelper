import { AppState } from '../state/app-state.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

export async function generateTelegramLinkCode() {
  try {
    const response = await fetch(`${API_BASE}/telegram-generate-code.php`, { method: 'POST', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.message || 'Erro ao gerar código do Telegram.');
      return;
    }
    AppState.telegramLinkCode = data.code;
    AppState.telegramBotLink = data.botLink;
    renderPage();
  } catch (err) {
    console.error('Erro de conexão ao gerar código do Telegram:', err);
  }
}

// Chamada quando um drop rastreado dispara um alerta (ver registerAlert em alerts.js) — repassa
// pro Telegram do jogador. Fire-and-forget: nunca deve travar/atrasar o alerta na tela. Só tenta
// se o relay está ligado e há Telegram vinculado (o servidor revalida em telegram-relay-drop.php).
export function relayDropToTelegram(entry) {
  if (!AppState.alertSettings.telegramDropRelayEnabled || !AppState.alertSettings.telegramChatId) return;
  fetch(`${API_BASE}/telegram-relay-drop.php`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemName: entry.itemName, keyword: entry.keyword, quantity: entry.quantity }),
  }).catch(err => console.error('Falha ao enviar drop pro Telegram:', err));
}

export async function unlinkTelegram() {
  if (!confirm('Desvincular o Telegram? Você vai parar de receber avisos por lá.')) return;
  try {
    const response = await fetch(`${API_BASE}/telegram-unlink.php`, { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) console.error('Falha ao desvincular Telegram:', response.status, await response.text());
    AppState.alertSettings.telegramChatId = null;
    AppState.telegramLinkCode = null;
    AppState.telegramBotLink = null;
    renderPage();
  } catch (err) {
    console.error('Erro de conexão ao desvincular Telegram:', err);
  }
}
