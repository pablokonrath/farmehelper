import { AppState } from '../state/app-state.js';

const MEDAL_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

export function renderLeaderboardPage() {
  const data = AppState.leaderboardData || {};
  const items = Object.keys(data).sort();

  return `
<div class="pg-title"><i class="ti ti-trophy"></i>Ranking</div>
<div class="pg-sub">Quem mais dropou cada item rastreado, entre todas as contas da guild.</div>

${AppState.isLeaderboardLoading ? '<div class="card"><div class="empty">Carregando...</div></div>' :
  !items.length ? '<div class="card"><div class="empty">Nenhum item rastreado com drops registrados ainda. Conecte um arquivo de log com itens da sua lista de "palavras rastreadas" (Cálculo de farme) pra aparecer aqui.</div></div>' :
  items.map(itemName => `
<div class="card">
  <div class="ctitle"><i class="ti ti-target-arrow"></i>${itemName}</div>
  <table><thead><tr><th style="width:50px">#</th><th>Usuário</th><th>Quantidade</th></tr></thead><tbody>
  ${data[itemName].map((row, i) => `<tr>
    <td>${i < 3 ? `<i class="ti ti-medal" style="color:${MEDAL_COLORS[i]}"></i>` : i + 1}</td>
    <td style="font-weight:${i === 0 ? '700' : '400'}">${row.username}</td>
    <td>${row.quantity}</td>
  </tr>`).join('')}
  </tbody></table>
</div>`).join('')}`;
}
