const API_BASE = 'api';
const HEARTBEAT_INTERVAL_MS = 60000;

// Atualiza o badge direto no DOM (fora do #main, então fora do ciclo de renderPage()) — mesmo
// padrão de updateBalanceSidebar() em drops.js.
async function sendHeartbeat() {
  try {
    const response = await fetch(`${API_BASE}/heartbeat.php`, { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) {
      console.error('Falha ao enviar heartbeat:', response.status, await response.text());
      return;
    }
    const data = await response.json();
    const badge = document.getElementById('onlineCount');
    const valueEl = document.getElementById('onlineCountVal');
    if (valueEl) valueEl.textContent = data.onlineCount;
    if (badge) badge.style.display = 'flex';
  } catch (err) {
    console.error('Erro de conexão ao enviar heartbeat:', err);
  }
}

// setInterval comum é suficiente aqui (sem Worker) — é só um indicador visual, tolera ficar
// levemente desatualizado numa aba em segundo plano, diferente dos alertas de item/watchdog.
export function startPresenceHeartbeat() {
  sendHeartbeat();
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}
