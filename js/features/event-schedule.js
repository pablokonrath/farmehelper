import { AppState } from '../state/app-state.js';
import { fireEventAlert } from './alerts.js';
import { parseTimeInputBR } from '../utils/formatting.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';
const CHECK_INTERVAL_MS = 20000;

// Chave por dia+tipo+horário — evita disparar de novo se o tick seguinte (20s depois) ainda
// cair no mesmo minuto. Reseta sozinho no F5 (não precisa persistir: pior caso é o pop-up
// aparecer de novo se o usuário recarregar bem na hora exata, o que é raro e inofensivo).
let firedToday = new Set();

export async function loadEventSchedule() {
  try {
    const response = await fetch(`${API_BASE}/event-schedule.php`, { credentials: 'same-origin' });
    AppState.eventSchedule = response.ok ? await response.json() : { tg: [], worldboss: [] };
  } catch {
    AppState.eventSchedule = { tg: [], worldboss: [] };
  }
  renderPage();
}

export async function addEventTime(eventType) {
  const input = document.getElementById('newEventTime-' + eventType);
  const time = parseTimeInputBR(input?.value);
  if (!time) return;
  try {
    const response = await fetch(`${API_BASE}/event-schedule.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, time }),
    });
    if (!response.ok) {
      console.error('Falha ao adicionar horário:', response.status, await response.text());
      return;
    }
    if (input) input.value = '';
    await loadEventSchedule();
  } catch (err) {
    console.error('Erro de conexão ao adicionar horário:', err);
  }
}

export async function removeEventTime(id) {
  try {
    const response = await fetch(`${API_BASE}/event-schedule.php`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      console.error('Falha ao remover horário:', response.status, await response.text());
      return;
    }
    await loadEventSchedule();
  } catch (err) {
    console.error('Erro de conexão ao remover horário:', err);
  }
}

export function checkEventSchedule() {
  const now = new Date();
  const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const today = now.toISOString().slice(0, 10);

  ['tg', 'worldboss'].forEach(eventType => {
    (AppState.eventSchedule[eventType] || []).forEach(entry => {
      if (entry.time !== currentTime) return;
      const key = `${today}|${eventType}|${entry.time}`;
      if (firedToday.has(key)) return;
      firedToday.add(key);
      fireEventAlert(eventType, entry.time);
    });
  });
}

// setInterval próprio (não depende de arquivo ao vivo conectado — evento não tem nada a ver
// com farme) — 20s é rápido o bastante mesmo se o navegador atrasar timer de aba em segundo
// plano pro chão de ~1/min do Chrome, mesma lógica já aceita em startPresenceHeartbeat().
export function startEventScheduleChecks() {
  loadEventSchedule();
  setInterval(checkEventSchedule, CHECK_INTERVAL_MS);
}
