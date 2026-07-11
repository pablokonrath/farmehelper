import { AppState } from '../state/app-state.js';
import { getActiveSessionSummary, computeDgComparison } from '../features/dg-session.js';
import { getItemPrice } from '../features/drops.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR } from '../utils/formatting.js';

function formatDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '< 1min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function timeHM(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Linha extra (escondida por padrão) com todos os itens que caíram na sessão, ordenados por valor.
function sessionItemsRow(s) {
  const rows = Object.entries(s.items || {})
    .map(([name, qty]) => ({ name, qty, value: getItemPrice(name) * qty }))
    .sort((a, b) => b.value - a.value);
  const alzPerRun = s.runs > 0 ? s.totalAlz / s.runs : null;
  return `<tr><td colspan="9" style="background:var(--surf2);padding:14px 16px">
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:10px">
      <span>Melhor drop: <strong style="color:var(--txt)">${s.bestItem ? `${s.bestItem.name} (${formatAlzGamer(s.bestItem.price)})` : '—'}</strong></span>
      <span>Alz por run: <strong style="color:var(--gold)">${alzPerRun != null ? formatAlzGamer(alzPerRun) : '—'}</strong></span>
      <span>Alz por hora: <strong style="color:var(--txt)">${s.alzPerHour != null ? formatAlzGamer(s.alzPerHour) + '/h' : '—'}</strong></span>
    </div>
    ${!rows.length ? '<div class="empty" style="padding:8px 0">Nenhum item registrado nesta sessão.</div>' : `
    <table><thead><tr><th>Item</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td>${r.name}</td>
      <td>${r.qty}×</td>
      <td>${r.value ? renderAlzValue(r.value) : '<span style="color:var(--muted)">—</span>'}</td>
    </tr>`).join('')}
    </tbody></table>`}
  </td></tr>`;
}

export function renderSessionsPage() {
  const active = getActiveSessionSummary();
  const comparison = computeDgComparison();
  const history = [...AppState.dgSessions].reverse().slice(0, 30);

  const nowFarmingCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-crosshair" style="color:var(--gold)"></i>Farmando agora</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Opcional — marque o DG antes de começar e os drops que caírem entram no histórico daquele DG. Se não quiser marcar, é só farmar normal.</div>
  ${active
    ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-weight:700;font-size:15px">${active.dungeonName}</div>
          <div id="dgLivePageBox" style="font-size:13px;color:var(--muted);margin-top:2px"></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div><label class="lbl" style="margin:0 0 2px">Runs feitas</label>
            <input class="inp" style="width:80px" type="number" min="0" value="${AppState.activeDgSession.runs || 0}" onchange="setActiveSessionRuns(this.value)"></div>
          <div><label class="lbl" style="margin:0 0 2px">&nbsp;</label>
            <button class="btn" style="background:var(--err-bg);color:var(--err);border:none" onclick="endDgSession()"><i class="ti ti-player-stop"></i>Encerrar</button></div>
        </div>
      </div>`
    : `<div class="row" style="align-items:flex-end">
        <div style="flex:1"><label class="lbl">DG que vou farmar</label>
          <select class="inp" id="dgSessionSelect">
            ${AppState.dungeonList.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
          </select></div>
        <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="startDgSession(document.getElementById('dgSessionSelect').value)"><i class="ti ti-player-play"></i>Iniciar</button></div>
      </div>`}
</div>`;

  const comparisonCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-trophy"></i>Qual DG rende mais</div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Ordenado por <strong style="color:var(--gold)">Alz por run</strong> — como DG tem limite diário de entradas, o que decide onde gastar suas runs é o rendimento por run, não por hora. Informe as runs de cada sessão pra esta coluna aparecer.</div>
  ${!comparison.length
    ? '<div class="empty">Marque um DG em “Farmando agora” e encerre a sessão para começar a comparar.</div>'
    : `<table><thead><tr><th style="width:36px">#</th><th>DG</th><th>Sessões</th><th>Runs</th><th>Tempo total</th><th>Alz total</th><th>Alz / run</th><th>Alz / hora</th></tr></thead><tbody>
      ${comparison.map((c, i) => `<tr>
        <td class="rank">${i + 1}</td>
        <td style="font-weight:500">${c.dungeonName}</td>
        <td>${c.sessions}</td>
        <td>${c.runs || '—'}</td>
        <td>${formatDuration(c.durationMs)}</td>
        <td style="color:${getAlzTierColor(c.totalAlz)}" title="${formatNumber(c.totalAlz)} Alz">${formatAlzGamer(c.totalAlz)}</td>
        <td style="color:var(--gold);font-weight:700">${c.alzPerRun != null ? formatAlzGamer(c.alzPerRun) : '<span style="color:var(--muted);font-weight:400">informe as runs</span>'}</td>
        <td style="color:var(--muted)">${c.alzPerHour != null ? formatAlzGamer(c.alzPerHour) + '/h' : '—'}</td>
      </tr>`).join('')}
      </tbody></table>`}
</div>`;

  const historyCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-history"></i>Histórico de sessões</div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Informe as runs de cada sessão no campo, e clique na seta para ver todos os itens que caíram.</div>
  ${!history.length
    ? '<div class="empty">Nenhuma sessão de DG encerrada ainda.</div>'
    : `<table><thead><tr><th>Dia</th><th>DG</th><th>Horário</th><th>Duração</th><th>Runs</th><th>Drops</th><th>Alz</th><th>Alz / run</th><th style="width:36px"></th></tr></thead><tbody>
      ${history.map(s => {
        const expanded = !!AppState.expandedDgSessions[s.startAt];
        return `<tr>
        <td>${formatDateBR(s.date)}</td>
        <td style="font-weight:500">${s.dungeonName}</td>
        <td style="font-variant-numeric:tabular-nums">${timeHM(s.startAt)}–${timeHM(s.endAt)}</td>
        <td>${formatDuration(s.durationMs)}</td>
        <td><input class="inp" style="width:60px;padding:4px 6px" type="number" min="0" value="${s.runs || 0}" onchange="setSessionRuns(${s.startAt}, this.value)"></td>
        <td>${s.dropCount.toLocaleString('pt-BR')}<span style="color:var(--muted)"> · ${s.uniqueItems} un.</span></td>
        <td style="color:${getAlzTierColor(s.totalAlz)};font-weight:600" title="${formatNumber(s.totalAlz)} Alz">${formatAlzGamer(s.totalAlz)}</td>
        <td style="color:var(--gold);font-weight:600">${s.runs > 0 ? formatAlzGamer(s.totalAlz / s.runs) : '<span style="color:var(--muted);font-weight:400">— runs</span>'}</td>
        <td><button title="Ver itens" style="background:transparent;border:none;color:var(--acc);cursor:pointer;font-size:15px" onclick="toggleSessionItems(${s.startAt})"><i class="ti ti-chevron-${expanded ? 'up' : 'down'}"></i></button></td>
      </tr>${expanded ? sessionItemsRow(s) : ''}`;
      }).join('')}
      </tbody></table>`}
</div>`;

  return `
<div class="pg-title">Sessões de farme</div>
<div class="pg-sub">Marque o DG que está farmando e veja, por dungeon, quanto rende por run — pra decidir onde gastar suas entradas limitadas do dia (as 20, ou o que resetar por gemas).</div>
${nowFarmingCard}
${comparisonCard}
${historyCard}`;
}
