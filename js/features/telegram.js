import { AppState } from '../state/app-state.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

// Timer da verificação automática do vínculo (ver startLinkPolling) — global pro módulo pra
// nunca rodar dois ao mesmo tempo e pra dar pra cancelar (ao vincular, desvincular ou no timeout).
let linkPollTimer = null;

function stopLinkPolling() {
  if (linkPollTimer) {
    clearInterval(linkPollTimer);
    linkPollTimer = null;
  }
}

// Depois de gerar o código, fica checando o servidor até o jogador confirmar o /start no
// Telegram (o webhook grava telegram_chat_id) — aí a tela troca sozinha pro estado "Vinculado"
// com os interruptores, sem precisar dar F5. Para sozinho ao vincular ou após ~3 min.
function startLinkPolling() {
  stopLinkPolling();
  let attempts = 0;
  linkPollTimer = setInterval(async () => {
    if (++attempts > 60) return stopLinkPolling(); // ~3 min a 3s por tentativa
    try {
      const res = await fetch(`${API_BASE}/alert-settings.php`, { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.telegramChatId) {
        AppState.alertSettings.telegramChatId = data.telegramChatId;
        AppState.telegramLinkCode = null;
        AppState.telegramBotLink = null;
        stopLinkPolling();
        renderPage();
      }
    } catch {
      // falha de rede pontual — segue tentando até o timeout
    }
  }, 3000);
}

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
    startLinkPolling();
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

// Chamada pelo watchdog (fireWatchdogAlert em alerts.js) quando detecta helper travado / item
// rastreado sumido — manda o aviso pro Telegram do jogador. Mesmo espírito do relayDropToTelegram:
// fire-and-forget, só tenta se o relay do watchdog está ligado e há Telegram vinculado.
export function relayWatchdogToTelegram(message) {
  if (!AppState.alertSettings.telegramWatchdogRelayEnabled || !AppState.alertSettings.telegramChatId) return;
  fetch(`${API_BASE}/telegram-relay-watchdog.php`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  }).catch(err => console.error('Falha ao enviar watchdog pro Telegram:', err));
}

export async function unlinkTelegram() {
  if (!confirm('Desvincular o Telegram? Você vai parar de receber avisos por lá.')) return;
  stopLinkPolling();
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
