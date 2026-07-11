import { AppState } from '../state/app-state.js';
import { getActiveSessionSummary, computeDgComparison } from '../features/dg-session.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, formatDateBR } from '../utils/formatting.js';

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

export function renderSessionsPage() {
  const active = getActiveSessionSummary();
  const comparison = computeDgComparison();
  const history = [...AppState.dgSessions].reverse().slice(0, 20);

  const nowFarmingCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-crosshair" style="color:var(--gold)"></i>Farmando agora</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Opcional — marque o DG antes de começar e os drops que caírem entram no histórico daquele DG. Se não quiser marcar, é só farmar normal.</div>
  ${active
    ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:15px">${active.dungeonName}</div>
          <div id="dgLivePageBox" style="font-size:13px;color:var(--muted);margin-top:2px"></div>
        </div>
        <button class="btn" style="background:var(--err-bg);color:var(--err);border:none" onclick="endDgSession()"><i class="ti ti-player-stop"></i>Encerrar sessão</button>
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
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Média de Alz por hora de cada DG que você marcou, do maior pro menor — onde seu tempo de macro rende melhor.</div>
  ${!comparison.length
    ? '<div class="empty">Marque um DG em “Farmando agora” e encerre a sessão para começar a comparar.</div>'
    : `<table><thead><tr><th style="width:36px">#</th><th>DG</th><th>Sessões</th><th>Tempo total</th><th>Alz total</th><th>Alz / hora</th></tr></thead><tbody>
      ${comparison.map((c, i) => `<tr>
        <td class="rank">${i + 1}</td>
        <td style="font-weight:500">${c.dungeonName}</td>
        <td>${c.sessions}</td>
        <td>${formatDuration(c.durationMs)}</td>
        <td style="color:${getAlzTierColor(c.totalAlz)}" title="${formatNumber(c.totalAlz)} Alz">${formatAlzGamer(c.totalAlz)}</td>
        <td style="color:var(--gold);font-weight:700">${c.alzPerHour != null ? formatAlzGamer(c.alzPerHour) + '/h' : '—'}</td>
      </tr>`).join('')}
      </tbody></table>`}
</div>`;

  const historyCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-history"></i>Histórico de sessões</div></div>
  ${!history.length
    ? '<div class="empty">Nenhuma sessão de DG encerrada ainda.</div>'
    : `<table><thead><tr><th>Dia</th><th>DG</th><th>Horário</th><th>Duração</th><th>Drops</th><th>Alz</th><th>Alz / hora</th><th>Melhor drop</th></tr></thead><tbody>
      ${history.map(s => `<tr>
        <td>${formatDateBR(s.date)}</td>
        <td style="font-weight:500">${s.dungeonName}</td>
        <td style="font-variant-numeric:tabular-nums">${timeHM(s.startAt)}–${timeHM(s.endAt)}</td>
        <td>${formatDuration(s.durationMs)}</td>
        <td>${s.dropCount.toLocaleString('pt-BR')}<span style="color:var(--muted)"> · ${s.uniqueItems} un.</span></td>
        <td style="color:${getAlzTierColor(s.totalAlz)};font-weight:600" title="${formatNumber(s.totalAlz)} Alz">${formatAlzGamer(s.totalAlz)}</td>
        <td style="color:var(--gold)">${s.alzPerHour != null ? formatAlzGamer(s.alzPerHour) + '/h' : '—'}</td>
        <td>${s.bestItem ? `${s.bestItem.name} <span style="color:var(--muted)">(${formatAlzGamer(s.bestItem.price)})</span>` : '<span style="color:var(--muted)">—</span>'}</td>
      </tr>`).join('')}
      </tbody></table>`}
</div>`;

  return `
<div class="pg-title">Sessões de farme</div>
<div class="pg-sub">Marque o DG que está farmando e veja, por dungeon, quanto rende por hora — pra decidir onde vale a pena gastar seu tempo de macro.</div>
${nowFarmingCard}
${comparisonCard}
${historyCard}`;
}
