import { fireWishlistMatchAlert } from './alerts.js';

const API_BASE = 'api';
const HEARTBEAT_INTERVAL_MS = 60000;

// Última lista conhecida — guardada aqui (não em AppState) porque só alimenta o popover, que
// é atualizado direto no DOM fora do ciclo de renderPage(), igual o badge.
let lastOnlineUsers = [];
let popoverOpen = false;

function renderOnlinePopoverList(users) {
  if (!users.length) return '<div style="padding:8px 2px;color:var(--muted);font-size:12px">Ninguém online agora.</div>';
  return users.map(u => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 2px;border-bottom:1px solid var(--border)">
      <span style="font-size:13px;font-weight:500">${u.username}</span>
      ${u.guild ? `<span style="font-size:11px;color:var(--muted)">${u.guild}</span>` : ''}
    </div>`).join('');
}

function updateOnlinePopoverContent() {
  const listEl = document.getElementById('onlinePopoverList');
  if (listEl) listEl.innerHTML = renderOnlinePopoverList(lastOnlineUsers);
}

// Alterna o popover com a lista de quem está online — chamado pelo clique no badge (ver
// index.html/main.js). Fecha sozinho ao clicar fora, igual outros elementos flutuantes do app.
export function toggleOnlinePopover() {
  const popover = document.getElementById('onlinePopover');
  if (!popover) return;
  popoverOpen = !popoverOpen;
  popover.style.display = popoverOpen ? 'block' : 'none';
  if (popoverOpen) updateOnlinePopoverContent();
}

document.addEventListener('click', event => {
  if (!popoverOpen) return;
  const popover = document.getElementById('onlinePopover');
  const badge = document.getElementById('onlineCount');
  if (popover && !popover.contains(event.target) && badge && !badge.contains(event.target)) {
    popoverOpen = false;
    popover.style.display = 'none';
  }
});

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
    lastOnlineUsers = data.onlineUsers || [];

    const badge = document.getElementById('onlineCount');
    const valueEl = document.getElementById('onlineCountVal');
    if (valueEl) valueEl.textContent = data.onlineCount;
    if (badge) badge.style.display = 'flex';
    if (popoverOpen) updateOnlinePopoverContent();

    (data.newWishlistMatches || []).forEach(fireWishlistMatchAlert);
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
