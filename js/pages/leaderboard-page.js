import { AppState } from '../state/app-state.js';

const MEDAL_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

function renderPodiumSlot(row, position) {
  if (!row) return `<div class="podium-slot p${position}"></div>`;
  return `
  <div class="podium-slot p${position}">
    <div class="podium-medal"><i class="ti ti-medal" style="color:${MEDAL_COLORS[position - 1]}"></i></div>
    <div class="podium-name">${row.username}</div>
    <div class="podium-qty">${row.quantity}×</div>
    <div class="podium-stand">${position}º</div>
  </div>`;
}

function renderItemCard(itemName, rows) {
  const guildTotal = rows.reduce((sum, r) => sum + r.quantity, 0);
  const [first, second, third] = rows;
  const rest = rows.slice(3);
  const myIndex = AppState.currentUsername ? rows.findIndex(r => r.username === AppState.currentUsername) : -1;

  const yourRankHtml = myIndex >= 3
    ? `<div class="your-rank"><i class="ti ti-user"></i> Você está em <b>${myIndex + 1}º lugar</b> com ${rows[myIndex].quantity}×</div>`
    : myIndex === -1 && AppState.currentUsername
    ? `<div class="your-rank" style="opacity:.7">Você ainda não registrou nenhum drop desse item.</div>`
    : '';

  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-target-arrow"></i>${itemName}</div>
  <div class="guild-total">Total da guild: <b>${guildTotal}×</b></div>
  <div class="podium">
    ${renderPodiumSlot(second, 2)}
    ${renderPodiumSlot(first, 1)}
    ${renderPodiumSlot(third, 3)}
  </div>
  ${rest.length ? `
  <table><thead><tr><th style="width:50px">#</th><th>Usuário</th><th>Quantidade</th></tr></thead><tbody>
  ${rest.map((row, i) => `<tr>
    <td class="rank">${i + 4}</td>
    <td>${row.username}</td>
    <td>${row.quantity}</td>
  </tr>`).join('')}
  </tbody></table>` : ''}
  ${yourRankHtml}
</div>`;
}

export function renderLeaderboardPage() {
  const data = AppState.leaderboardData || {};
  const items = Object.keys(data).sort();

  return `
<div class="pg-title"><i class="ti ti-trophy"></i>Ranking</div>
<div class="pg-sub">Quem mais dropou cada item rastreado, entre todas as contas da guild.</div>

${AppState.isLeaderboardLoading ? '<div class="card"><div class="empty">Carregando...</div></div>' :
  !items.length ? '<div class="card"><div class="empty">Nenhum item rastreado com drops registrados ainda. Peça pro admin cadastrar itens em Admin → Itens do ranking, e conecte um arquivo de log com esses itens pra aparecer aqui.</div></div>' :
  items.map(itemName => renderItemCard(itemName, data[itemName])).join('')}`;
}
