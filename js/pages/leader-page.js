import { AppState } from '../state/app-state.js';
import { formatNumber } from '../utils/formatting.js';

const PERIODS = [['today', 'Hoje'], ['week', 'Semana'], ['month', 'Mês']];

// "há 4 min" / "há 2h" / "ontem" / "12/07" — quando o membro foi visto pela última vez.
function formatLastSeen(iso) {
  if (!iso) return 'nunca entrou';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return diffD === 1 ? 'ontem' : `há ${diffD} dias`;
}

export function renderLeaderPage() {
  const data = AppState.guildPanelData;

  const guildSelector = AppState.isMasterAdmin && AppState.guilds.length
    ? `<div style="width:200px"><label class="lbl">Guild</label>
        <select class="inp" onchange="setGuildPanelGuild(this.value)">
          <option value=""${AppState.guildPanelGuild ? '' : ' selected'}>Minha guild</option>
          ${AppState.guilds.map(g => { const name = typeof g === 'string' ? g : g.name; return `<option value="${name}"${AppState.guildPanelGuild === name ? ' selected' : ''}>${name}</option>`; }).join('')}
        </select></div>`
    : '';

  const periodTabs = `<div style="display:flex;gap:8px">${PERIODS.map(([v, label]) =>
    `<button class="btn ${(AppState.guildPanelPeriod || 'today') === v ? 'btn-p' : 'btn-d'}" onclick="setGuildPanelPeriod('${v}')">${label}</button>`).join('')}</div>`;

  const header = `
<div class="pg-title"><i class="ti ti-shield-star" style="color:var(--gold)"></i>Painel do líder</div>
<div class="pg-sub">Visão da guild em tempo real: quem está online e quanto cada um dropou (itens do ranking) no período. O valor em Alz continua privado de cada jogador.</div>
<div class="card">
  <div class="sh" style="align-items:flex-end;flex-wrap:wrap;gap:12px">
    ${guildSelector || '<div></div>'}
    ${periodTabs}
  </div>
</div>`;

  if (AppState.isGuildPanelLoading && !data) {
    return header + '<div class="empty" style="padding:50px 0"><i class="ti ti-loader"></i> Carregando painel…</div>';
  }
  if (!data) {
    return header + '<div class="empty" style="padding:50px 0">Não foi possível carregar o painel da guild.</div>';
  }

  const guildLabel = data.guild ? data.guild : 'Sem guild';

  const kpis = `
<div class="g3" style="margin-bottom:12px">
  <div class="kpi"><div class="kpi-lbl">Online agora</div><div class="kpi-val" style="color:var(--ok)">${data.onlineCount}<span style="font-size:13px;color:var(--muted)"> / ${data.memberCount}</span></div></div>
  <div class="kpi"><div class="kpi-lbl">Farmando no período</div><div class="kpi-val" style="color:var(--acc)">${data.activeCount}</div><div class="kpi-sub">membros com drop</div></div>
  <div class="kpi"><div class="kpi-lbl">Drops da guild</div><div class="kpi-val" style="color:var(--gold)">${formatNumber(data.totalDrops)}</div><div class="kpi-sub">itens do ranking no período</div></div>
</div>`;

  const table = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-users"></i>${guildLabel} <span style="color:var(--muted);font-size:12px;font-weight:400;margin-left:4px">${data.memberCount} membros</span></div></div>
  ${!data.members.length
    ? '<div class="empty">Nenhum membro nesta guild ainda.</div>'
    : `<table><thead><tr><th style="width:36px">#</th><th>Jogador</th><th>Status</th><th>Drops no período</th></tr></thead><tbody>
      ${data.members.map((m, i) => `<tr${m.online ? ' style="background:var(--ok-bg)"' : ''}>
        <td class="rank">${i + 1}</td>
        <td style="font-weight:500">${m.username}${m.username === AppState.currentUsername ? ' <span style="color:var(--muted);font-size:11px">(você)</span>' : ''}</td>
        <td>${m.online
          ? '<span class="badge badge-ok"><i class="ti ti-point-filled"></i> Online</span>'
          : `<span style="color:var(--muted);font-size:12px">${formatLastSeen(m.lastSeenAt)}</span>`}</td>
        <td style="font-weight:600${m.totalDrops > 0 ? '' : ';color:var(--muted)'}">${m.totalDrops > 0 ? formatNumber(m.totalDrops) : '—'}</td>
      </tr>`).join('')}
      </tbody></table>`}
</div>`;

  const breakdown = data.itemBreakdown || [];
  const itemsCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-diamond"></i>Itens do ranking — quem dropou</div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Itens do ranking que caíram na guild no período, com quem tirou cada um. Ordenado pelos mais dropados.</div>
  ${!breakdown.length
    ? '<div class="empty">Nenhum item do ranking dropado no período.</div>'
    : `<table><thead><tr><th>Item</th><th style="width:60px">Total</th><th>Quem dropou</th></tr></thead><tbody>
      ${breakdown.map(it => `<tr>
        <td style="font-weight:500">${it.itemName}</td>
        <td style="font-weight:600;color:var(--gold)">${it.total}</td>
        <td><div style="display:flex;flex-wrap:wrap;gap:5px">${it.droppers.map(d => `<span class="badge badge-muted">${d.username}${d.qty > 1 ? ' ×' + d.qty : ''}</span>`).join('')}</div></td>
      </tr>`).join('')}
      </tbody></table>`}
</div>`;

  return header + kpis + table + itemsCard;
}
