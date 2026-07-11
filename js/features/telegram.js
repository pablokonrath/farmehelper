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
