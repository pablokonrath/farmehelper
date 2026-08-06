import { AppState } from '../state/app-state.js';
import { getActiveSessionSummary, computeDgComparison, computeResetWorth, computeRunsDoneToday, suggestForgottenSessionWindow, DAILY_RUN_LIMIT } from '../features/dg-session.js';
import { getItemPrice, isExcludedGearItem } from '../features/drops.js';
import { getExpectedItemNamesForDungeon } from '../features/item-dungeon-sources.js';
import { computeRouteComparison, suggestRouteForTime } from '../features/rush-routes.js';
import { renderDungeonOptionsGrouped } from '../features/dungeon-difficulty.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR, formatDuration, timeBreakdownTooltip } from '../utils/formatting.js';
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
// comparisonByDgId (Alz/run real de computeDgComparison) também dá o "Esperado x Já realizado" em
// Alz — não só contagem de runs, pra saber se o dia tá rendendo o que o plano previa.
function renderRushProgressCard(comparisonByDgId) {
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

  let expectedAlz = 0;
  let missingData = 0;
  rush.items.forEach(it => {
    const stat = comparisonByDgId[it.dungeonId];
    if (stat?.alzPerRun != null) expectedAlz += stat.alzPerRun * it.repetitions;
    else missingData++;
  });
  const plannedDgIds = new Set(rush.items.map(it => it.dungeonId));
  const realizedAlz = AppState.dgSessions
    .filter(s => s.date === today && plannedDgIds.has(s.dungeonId))
    .reduce((sum, s) => sum + s.totalAlz, 0);
  const pct = expectedAlz > 0 ? Math.round((realizedAlz / expectedAlz) * 100) : null;

  return `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-checklist"></i>Progresso do rush de hoje</div>
  <span class="badge ${doneCount >= rows.length ? 'badge-ok' : 'badge-acc'}">${doneCount}/${rows.length} feitas</span></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Conta as runs de verdade feitas hoje em cada DG (automático se você informou o tempo por run ao iniciar, ou o que preencher na mão) contra o planejado no rush.</div>
  ${expectedAlz > 0 ? `<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12px;margin-bottom:12px;padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px">
    <span>Esperado hoje (pelo seu Alz/run histórico): <strong style="color:var(--txt)" title="${formatNumber(expectedAlz)} Alz">${formatAlzGamer(expectedAlz)}</strong>${missingData ? ` <span style="color:var(--muted)">(${missingData} DG sem histórico, fora da conta)</span>` : ''}</span>
    <span>Já realizado nessas DGs: <strong style="color:${pct >= 100 ? 'var(--ok)' : 'var(--gold)'}" title="${formatNumber(realizedAlz)} Alz">${formatAlzGamer(realizedAlz)}</strong>${pct != null ? ` <span style="color:var(--muted)">(${pct}%)</span>` : ''}</span>
  </div>` : ''}
  <div style="display:flex;flex-direction:column;gap:6px">
    ${rows.map(({ it, runsToday, complete, partial }) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px${complete ? ';opacity:.65' : ''}">
      <i class="ti ti-${complete ? 'circle-check' : partial ? 'circle-half-2' : 'circle'}" style="font-size:18px;color:${complete ? 'var(--ok)' : partial ? 'var(--warn)' : 'var(--muted)'}"></i>
      <span style="flex:1${complete ? ';text-decoration:line-through;color:var(--muted)' : ';font-weight:600'}">${esc(it.name)}</span>
      <span class="badge ${complete ? 'badge-ok' : partial ? 'badge-warn' : 'badge-muted'}">${runsToday}/${it.repetitions}</span>
    </div>`).join('')}
  </div>
</div>`;
}

function timeHM(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Ícone da DG, se existir um arquivo icons/dungeons/<id>.png (o dono sobe manualmente, DG por
// DG — ver DEPLOY.md). Sem arquivo pra essa DG, cai num ícone genérico de espada via onerror,
// sem precisar checar existência no servidor antes.
function dgIcon(dungeonId, size = 26) {
  return `<img src="icons/dungeons/${dungeonId}.png" alt="" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:6px;flex-shrink:0" onerror="this.outerHTML='<i class=&quot;ti ti-sword&quot; style=&quot;font-size:${Math.round(size * 0.75)}px;color:var(--muted);width:${size}px;text-align:center;flex-shrink:0&quot;></i>'">`;
}

// Linha extra (escondida por padrão) com todos os itens que caíram na sessão, ordenados por valor.
function sessionItemsRow(s) {
  const expectedNames = getExpectedItemNamesForDungeon(s.dungeonId);
  // Sessões antigas (de antes do filtro de equipamento genérico) ainda podem ter esses itens
  // salvos no registro — filtra na hora de mostrar, sem precisar reprocessar o histórico.
  const rows = Object.entries(s.items || {})
    .filter(([name]) => !isExcludedGearItem(name))
    .map(([name, qty]) => ({ name, qty, value: getItemPrice(name) * qty, expected: expectedNames.has(name) }))
    .sort((a, b) => b.value - a.value);
  const alzPerRun = s.runs > 0 ? s.totalAlz / s.runs : null;
  const activeMs = s.activeDurationMs ?? s.durationMs;
  return `<tr><td colspan="10" style="background:var(--surf2);padding:14px 16px">
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:10px">
      <span>Melhor drop: <strong style="color:var(--txt)">${s.bestItem ? `${esc(s.bestItem.name)} (${formatAlzGamer(s.bestItem.price)})` : '—'}</strong></span>
      <span>Alz por run: <strong style="color:var(--gold)">${alzPerRun != null ? formatAlzGamer(alzPerRun) : '—'}</strong></span>
      <span>Alz por hora: <strong style="color:var(--txt)">${s.alzPerHour != null ? formatAlzGamer(s.alzPerHour) + '/h' : '—'}</strong></span>
      <span>Tempo ativo: <strong style="color:var(--txt)">${formatDuration(activeMs)}</strong> · relógio total: ${formatDuration(s.durationMs)}</span>
    </div>
    ${!rows.length ? '<div class="empty" style="padding:8px 0">Nenhum item registrado nesta sessão.</div>' : `
    ${expectedNames.size ? '<div style="font-size:11px;color:var(--gold);margin-bottom:8px"><i class="ti ti-star"></i> Itens com estrela são raridades desta DG (cadastro em Onde dropa).</div>' : ''}
    <table><thead><tr><th>Item</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>
    ${rows.map(r => `<tr${r.expected ? ' style="background:var(--gold-bg)"' : ''}>
      <td>${r.expected ? '<i class="ti ti-star" style="color:var(--gold);margin-right:5px" title="Raridade desta DG"></i>' : ''}${esc(r.name)}</td>
      <td>${r.qty}×</td>
      <td>${r.value ? renderAlzValue(r.value) : '<span style="color:var(--muted)">—</span>'}</td>
    </tr>`).join('')}
    </tbody></table>`}
  </td></tr>`;
}

// Uma linha do histórico (extraído pra reaproveitar dentro dos grupos por rota abaixo).
function sessionHistoryRow(s) {
  const expanded = !!AppState.expandedDgSessions[s.startAt];
  const dgExists = AppState.dungeonList.some(d => d.id === s.dungeonId);
  return `<tr>
        <td>${formatDateBR(s.date)}</td>
        <td><div style="display:flex;align-items:center;gap:8px">${dgIcon(s.dungeonId, 22)}<select class="inp inp-sm" style="width:150px" onchange="setSessionDungeon(${s.startAt}, this.value)" title="Trocar a DG desta sessão (ex: marcou a errada por engano)">
          ${!dgExists ? `<option value="${esc(s.dungeonId || '')}" selected>${esc(s.dungeonName)} (removida)</option>` : ''}
          ${renderDungeonOptionsGrouped(AppState.dungeonList, d => d.name, s.dungeonId)}
        </select></div></td>
        <td style="font-variant-numeric:tabular-nums">${timeHM(s.startAt)}–${timeHM(s.endAt)}</td>
        <td title="Relógio total: ${formatDuration(s.durationMs)}">${formatDuration(s.activeDurationMs ?? s.durationMs)}</td>
        <td><input class="inp" style="width:60px;padding:4px 6px" type="number" min="0" value="${s.runs || 0}" onchange="setSessionRuns(${s.startAt}, this.value)"></td>
        <td>${s.dropCount.toLocaleString('pt-BR')}<span style="color:var(--muted)"> · ${s.uniqueItems} un.</span></td>
        <td style="color:${getAlzTierColor(s.totalAlz)};font-weight:600" title="${formatNumber(s.totalAlz)} Alz">${formatAlzGamer(s.totalAlz)}</td>
        <td style="color:var(--gold);font-weight:600">${s.runs > 0 ? formatAlzGamer(s.totalAlz / s.runs) : '<span style="color:var(--muted);font-weight:400">— runs</span>'}</td>
        <td><button title="Ver itens" style="background:transparent;border:none;color:var(--acc);cursor:pointer;font-size:15px" onclick="toggleSessionItems(${s.startAt})"><i class="ti ti-chevron-${expanded ? 'up' : 'down'}"></i></button></td>
        <td><button title="Remover esta sessão (ex: ficou aberta por engano e distorce a média de tempo)" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteSession(${s.startAt})"><i class="ti ti-trash"></i></button></td>
      </tr>${expanded ? sessionItemsRow(s) : ''}`;
}

function sessionHistoryGroupHeader(label, sessions, isRoute) {
  const totalAlz = sessions.reduce((sum, s) => sum + s.totalAlz, 0);
  return `<tr><td colspan="10" style="background:${isRoute ? 'var(--gold-bg)' : 'var(--surf2)'};padding:7px 16px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:${isRoute ? 'var(--gold)' : 'var(--muted)'}">
    ${isRoute ? '<i class="ti ti-route"></i> ' : ''}${esc(label)} <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:.85">— ${sessions.length} sessão${sessions.length > 1 ? 'ões' : ''}${totalAlz ? ', ' + formatAlzGamer(totalAlz) : ''}</span>
  </td></tr>`;
}

// Agrupa o histórico do dia por rota — sessão de uma DG que fazia parte da rota aplicada no
// carrinho quando você iniciou (ver startDgSession em dg-session.js) fica junto sob o nome da
// rota; o resto (farme avulso, fora de qualquer rota) fica agrupado em "Avulsas" ao final. Só
// agrupa quando há pelo menos uma sessão de rota no dia — dia 100% avulso continua uma lista
// simples, sem cabeçalho redundante.
function renderSessionHistoryGroups(history) {
  const hasAnyRoute = history.some(s => s.routeName);
  if (!hasAnyRoute) return history.map(sessionHistoryRow).join('');

  const byRouteName = new Map();
  const avulsas = [];
  history.forEach(s => {
    if (!s.routeName) { avulsas.push(s); return; }
    if (!byRouteName.has(s.routeName)) byRouteName.set(s.routeName, []);
    byRouteName.get(s.routeName).push(s);
  });

  let html = '';
  byRouteName.forEach((sessions, routeName) => {
    html += sessionHistoryGroupHeader(routeName, sessions, true);
    html += sessions.map(sessionHistoryRow).join('');
  });
  if (avulsas.length) {
    html += sessionHistoryGroupHeader('Avulsas (fora de rota)', avulsas, false);
    html += avulsas.map(sessionHistoryRow).join('');
  }
  return html;
}

// Painel de "esqueci de marcar" — some se não sobrou nenhum drop fora de sessão pra recuperar.
function forgottenSessionRecoveryPanel() {
  const suggestion = suggestForgottenSessionWindow();
  const suggestionIsToday = suggestion && todayISODate(new Date(suggestion.suggestedStart)) === todayISODate();
  return `<div style="margin-top:12px;padding:12px;background:var(--surf2);border:1px dashed var(--border);border-radius:8px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px"><i class="ti ti-info-circle"></i> Usa os drops do log que já caíram sem sessão vinculada, do fim da sua última sessão encerrada (mesmo que tenha sido ontem) até agora. Ajuste o início se o log só passou a registrar depois que você já tinha entrado na DG.</div>
    ${!suggestion
      ? '<div class="empty" style="padding:8px 0">Nenhum drop fora de sessão desde então — nada pra recuperar.</div>'
      : `<div style="font-size:12px;color:var(--txt);margin-bottom:10px">${suggestion.dropCount} drop(s) encontrados, a partir de <strong>${suggestionIsToday ? '' : formatDateBR(todayISODate(new Date(suggestion.suggestedStart))) + ' '}${timeHM(suggestion.suggestedStart)}</strong>.</div>
      <div class="row" style="align-items:flex-end">
        <div style="flex:1"><label class="lbl">DG que era</label>
          <select class="inp" id="recoverDgSelect">
            ${renderDungeonOptionsGrouped(AppState.dungeonList)}
          </select></div>
        <div style="width:110px"><label class="lbl">Início (opcional)</label>
          <input class="inp" id="recoverStartTime" type="text" inputmode="numeric" placeholder="${timeHM(suggestion.suggestedStart)}" onfocus="this.value = this.value.replace(/\\D/g,'')" oninput="this.value = maskTimeInputBR(this.value)"></div>
        <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="recoverForgottenSession(document.getElementById('recoverDgSelect').value, document.getElementById('recoverStartTime').value)"><i class="ti ti-history"></i>Registrar sessão</button></div>
      </div>`}
  </div>`;
}

export function renderSessionsPage() {
  const active = getActiveSessionSummary();
  const comparison = computeDgComparison();
  const comparisonByDgId = {};
  comparison.forEach(c => { comparisonByDgId[c.dungeonId] = c; });
  const routeComparison = computeRouteComparison();
  const timeAvailableHours = Number(AppState.timeAvailableHours) || 0;
  const timeSuggestion = timeAvailableHours > 0 ? suggestRouteForTime(timeAvailableHours) : null;
  const today = todayISODate();
  const historyDate = AppState.sessionsHistoryDate || today;
  const history = AppState.dgSessions.filter(s => s.date === historyDate).reverse();

  const nowFarmingCard = `
<div class="card card-featured">
  <div class="ctitle"><i class="ti ti-crosshair" style="color:var(--gold)"></i>Farmando agora</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Opcional — marque o DG antes de começar e os drops que caírem entram no histórico daquele DG. Se não quiser marcar, é só farmar normal.</div>
  ${active
    ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:10px">
          ${dgIcon(AppState.activeDgSession.dungeonId, 34)}
          <div>
          <div style="font-weight:700;font-size:15px">${esc(active.dungeonName)}${AppState.activeDgSession.routeName ? ` <span style="font-size:11px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:.4px"><i class="ti ti-route"></i> ${esc(AppState.activeDgSession.routeName)}</span>` : ''}</div>
          <div id="dgLivePageBox" style="font-size:13px;color:var(--muted);margin-top:2px"></div>
          ${(() => {
            const expected = [...getExpectedItemNamesForDungeon(AppState.activeDgSession.dungeonId)];
            return expected.length ? `<div style="font-size:11px;color:var(--gold);margin-top:6px"><i class="ti ti-star"></i> Raros na mira: ${expected.map(esc).join(', ')}</div>` : '';
          })()}
          </div>
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
            ${renderDungeonOptionsGrouped(AppState.dungeonList)}
          </select></div>
        <div style="width:150px"><label class="lbl">Tempo por run (min)</label>
          <input class="inp" id="dgSessionRunMinutes" type="number" min="0" step="0.5" placeholder="opcional"></div>
        <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="startDgSession(document.getElementById('dgSessionSelect').value, document.getElementById('dgSessionRunMinutes').value)"><i class="ti ti-player-play"></i>Iniciar</button></div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px"><i class="ti ti-info-circle"></i> Informando o tempo por run, "Runs feitas" é contado sozinho pelo tempo ativo de farme. Sem isso, preencha na mão.</div>
      <button style="background:transparent;border:none;color:var(--muted);font-size:11px;cursor:pointer;text-decoration:underline;margin-top:10px;padding:0" onclick="toggleForgottenSessionRecovery()"><i class="ti ti-history-toggle"></i> Esqueceu de marcar uma sessão? Recuperar pelo log</button>
      ${AppState.forgottenSessionRecoveryOpen ? forgottenSessionRecoveryPanel() : ''}`}
</div>`;

  const totalSessionsEver = AppState.dgSessions.length;
  const earliestSessionDate = totalSessionsEver
    ? AppState.dgSessions.reduce((min, s) => (s.date && s.date < min ? s.date : min), AppState.dgSessions[0].date || today)
    : null;

  const comparisonCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-trophy"></i>Qual DG rende mais</div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Ordenado por <strong style="color:var(--gold)">Alz por run</strong> — como DG tem limite diário de entradas, o que decide onde gastar suas runs é o rendimento por run, não por hora. Informe as runs de cada sessão pra esta coluna aparecer.${totalSessionsEver ? ` Baseado em <strong style="color:var(--txt)">${totalSessionsEver} sessões</strong> registradas${earliestSessionDate ? ' desde ' + formatDateBR(earliestSessionDate) : ''} — o histórico não é mais apagado com o tempo.` : ''}</div>
  ${!comparison.length
    ? '<div class="empty">Marque um DG em “Farmando agora” e encerre a sessão para começar a comparar.</div>'
    : `<table><thead><tr><th style="width:36px">#</th><th>DG</th><th>Sessões</th><th>Runs</th><th>Tempo / run</th><th>Tempo total</th><th>Alz total</th><th>Alz / run</th><th>Alz / hora</th></tr></thead><tbody>
      ${comparison.map((c, i) => `<tr>
        <td class="rank">${i + 1}</td>
        <td style="font-weight:500">${esc(c.dungeonName)}</td>
        <td>${c.sessions}</td>
        <td>${c.runs || '—'}</td>
        <td style="color:var(--txt2)">${c.msPerRun != null ? formatDuration(c.msPerRun) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${formatDuration(c.durationMs)}</td>
        <td style="color:${getAlzTierColor(c.totalAlz)}" title="${formatNumber(c.totalAlz)} Alz">${formatAlzGamer(c.totalAlz)}</td>
        <td style="color:var(--gold);font-weight:700">${c.alzPerRun != null ? formatAlzGamer(c.alzPerRun) : '<span style="color:var(--muted);font-weight:400">informe as runs</span>'}</td>
        <td style="color:var(--muted)">${c.alzPerHour != null ? formatAlzGamer(c.alzPerHour) + '/h' : '—'}</td>
      </tr>`).join('')}
      </tbody></table>`}
</div>`;

  const routeComparisonCard = !routeComparison.length ? '' : `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-route"></i>Qual rota rende mais</div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Ordenado por <strong style="color:var(--gold)">Lucro/hora</strong> — uma rota mais longa pode ter lucro total maior sem ser a melhor forma de gastar seu tempo, então a comparação é por eficiência, não pelo lucro bruto. Lucro esperado = Alz/run histórico de cada DG (a coluna acima) × repetições da rota, menos o custo de rodar nos preços de hoje (já incluindo reset por gemas quando alguma DG passa de ${DAILY_RUN_LIMIT} runs e vale a pena resetar). Rota sem tempo estimado completo fica no fim, sem eficiência calculável ainda. Crie e edite rotas em DGs de rush diário.</div>
  <table><thead><tr><th style="width:36px">#</th><th>Rota</th><th>DGs</th><th>Tempo estimado</th><th>Retorno esperado</th><th>Custo</th><th>Lucro</th><th>Lucro/hora</th></tr></thead><tbody>
  ${routeComparison.map((r, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td style="font-weight:500">${esc(r.name)}${r.missingDataCount ? ` <i class="ti ti-alert-triangle" style="color:var(--warn)" title="${r.missingDataCount} DG(s) desta rota ainda sem sessão farmada com runs registradas — não entram no retorno esperado"></i>` : ''}${r.needsReset ? ` <i class="ti ti-sparkles" style="color:var(--warn)" title="Custo inclui reset por gemas — alguma DG desta rota passa de ${DAILY_RUN_LIMIT} runs"></i>` : ''}</td>
    <td>${r.dgCount}</td>
    <td>${r.estimatedTimeMs
      ? (r.hasTimeData
        ? `<span title="${esc(timeBreakdownTooltip(r.timeBreakdown))}">${formatDuration(r.estimatedTimeMs)}</span>`
        : `<span title="${esc(timeBreakdownTooltip(r.timeBreakdown) + (r.timeBreakdown.length ? '\n\n' : '') + 'Falta tempo/run farmado de: ' + r.missingTimeDataDgNames.join(', ') + ' — soma só das DGs com dado')}">≈${formatDuration(r.estimatedTimeMs)} <i class="ti ti-alert-triangle" style="color:var(--warn)"></i></span>`)
      : '<span style="color:var(--muted)">—</span>'}</td>
    <td style="color:${getAlzTierColor(r.expectedAlz)}" title="${formatNumber(r.expectedAlz)} Alz">${formatAlzGamer(r.expectedAlz)}</td>
    <td style="color:var(--muted)" title="${formatNumber(r.cost)} Alz">${formatAlzGamer(r.cost)}</td>
    <td style="color:${r.profit >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:700" title="${formatNumber(r.profit)} Alz">${r.profit >= 0 ? '+' : ''}${formatAlzGamer(r.profit)}</td>
    <td style="color:var(--gold);font-weight:700">${r.profitPerHour != null ? formatAlzGamer(r.profitPerHour) + '/h' : '<span style="color:var(--muted);font-weight:400">—</span>'}</td>
  </tr>`).join('')}
  </tbody></table>
</div>`;

  const timeSuggestionCard = `
<div class="card card-featured">
  <div class="ctitle"><i class="ti ti-clock" style="color:var(--gold)"></i>Quanto tempo você tem hoje?</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Sugere a rota salva de melhor Lucro/hora que cabe no tempo (tempo/run vem da média real das suas sessões) e completa a sobra com DGs avulsas pelas de melhor Alz/hora, sem deixar tempo disponível sem uso. Se nenhuma rota salva couber, monta um encaixe novo do zero, respeitando o limite de ${DAILY_RUN_LIMIT} runs/dia por DG.</div>
  <div class="row" style="margin-bottom:14px;align-items:flex-end">
    <div style="width:140px"><label class="lbl">Horas disponíveis</label><input class="inp" id="timeAvailableHoursInput" type="number" min="0" step="0.5" placeholder="ex: 3" value="${AppState.timeAvailableHours || ''}" onchange="setTimeAvailableHours(this.value)"></div>
  </div>
  ${!timeAvailableHours ? '' : !timeSuggestion || timeSuggestion.type === 'none'
    ? '<div class="empty">Ainda não há DG com runs e tempo suficientes farmados pra sugerir algo pro seu tempo.</div>'
    : timeSuggestion.type === 'saved' || timeSuggestion.type === 'saved+extra'
      ? `<div style="padding:12px;background:var(--surf2);border:1px solid var(--gold-border);border-radius:8px">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Rota salva que cabe no seu tempo:</div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="font-weight:700;font-size:15px;color:var(--gold)">${esc(timeSuggestion.name)}${timeSuggestion.needsReset ? ` <i class="ti ti-sparkles" style="color:var(--warn);font-size:13px" title="Inclui reset por gemas em alguma DG"></i>` : ''}</div>
            <button class="btn btn-p btn-xs" onclick="applySuggestedRoute()"><i class="ti ti-player-play"></i>Aplicar no carrinho</button>
          </div>
          ${timeSuggestion.type === 'saved+extra' ? `<div style="font-size:11px;color:var(--muted);margin-top:8px">A rota sozinha não usa todo seu tempo — completado com avulsas:</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
            ${timeSuggestion.extraItems.map(it => `<span class="badge badge-acc">${esc(it.dungeonName)} × ${it.repetitions}${it.usedReset ? ' <i class="ti ti-sparkles" title="Passa dos ' + DAILY_RUN_LIMIT + ' runs/dia — precisa resetar"></i>' : ''}</span>`).join('')}
          </div>` : ''}
          <div style="font-size:12px;color:var(--muted);margin-top:8px">Tempo estimado: <strong style="color:var(--txt)" title="${esc(timeBreakdownTooltip(timeSuggestion.timeBreakdown))}">${formatDuration(timeSuggestion.estimatedTimeMs)}</strong> · Lucro esperado: <strong style="color:${timeSuggestion.profit >= 0 ? 'var(--ok)' : 'var(--err)'}">${timeSuggestion.profit >= 0 ? '+' : ''}${formatAlzGamer(timeSuggestion.profit)}</strong></div>
        </div>`
      : `<div style="padding:12px;background:var(--surf2);border:1px solid var(--gold-border);border-radius:8px">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Nenhuma rota salva coube no tempo — encaixe novo montado pelas DGs de melhor Alz/hora:</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
            ${timeSuggestion.items.map(it => `<span class="badge badge-acc">${esc(it.dungeonName)} × ${it.repetitions}${it.usedReset ? ' <i class="ti ti-sparkles" title="Passa dos ' + DAILY_RUN_LIMIT + ' runs/dia — precisa resetar"></i>' : ''}</span>`).join('')}
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="font-size:12px;color:var(--muted)">Tempo estimado: <strong style="color:var(--txt)">${formatDuration(timeSuggestion.estimatedTimeMs)}</strong> · Lucro esperado: <strong style="color:${timeSuggestion.profit >= 0 ? 'var(--ok)' : 'var(--err)'}">${timeSuggestion.profit >= 0 ? '+' : ''}${formatAlzGamer(timeSuggestion.profit)}</strong></div>
            <button class="btn btn-p btn-xs" onclick="applySuggestedRoute()"><i class="ti ti-player-play"></i>Aplicar no carrinho</button>
          </div>
        </div>`}
</div>`;

  const historyCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-history"></i>Histórico de sessões</div>
    <div style="display:flex;align-items:center;gap:8px">
      ${historyDate !== today ? `<button class="btn btn-d btn-xs" onclick="setSessionsHistoryDate('${today}')">Hoje</button>` : ''}
      ${renderDateInputBR({ id: 'sessHistDate', value: historyDate, onChange: 'setSessionsHistoryDate' })}
    </div>
  </div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Mostra só o dia selecionado, agrupado por rota quando você iniciou a sessão com uma aplicada no carrinho (farme avulso fica junto em "Avulsas"). A <strong>Duração</strong> é o tempo <strong>ativo</strong> de farme — descontamos os intervalos longos sem drop (ex: o rush parou e você demorou a encerrar). Passe o mouse pra ver o relógio total. Marcou a DG errada? Troque direto no seletor da linha — os itens continuam os mesmos, só a etiqueta muda. Informe as runs e clique na seta pra ver os itens. Sessão errada (ex: ficou aberta por horas sem farmar) distorce a média de tempo daquele DG pra sempre — exclua pela lixeira.</div>
  ${!history.length
    ? `<div class="empty">Nenhuma sessão de DG encerrada em ${formatDateBR(historyDate)}.</div>`
    : `<table><thead><tr><th>Dia</th><th>DG</th><th>Horário</th><th>Duração</th><th>Runs</th><th>Drops</th><th>Alz</th><th>Alz / run</th><th style="width:36px"></th><th style="width:36px"></th></tr></thead><tbody>
      ${renderSessionHistoryGroups(history)}
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
${renderRushProgressCard(comparisonByDgId)}
${timeSuggestionCard}
${comparisonCard}
${routeComparisonCard}
${resetCard}
${historyCard}`;
}
