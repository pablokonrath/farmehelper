import { AppState } from '../state/app-state.js';
import { getActiveSessionSummary, computeDgComparison, computeResetWorth, computeRunsDoneToday } from '../features/dg-session.js';
import { getItemPrice } from '../features/drops.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR } from '../utils/formatting.js';
import { renderDateInputBR } from '../utils/date-input.js';
import { todayISODate } from '../utils/parsing.js';
import { esc } from '../utils/escape.js';
import { renderPage } from '../router.js';

// Qual dia o histórico de sessões está mostrando (default hoje, navegável pra dias anteriores).
export function setSessionsHistoryDate(value) {
  AppState.sessionsHistoryDate = value;
  renderPage();
}

// Progresso do rush de hoje: cruza o rush salvo do dia com as runs de fato feitas hoje em cada DG
// (computeRunsDoneToday soma sessões encerradas + a ativa) contra o planejado — fração real, não
// um booleano "existe sessão" (isso marcava uma DG de 20 repetições como feita com só 1 run).
function renderRushProgressCard() {
  const today = todayISODate();
  const rush = AppState.rushHistory[today];
  if (!rush || !rush.items || !rush.items.length) return '';
  const rows = rush.items.map(it => {
    const runsToday = computeRunsDoneToday(it.name);
    const complete = it.repetitions > 0 && runsToday >= it.repetitions;
    const partial = runsToday > 0 && !complete;
    return { it, runsToday, complete, partial };
  });
  const doneCount = rows.filter(r => r.complete).length;
  return `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-checklist"></i>Progresso do rush de hoje</div>
  <span class="badge ${doneCount >= rows.length ? 'badge-ok' : 'badge-acc'}">${doneCount}/${rows.length} feitas</span></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Conta as runs de verdade feitas hoje em cada DG (automático se você informou o tempo por run ao iniciar, ou o que preencher na mão) contra o planejado no rush.</div>
  <div style="display:flex;flex-direction:column;gap:6px">
    ${rows.map(({ it, runsToday, complete, partial }) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px${complete ? ';opacity:.65' : ''}">
      <i class="ti ti-${complete ? 'circle-check' : partial ? 'circle-half-2' : 'circle'}" style="font-size:18px;color:${complete ? 'var(--ok)' : partial ? 'var(--warn)' : 'var(--muted)'}"></i>
      <span style="flex:1${complete ? ';text-decoration:line-through;color:var(--muted)' : ';font-weight:600'}">${esc(it.name)}</span>
      <span class="badge ${complete ? 'badge-ok' : partial ? 'badge-warn' : 'badge-muted'}">${runsToday}/${it.repetitions}</span>
    </div>`).join('')}
  </div>
</div>`;
}

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
  const activeMs = s.activeDurationMs ?? s.durationMs;
  return `<tr><td colspan="9" style="background:var(--surf2);padding:14px 16px">
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:10px">
      <span>Melhor drop: <strong style="color:var(--txt)">${s.bestItem ? `${esc(s.bestItem.name)} (${formatAlzGamer(s.bestItem.price)})` : '—'}</strong></span>
      <span>Alz por run: <strong style="color:var(--gold)">${alzPerRun != null ? formatAlzGamer(alzPerRun) : '—'}</strong></span>
      <span>Alz por hora: <strong style="color:var(--txt)">${s.alzPerHour != null ? formatAlzGamer(s.alzPerHour) + '/h' : '—'}</strong></span>
      <span>Tempo ativo: <strong style="color:var(--txt)">${formatDuration(activeMs)}</strong> · relógio total: ${formatDuration(s.durationMs)}</span>
    </div>
    ${!rows.length ? '<div class="empty" style="padding:8px 0">Nenhum item registrado nesta sessão.</div>' : `
    <table><thead><tr><th>Item</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td>${esc(r.name)}</td>
      <td>${r.qty}×</td>
      <td>${r.value ? renderAlzValue(r.value) : '<span style="color:var(--muted)">—</span>'}</td>
    </tr>`).join('')}
    </tbody></table>`}
  </td></tr>`;
}

export function renderSessionsPage() {
  const active = getActiveSessionSummary();
  const comparison = computeDgComparison();
  const today = todayISODate();
  const historyDate = AppState.sessionsHistoryDate || today;
  const history = AppState.dgSessions.filter(s => s.date === historyDate).reverse();

  const nowFarmingCard = `
<div class="card card-featured">
  <div class="ctitle"><i class="ti ti-crosshair" style="color:var(--gold)"></i>Farmando agora</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Opcional — marque o DG antes de começar e os drops que caírem entram no histórico daquele DG. Se não quiser marcar, é só farmar normal.</div>
  ${active
    ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-weight:700;font-size:15px">${esc(active.dungeonName)}</div>
          <div id="dgLivePageBox" style="font-size:13px;color:var(--muted);margin-top:2px"></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div><label class="lbl" style="margin:0 0 2px">Runs feitas${AppState.activeDgSession.runMinutes > 0 && !AppState.activeDgSession.runsManuallySet ? ' <span style="color:var(--acc);font-weight:400">(auto)</span>' : ''}</label>
            <input class="inp" id="dgRunsInput" style="width:80px" type="number" min="0" value="${AppState.activeDgSession.runs || 0}" onchange="setActiveSessionRuns(this.value)"></div>
          <div><label class="lbl" style="margin:0 0 2px">&nbsp;</label>
            <button class="btn" style="background:var(--err-bg);color:var(--err);border:none" onclick="endDgSession()"><i class="ti ti-player-stop"></i>Encerrar</button></div>
        </div>
      </div>`
    : `<div class="row" style="align-items:flex-end">
        <div style="flex:1"><label class="lbl">DG que vou farmar</label>
          <select class="inp" id="dgSessionSelect">
            ${AppState.dungeonList.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}
          </select></div>
        <div style="width:150px"><label class="lbl">Tempo por run (min)</label>
          <input class="inp" id="dgSessionRunMinutes" type="number" min="0" step="0.5" placeholder="opcional"></div>
        <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="startDgSession(document.getElementById('dgSessionSelect').value, document.getElementById('dgSessionRunMinutes').value)"><i class="ti ti-player-play"></i>Iniciar</button></div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px"><i class="ti ti-info-circle"></i> Informando o tempo por run, "Runs feitas" é contado sozinho pelo tempo ativo de farme. Sem isso, preencha na mão.</div>`}
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
        <td style="font-weight:500">${esc(c.dungeonName)}</td>
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
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-history"></i>Histórico de sessões</div>
    <div style="display:flex;align-items:center;gap:8px">
      ${historyDate !== today ? `<button class="btn btn-d btn-xs" onclick="setSessionsHistoryDate('${today}')">Hoje</button>` : ''}
      ${renderDateInputBR({ id: 'sessHistDate', value: historyDate, onChange: 'setSessionsHistoryDate' })}
    </div>
  </div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Mostra só o dia selecionado. A <strong>Duração</strong> é o tempo <strong>ativo</strong> de farme — descontamos os intervalos longos sem drop (ex: o rush parou e você demorou a encerrar). Passe o mouse pra ver o relógio total. Marcou a DG errada? Troque direto no seletor da linha — os itens continuam os mesmos, só a etiqueta muda. Informe as runs e clique na seta pra ver os itens.</div>
  ${!history.length
    ? `<div class="empty">Nenhuma sessão de DG encerrada em ${formatDateBR(historyDate)}.</div>`
    : `<table><thead><tr><th>Dia</th><th>DG</th><th>Horário</th><th>Duração</th><th>Runs</th><th>Drops</th><th>Alz</th><th>Alz / run</th><th style="width:36px"></th></tr></thead><tbody>
      ${history.map(s => {
        const expanded = !!AppState.expandedDgSessions[s.startAt];
        const dgExists = AppState.dungeonList.some(d => d.id === s.dungeonId);
        return `<tr>
        <td>${formatDateBR(s.date)}</td>
        <td><select class="inp inp-sm" style="width:150px" onchange="setSessionDungeon(${s.startAt}, this.value)" title="Trocar a DG desta sessão (ex: marcou a errada por engano)">
          ${!dgExists ? `<option value="${esc(s.dungeonId || '')}" selected>${esc(s.dungeonName)} (removida)</option>` : ''}
          ${AppState.dungeonList.map(d => `<option value="${esc(d.id)}"${d.id === s.dungeonId ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select></td>
        <td style="font-variant-numeric:tabular-nums">${timeHM(s.startAt)}–${timeHM(s.endAt)}</td>
        <td title="Relógio total: ${formatDuration(s.durationMs)}">${formatDuration(s.activeDurationMs ?? s.durationMs)}</td>
        <td><input class="inp" style="width:60px;padding:4px 6px" type="number" min="0" value="${s.runs || 0}" onchange="setSessionRuns(${s.startAt}, this.value)"></td>
        <td>${s.dropCount.toLocaleString('pt-BR')}<span style="color:var(--muted)"> · ${s.uniqueItems} un.</span></td>
        <td style="color:${getAlzTierColor(s.totalAlz)};font-weight:600" title="${formatNumber(s.totalAlz)} Alz">${formatAlzGamer(s.totalAlz)}</td>
        <td style="color:var(--gold);font-weight:600">${s.runs > 0 ? formatAlzGamer(s.totalAlz / s.runs) : '<span style="color:var(--muted);font-weight:400">— runs</span>'}</td>
        <td><button title="Ver itens" style="background:transparent;border:none;color:var(--acc);cursor:pointer;font-size:15px" onclick="toggleSessionItems(${s.startAt})"><i class="ti ti-chevron-${expanded ? 'up' : 'down'}"></i></button></td>
      </tr>${expanded ? sessionItemsRow(s) : ''}`;
      }).join('')}
      </tbody></table>`}
</div>`;

  const rc = AppState.resetConfig;
  const reset = computeResetWorth();
  const resetCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-refresh"></i>Vale a pena resetar?</div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Resetar o limite do DG custa gemas. Só compensa se o líquido por run (Alz do drop menos o custo de entrada) superar o custo do reset rateado por run.</div>
  <div class="g4" style="margin-bottom:14px">
    <div><label class="lbl">Valor da gema (Alz)</label><input class="inp" type="text" inputmode="numeric" placeholder="ex: 60.000" value="${rc.gemValueAlz ? formatNumber(rc.gemValueAlz) : ''}" oninput="maskAlzInputLive(this)" onchange="setResetConfig('gemValueAlz', this.value)"></div>
    <div><label class="lbl">Valor do ticket (Alz)</label><input class="inp" type="text" inputmode="numeric" placeholder="opcional" value="${rc.ticketValueAlz ? formatNumber(rc.ticketValueAlz) : ''}" oninput="maskAlzInputLive(this)" onchange="setResetConfig('ticketValueAlz', this.value)"></div>
    <div><label class="lbl">Custo do reset (gemas)</label><input class="inp" type="number" min="0" value="${rc.resetCostGems}" onchange="setResetConfig('resetCostGems', this.value)"></div>
    <div><label class="lbl">Runs por reset</label><input class="inp" type="number" min="1" value="${rc.runsPerReset}" onchange="setResetConfig('runsPerReset', this.value)"></div>
  </div>
  ${!reset.gemValueSet
    ? '<div class="empty">Informe o valor da gema (em Alz) para calcular — o reset é pago em gemas.</div>'
    : `<div style="font-size:13px;margin-bottom:12px">Cada run extra via reset custa <strong style="color:var(--err)">${formatAlzGamer(reset.resetCostPerRun)}</strong>. Um DG só vale resetar se o líquido por run passar disso.</div>
    ${!reset.rows.length
      ? '<div class="empty">Nenhum DG com runs informadas ainda — preencha as runs no histórico acima.</div>'
      : `<table><thead><tr><th>DG</th><th>Alz / run</th><th>Custo de entrada / run</th><th>Líquido / run</th><th>Após reset</th><th>Veredito</th></tr></thead><tbody>
        ${reset.rows.map(r => `<tr>
          <td style="font-weight:500">${esc(r.dungeonName)}</td>
          <td>${formatAlzGamer(r.alzPerRun)}</td>
          <td style="color:var(--muted)">${formatAlzGamer(r.entryCostPerRun)}</td>
          <td style="color:${r.netAlzPerRun >= 0 ? 'var(--txt)' : 'var(--err)'}">${formatAlzGamer(r.netAlzPerRun)}</td>
          <td style="color:${r.profitAfterReset >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:600">${r.profitAfterReset >= 0 ? '+' : ''}${formatAlzGamer(r.profitAfterReset)}</td>
          <td>${r.worth ? '<span class="badge badge-ok"><i class="ti ti-check"></i> Vale resetar</span>' : '<span class="badge" style="background:var(--err-bg);color:var(--err)"><i class="ti ti-x"></i> Não compensa</span>'}</td>
        </tr>`).join('')}
        </tbody></table>`}`}
</div>`;

  return `
<div class="pg-title"><i class="ti ti-shield" style="color:var(--acc)"></i>Sessões de farme</div>
<div class="pg-sub">Marque o DG que está farmando e veja, por dungeon, quanto rende por run — pra decidir onde gastar suas entradas limitadas do dia (as 20, ou o que resetar por gemas).</div>
${nowFarmingCard}
${renderRushProgressCard()}
${comparisonCard}
${resetCard}
${historyCard}`;
}
