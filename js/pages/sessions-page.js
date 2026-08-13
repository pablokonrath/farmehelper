import { AppState } from '../state/app-state.js';
import { getActiveSessionSummary, computeDgComparison, computeResetWorth, computeRunsDoneToday, suggestForgottenSessionWindow, findUnclaimedDropWindows, computeBestFarmingHours, sessionTotalAlz, suggestRunMinutes, DAILY_RUN_LIMIT, RECENT_SESSIONS_FOR_TREND } from '../features/dg-session.js';
import { getItemPrice, isExcludedGearItem } from '../features/drops.js';
import { getExpectedItemNamesForDungeon } from '../features/item-dungeon-sources.js';
import { computeRouteComparison, suggestRouteForTime, buildGeneratedRoute } from '../features/rush-routes.js';
import { getCostPerGem } from '../features/rush-cart.js';
import { renderDungeonOptionsGrouped } from '../features/dungeon-difficulty.js';
import { infoToggle } from '../features/ui-toggles.js';
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

// Bruto ou líquido na tabela "Qual DG rende mais" (ver comparisonCard).
export function setDgComparisonMode(liquido) {
  AppState.dgComparisonShowNet = !!liquido;
  renderPage();
}

// Histórico inteiro ou só os últimos 30 dias em "Qual DG rende mais" (ver comparisonCard). Só
// muda a EXIBIÇÃO dessa tabela — rota, "vale resetar" e a sugestão por tempo continuam sobre o
// histórico inteiro, pra não mudar o resultado de outros cards sem o jogador esperar isso.
export function setDgComparisonPeriod(days) {
  AppState.dgComparisonPeriodDays = parseInt(days, 10) === 30 ? 30 : 0;
  renderPage();
}

// Progresso do rush de hoje: cruza o rush salvo do dia com as runs de fato feitas hoje em cada DG
// (computeRunsDoneToday soma sessões encerradas + a ativa) contra o planejado — fração real, não
// um booleano "existe sessão" (isso marcava uma DG de 20 repetições como feita com só 1 run).
// comparisonByDgId (Alz/run real de computeDgComparison) também dá o "Esperado x Já realizado" em
// Alz — não só contagem de runs, pra saber se o dia tá rendendo o que o plano previa.
//
// comparisonAllTime (sorted, ver computeDgComparison): quando o rush termina 100%, aponta a
// melhor DG do histórico como próximo passo — sem isso, "rush concluído" fica sem dizer o que
// fazer com o tempo que sobrou, e é exatamente a pergunta que essa página existe pra responder.
function renderRushProgressCard(comparisonByDgId, comparisonAllTime) {
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
  const allDone = doneCount >= rows.length;
  const melhorDg = allDone ? comparisonAllTime.find(c => c.alzPerRun != null) : null;

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
    .reduce((sum, s) => sum + sessionTotalAlz(s), 0);
  const pct = expectedAlz > 0 ? Math.round((realizedAlz / expectedAlz) * 100) : null;

  return `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-checklist"></i>Progresso do rush de hoje</div>
  <span class="badge ${allDone ? 'badge-ok' : 'badge-acc'}">${doneCount}/${rows.length} feitas</span></div>
  ${infoToggle('sessions-rush-progress', 'Conta as runs de verdade feitas hoje em cada DG (automático se você informou o tempo por run ao iniciar, ou o que preencher na mão) contra o planejado no rush.')}
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
  ${melhorDg ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)"><i class="ti ti-circle-check" style="color:var(--ok)"></i> Rush concluído! Sobrou tempo? <strong style="color:var(--txt)">${esc(melhorDg.dungeonName)}</strong> é sua melhor entrada no histórico (${formatAlzGamer(melhorDg.alzPerRun)}/run).</div>` : ''}
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
  // Sessão sem DG não tem ícone pra buscar — vai direto no fallback em vez de pedir um 404 a cada
  // renderização (esta página re-renderiza a cada drop novo).
  if (!dungeonId) return `<i class="ti ti-help-circle" style="font-size:${Math.round(size * 0.75)}px;color:var(--warn);width:${size}px;text-align:center;flex-shrink:0"></i>`;
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
  const alzPerRun = s.runs > 0 ? sessionTotalAlz(s) / s.runs : null;
  const activeMs = s.activeDurationMs ?? s.durationMs;
  return `<tr class="t-detail"><td colspan="10" style="background:var(--surf2);padding:14px 16px">
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:10px">
      <span>Melhor drop: <strong style="color:var(--txt)">${s.bestItem ? `${esc(s.bestItem.name)} (${formatAlzGamer(s.bestItem.price)})` : '—'}</strong></span>
      <span>Alz por run: <strong style="color:var(--gold)">${alzPerRun != null ? formatAlzGamer(alzPerRun) : '—'}</strong></span>
      <span>Alz por hora: <strong style="color:var(--txt)">${s.alzPerHour != null ? formatAlzGamer(s.alzPerHour) + '/h' : '—'}</strong></span>
      <span>Tempo ativo: <strong style="color:var(--txt)">${formatDuration(activeMs)}</strong> · relógio total: ${formatDuration(s.durationMs)}</span>
    </div>
    ${!rows.length ? '<div class="empty" style="padding:8px 0">Nenhum item registrado nesta sessão.</div>' : `
    ${expectedNames.size ? '<div style="font-size:11px;color:var(--epic);margin-bottom:8px"><i class="ti ti-star"></i> Itens em roxo são raridades desta DG — o que você cadastrou em Onde dropa, mais o que o seu próprio histórico mostra cair em poucas runs.</div>' : ''}
    <table><thead><tr><th>Item</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>
    ${rows.map(r => `<tr${r.expected ? ' style="background:var(--epic-bg)"' : ''}>
      <td${r.expected ? ' style="color:var(--epic);font-weight:700"' : ''}>${r.expected ? '<i class="ti ti-star" style="color:var(--epic);margin-right:5px" title="Raridade desta DG"></i>' : ''}${esc(r.name)}</td>
      <td>${r.qty}×</td>
      <td>${r.value ? renderAlzValue(r.value) : '<span style="color:var(--muted)">—</span>'}</td>
    </tr>`).join('')}
    </tbody></table>`}
  </td></tr>`;
}

// Preenche o "Tempo por run" com a mediana do histórico da DG escolhida, e explica de onde veio.
// Chamado ao trocar a DG no seletor e uma vez ao abrir a página (ver router.js) — sem isso, o
// campo continuaria vazio e a contagem automática de runs seguiria sendo uma função que existe
// mas ninguém usa, porque exige saber de cabeça quanto demora cada DG.
export function fillSuggestedRunMinutes() {
  const select = document.getElementById('dgSessionSelect');
  const input = document.getElementById('dgSessionRunMinutes');
  const hint = document.getElementById('runMinutesHint');
  if (!select || !input) return;

  const s = suggestRunMinutes(select.value);
  // Não sobrescreve o que o jogador digitou: só preenche campo vazio ou o valor que nós mesmos
  // sugerimos pra DG anterior (marcado em dataset.suggested).
  const podeSobrescrever = !input.value || input.value === input.dataset.suggested;
  if (s && podeSobrescrever) {
    input.value = s.minutes;
    input.dataset.suggested = String(s.minutes);
  }
  if (!hint) return;
  hint.innerHTML = s
    ? `<i class="ti ti-wand"></i> Sugerido pelo seu histórico: <strong>${String(s.minutes).replace('.', ',')}min</strong> por run — mediana de ${s.sessions} sessão(ões), ${s.runs.toLocaleString('pt-BR')} run(s). Ajuste se hoje estiver diferente.`
    : `<span style="color:var(--muted)"><i class="ti ti-info-circle"></i> Sem histórico com runs preenchidas nessa DG ainda — preencha as runs ao encerrar e da próxima vez ele já sugere o tempo sozinho.</span>`;
}

// Selo de "esfriando" com a CAUSA, não só o aviso (ver coolingCause em computeDgComparison). As
// duas causas possíveis pedem reações opostas, então mostrar qual é transforma o alerta em
// decisão: caiu o volume → a DG está pior, considere trocar; piorou a composição → ela dropa o
// mesmo tanto, só que de coisa mais barata, e trocar de DG pode não resolver nada.
function coolingBadge(c) {
  const base = `${formatAlzGamer(c.recentAlzPerRun)}/run nas últimas sessões, contra ${formatAlzGamer(c.alzPerRun)}/run na média`;
  if (!c.coolingCause) {
    return ` <i class="ti ti-trending-down" style="color:var(--warn)" title="Esfriando: ${base}."></i>`;
  }
  const { tipo, recentPerRun, overallPerRun } = c.coolingCause;
  const n = v => v.toFixed(1).replace('.', ',');
  const detalhe = tipo === 'volume'
    ? `Caiu o VOLUME: ${n(recentPerRun)} itens/run agora, contra ${n(overallPerRun)} na média. A DG está dropando menos — considere trocar.`
    : `Piorou a COMPOSIÇÃO: o volume se manteve (${n(recentPerRun)} itens/run, média ${n(overallPerRun)}), mas o que cai agora vale menos. Trocar de DG pode não resolver.`;
  return ` <i class="ti ti-trending-down" style="color:var(--warn)" title="Esfriando: ${base}.&#10;&#10;${detalhe}"></i>`;
}

// Campo de anotação da sessão (ver setSessionNote em dg-session.js). Discreto quando vazio — é
// exceção, não rotina: a maioria das sessões não precisa de explicação nenhuma.
function sessionNoteCell(s) {
  const has = !!s.note;
  return `<input class="inp inp-sm" style="width:130px;${has ? '' : 'opacity:.45;'}border-style:dashed"
    value="${esc(s.note || '')}" maxlength="120" placeholder="anotar…"
    title="${has ? esc(s.note) : 'Anote o que fez essa sessão sair fora do padrão (lag, teste, evento) — não entra em nenhuma conta'}"
    onchange="setSessionNote(${s.startAt}, this.value)">`;
}

// Uma linha do histórico (extraído pra reaproveitar dentro dos grupos por rota abaixo).
function sessionHistoryRow(s) {
  const expanded = !!AppState.expandedDgSessions[s.startAt];
  const dgExists = AppState.dungeonList.some(d => d.id === s.dungeonId);
  return `<tr>
        <td data-label="Dia">${formatDateBR(s.date)}</td>
        <td data-label="DG"><div style="display:flex;align-items:center;gap:8px">${dgIcon(s.dungeonId, 22)}<select class="inp inp-sm" style="width:150px${s.dungeonId ? '' : ';border-color:var(--warn);color:var(--warn)'}" onchange="setSessionDungeon(${s.startAt}, this.value)" title="${s.dungeonId ? 'Trocar a DG desta sessão (ex: marcou a errada por engano)' : 'Esta sessão foi aberta sozinha e ainda não tem DG — ela fica fora de todas as médias até você escolher'}">
          ${!s.dungeonId ? '<option value="" selected>— qual DG? —</option>' : ''}
          ${s.dungeonId && !dgExists ? `<option value="${esc(s.dungeonId)}" selected>${esc(s.dungeonName)} (removida)</option>` : ''}
          ${renderDungeonOptionsGrouped(AppState.dungeonList, d => d.name, s.dungeonId)}
        </select></div></td>
        <td data-label="Horário" style="font-variant-numeric:tabular-nums">${timeHM(s.startAt)}–${timeHM(s.endAt)}</td>
        <td data-label="Duração" title="Relógio total: ${formatDuration(s.durationMs)}">${formatDuration(s.activeDurationMs ?? s.durationMs)}</td>
        <td data-label="Runs"><input class="inp" style="width:60px;padding:4px 6px" type="number" min="0" value="${s.runs || 0}" onchange="setSessionRuns(${s.startAt}, this.value)"></td>
        <td data-label="Drops">${s.dropCount.toLocaleString('pt-BR')}<span style="color:var(--muted)"> · ${s.uniqueItems} un.</span></td>
        <td data-label="Alz" style="color:${getAlzTierColor(sessionTotalAlz(s))};font-weight:600" title="${formatNumber(sessionTotalAlz(s))} Alz">${formatAlzGamer(sessionTotalAlz(s))}</td>
        <td data-label="Alz / run" style="color:var(--gold);font-weight:600">${s.runs > 0 ? formatAlzGamer(sessionTotalAlz(s) / s.runs) : '<span style="color:var(--muted);font-weight:400">— runs</span>'}</td>
        <td data-label="Anotação">${sessionNoteCell(s)}</td>
        <td><div style="display:flex;gap:10px;align-items:center">
          <button aria-label="${expanded ? 'Esconder' : 'Ver'} itens desta sessão" title="Ver itens" style="background:transparent;border:none;color:var(--acc);cursor:pointer;font-size:15px" onclick="toggleSessionItems(${s.startAt})"><i class="ti ti-chevron-${expanded ? 'up' : 'down'}"></i> <span style="font-size:11px">itens</span></button>
          <button aria-label="Remover esta sessão" title="Remover esta sessão (ex: ficou aberta por engano e distorce a média de tempo)" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteSession(${s.startAt})"><i class="ti ti-trash"></i></button>
        </div></td>
      </tr>${expanded ? sessionItemsRow(s) : ''}`;
}

function sessionHistoryGroupHeader(label, sessions, isRoute) {
  const totalAlz = sessions.reduce((sum, s) => sum + sessionTotalAlz(s), 0);
  return `<tr class="t-group"><td colspan="10" style="background:${isRoute ? 'var(--gold-bg)' : 'var(--surf2)'};padding:7px 16px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:${isRoute ? 'var(--gold)' : 'var(--muted)'}">
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

// Lixeira de sessões. O toast de desfazer dura segundos — bom pro erro percebido na hora, inútil
// pro percebido depois. Sessão é farme de verdade, então some daqui só quando você mandar (ou
// quando o limite de 10 empurrar a mais antiga pra fora). Some da tela quando está vazia.
function renderDeletedSessionsBin() {
  const lixeira = AppState.deletedSessions || [];
  if (!lixeira.length) return '';
  return `
  <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700;margin-bottom:8px">
      <i class="ti ti-trash"></i> Excluídas recentemente <span style="font-weight:400;text-transform:none;letter-spacing:0">— dá pra restaurar</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${lixeira.map(s => `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:7px 10px;background:var(--surf2);border:1px solid var(--border);border-radius:6px;font-size:12px">
        <span style="font-weight:600">${esc(s.dungeonName || "Sem DG")}</span>
        <span style="color:var(--muted)">${formatDateBR(s.date)} · ${timeHM(s.startAt)}–${timeHM(s.endAt)} · ${s.dropCount} drops · ${formatAlzGamer(sessionTotalAlz(s))}</span>
        <span style="margin-left:auto;display:flex;gap:6px">
          <button class="btn btn-d btn-xs" onclick="restoreDeletedSession(${s.startAt})"><i class="ti ti-arrow-back-up"></i>Restaurar</button>
          <button class="btn btn-xs" style="background:var(--err-bg);color:var(--err);border:none" title="Apagar definitivamente" onclick="purgeDeletedSession(${s.startAt})"><i class="ti ti-trash"></i></button>
        </span>
      </div>`).join('')}
    </div>
  </div>`;
}

// Painel de "esqueci de marcar" — some se não sobrou nenhum drop fora de sessão pra recuperar.
// Blocos de farme do dia que não estão em nenhuma sessão. É a "sigla faltando": todo drop dentro
// da janela de uma sessão pertence àquela DG, e o que sobra não pertence a ninguém — inclusive o
// farme de uma sessão que você excluiu, que volta pra cá em vez de sumir.
function unclaimedWindowsPanel(dateISO) {
  const janelas = findUnclaimedDropWindows(dateISO);
  if (!janelas.length) return '';
  const ehHoje = dateISO === todayISODate();

  // As sessões do dia entram no topo do mesmo seletor, como alvo de "juntar". Nem todo bloco órfão
  // é uma sessão que faltou: às vezes é um pedaço de uma sessão que JÁ existe (o log demorou a
  // registrar, ou você parou um pouco mais que o limite de inatividade). Criar uma segunda sessão
  // da mesma DG nesse caso partiria o farme em dois e estragaria o Alz/run dos dois pedaços.
  // O prefixo "s:" no value distingue os dois alvos — id de DG nunca tem esse formato.
  const sessoesDoDia = AppState.dgSessions
    .filter(s => s.date === dateISO)
    .sort((a, b) => a.startAt - b.startAt);
  const grupoJuntar = !sessoesDoDia.length ? [] : [{
    label: 'Juntar a uma sessão já registrada',
    dungeons: sessoesDoDia.map(s => ({ id: `s:${s.startAt}`, name: `${s.dungeonName || "Sem DG"} · ${timeHM(s.startAt)}–${timeHM(s.endAt)}` })),
  }];
  return `<div style="margin-top:12px">
    <div style="font-size:12px;color:var(--txt);margin-bottom:8px"><i class="ti ti-alert-triangle" style="color:var(--gold)"></i> <strong>${janelas.length} bloco(s) de farme ${ehHoje ? 'de hoje' : `de ${formatDateBR(dateISO)}`} sem DG.</strong> Estão no log mas fora de qualquer sessão — escolha a DG pra cada um e eles entram nas médias.</div>
    ${janelas.map(j => `<div style="padding:10px;background:var(--surf2);border:1px dashed var(--border);border-radius:8px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px;margin-bottom:8px">
        <span><strong>${timeHM(j.startAt)} – ${timeHM(j.endAt)}</strong> · ${j.dropCount} drop(s)</span>
        <span style="color:var(--gold);font-weight:600">${formatAlzGamer(j.totalAlz)}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px">${esc(j.items.join(' · '))}</div>
      <div class="row" style="align-items:flex-end">
        <div style="flex:1"><select class="inp inp-sm" id="unclaimedDg${j.startAt}">${renderDungeonOptionsGrouped(AppState.dungeonList, d => d.name, null, grupoJuntar)}</select></div>
        <div><button class="btn btn-p btn-sm" onclick="applyUnclaimedWindow(document.getElementById('unclaimedDg${j.startAt}').value, ${j.startAt}, ${j.endAt})"><i class="ti ti-history"></i>Aplicar</button></div>
      </div>
    </div>`).join('')}
  </div>`;
}

function forgottenSessionRecoveryPanel() {
  const suggestion = suggestForgottenSessionWindow();
  const suggestionIsToday = suggestion && todayISODate(new Date(suggestion.suggestedStart)) === todayISODate();
  return `<div style="margin-top:12px;padding:12px;background:var(--surf2);border:1px dashed var(--border);border-radius:8px">
    ${infoToggle('sessions-forgotten-recovery', 'Usa os drops do log que já caíram sem sessão vinculada, do fim da sua última sessão encerrada (mesmo que tenha sido ontem) até agora. Ajuste o início se o log só passou a registrar depois que você já tinha entrado na DG.')}
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
  // Uma varredura só do histórico (nunca purgado, ver comentário em computeDgComparison), reusada
  // por tudo que precisa dela nesta renderização — antes, rota + reset + sugestão por tempo cada
  // uma recalculava por conta própria, chegando a 5-6 varreduras do mesmo AppState.dgSessions numa
  // única renderização, e isso repete a cada ~5s enquanto você farma com esta página aberta (todo
  // drop novo re-renderiza a página, ver file-source.js).
  const comparisonAllTime = computeDgComparison();
  const comparisonByDgId = {};
  comparisonAllTime.forEach(c => { comparisonByDgId[c.dungeonId] = c; });
  const reset = computeResetWorth(comparisonAllTime);
  const routeComparison = computeRouteComparison(comparisonAllTime);
  const timeAvailableHours = Number(AppState.timeAvailableHours) || 0;
  const timeSuggestion = timeAvailableHours > 0 ? suggestRouteForTime(timeAvailableHours, comparisonAllTime) : null;
  // A montagem do zero é calculada SEMPRE, não só quando nenhuma rota salva cabe. Antes ela ficava
  // escondida de quem tem rotas salvas — o card sempre mostrava uma delas e a opção de montar na
  // hora nunca chegava à tela. Agora as duas aparecem juntas, com o lucro de cada uma à vista.
  const generatedRoute = timeAvailableHours > 0 && timeSuggestion?.type !== 'generated'
    ? buildGeneratedRoute(timeAvailableHours * 3600000, comparisonAllTime)
    : null;
  const today = todayISODate();
  const historyDate = AppState.sessionsHistoryDate || today;
  const history = AppState.dgSessions.filter(s => s.date === historyDate).reverse();

  // DGs do rush de hoje que ainda não completaram as repetições planejadas — vão fixadas no topo
  // do seletor (só priorizando, nunca escondendo o resto: dia de farmar fora do plano acontece).
  const rushToday = AppState.rushHistory[today];
  const pendingRushDungeons = !rushToday?.items?.length ? [] : rushToday.items
    .map(it => {
      const dg = AppState.dungeonList.find(d => d.id === it.dungeonId || d.name === it.name);
      if (!dg) return null;
      const done = computeRunsDoneToday(it.name);
      return done >= it.repetitions ? null : { dg, faltam: it.repetitions - done };
    })
    .filter(Boolean);
  const rushPriorityGroups = !pendingRushDungeons.length ? [] : [{
    label: `Do rush de hoje — faltam ${pendingRushDungeons.length} DG(s)`,
    dungeons: pendingRushDungeons.map(p => p.dg),
    labelFn: dg => {
      const p = pendingRushDungeons.find(x => x.dg.id === dg.id);
      return `${dg.name} — faltam ${p.faltam} run${p.faltam > 1 ? 's' : ''}`;
    },
  }];

  // Ponte entre a sessão ativa e "Vale a pena resetar?" — sem isso são duas ferramentas que não
  // se falam: você tinha que sair daqui, rolar até o card de reset lá embaixo e fazer a conta de
  // cabeça bem na hora em que ela importa (perto do limite diário). Só aparece quando faltam
  // poucas runs E resetar de fato compensa pelo histórico — não é um lembrete genérico.
  const resetNudge = (() => {
    if (!active) return '';
    // Sessão ainda sem DG não tem limite diário pra comparar — e computeRunsDoneToday casaria
    // com as outras sessões sem DG, somando runs de farmes que não têm nada a ver.
    if (!AppState.activeDgSession.dungeonId) return '';
    const runsLeft = DAILY_RUN_LIMIT - computeRunsDoneToday(active.dungeonName);
    if (!(runsLeft > 0 && runsLeft <= 5)) return '';
    const row = reset.gemValueSet && reset.rows.find(r => r.dungeonName === active.dungeonName);
    if (!row?.worth) return '';
    return `<div style="margin-top:12px;padding:10px 12px;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:8px;font-size:12px;color:var(--warn)"><i class="ti ti-refresh"></i> Faltam <strong>${runsLeft} run${runsLeft > 1 ? 's' : ''}</strong> pro limite diário desta DG, e resetar compensa pelo seu histórico (líquido de ${formatAlzGamer(row.netAlzPerRun)}/run cobre o custo do reset). Veja "Vale a pena resetar?" mais abaixo.</div>`;
  })();

  const nowFarmingCard = `
<div class="card card-featured">
  <div class="ctitle"><i class="ti ti-crosshair" style="color:var(--gold)"></i>Farmando agora</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Opcional — marque o DG antes de começar e os drops que caírem entram no histórico daquele DG. Se não marcar, o FarmHub abre uma sessão sozinho assim que os drops começam a cair — e encerra sozinho quando eles param, no horário do último drop (dá pra desligar abaixo).</div>
  ${active
    ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:10px">
          ${dgIcon(AppState.activeDgSession.dungeonId, 34)}
          <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${/* Seletor no lugar do nome fixo: com a sessão abrindo sozinha, corrigir a DG é a
                 ação mais provável aqui — antes exigia encerrar e ir consertar no histórico. */''}
            ${/* Sem DG definida, o seletor precisa de um item vazio SELECIONADO: senão o navegador
                 mostra a primeira DG da lista e o card mente, dizendo que a sessão é dela. */''}
            <select class="inp" style="width:200px;font-weight:700${AppState.activeDgSession.dungeonId ? '' : ';border-color:var(--warn);color:var(--warn)'}" onchange="setActiveSessionDungeon(this.value)" title="Trocar a DG desta sessão — os drops continuam os mesmos, só muda a que DG eles são atribuídos">
              ${AppState.activeDgSession.dungeonId ? '' : '<option value="" selected>— qual DG? —</option>'}
              ${renderDungeonOptionsGrouped(AppState.dungeonList, undefined, AppState.activeDgSession.dungeonId)}
            </select>
            ${AppState.activeDgSession.routeName ? `<span style="font-size:11px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:.4px"><i class="ti ti-route"></i> ${esc(AppState.activeDgSession.routeName)}</span>` : ''}
          </div>
          <div id="dgLivePageBox" style="font-size:13px;color:var(--muted);margin-top:4px"></div>
          ${!AppState.activeDgSession.dungeonId
            ? `<div style="font-size:11px;color:var(--warn);margin-top:6px"><i class="ti ti-clock-play"></i> <strong>O tempo já está contando</strong> — abri no primeiro drop pra não perder farme. Falta só dizer a DG no seletor acima. Se cair um item que só existe numa DG, eu marco sozinho.</div>`
            : AppState.activeDgSession.autoStarted ? `<div style="font-size:11px;color:var(--warn);margin-top:6px"><i class="ti ti-alert-triangle"></i> Aberta automaticamente — confira a DG no seletor acima. Trocar ali já corrige, sem precisar encerrar.</div>` : ''}
          ${(() => {
            const expected = [...getExpectedItemNamesForDungeon(AppState.activeDgSession.dungeonId)];
            return expected.length ? `<div style="font-size:11px;color:var(--epic);margin-top:6px"><i class="ti ti-star"></i> Raros na mira: ${expected.map(esc).join(', ')}</div>` : '';
          })()}
          ${/* A contagem automática de runs depende de "Min / run" estar preenchido. Quando não
               está, ela simplesmente não acontece — e antes não havia NADA na tela dizendo isso,
               então o contador parado parecia defeito. Agora ele diz o que falta e por quê. */''}
          ${AppState.activeDgSession.runMinutes > 0 ? '' : `<div style="font-size:11px;color:var(--warn);margin-top:6px"><i class="ti ti-calculator-off"></i> <strong>Runs não estão sendo contadas sozinhas</strong> — falta o tempo por run em "Min / run" ao lado.${AppState.activeDgSession.dungeonId
            ? ' Ainda não tenho histórico com runs preenchidas nessa DG pra sugerir sozinho: digite uma vez e, ao encerrar, eu já aprendo pra próxima.'
            : ' Escolha a DG acima que eu tento preencher pelo seu histórico.'} Ou use o <strong>+1</strong> a cada run — ele também ensina o ritmo.</div>`}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div><label class="lbl" style="margin:0 0 2px">Runs feitas${AppState.activeDgSession.runMinutes > 0 && !AppState.activeDgSession.runsManuallySet ? ' <span style="color:var(--acc);font-weight:400">(auto)</span>' : ' <span style="color:var(--warn);font-weight:400">(manual)</span>'}</label>
            <div style="display:flex;gap:4px;align-items:center">
              <input class="inp" id="dgRunsInput" style="width:70px" type="number" min="0" value="${AppState.activeDgSession.runs || 0}" onchange="setActiveSessionRuns(this.value)">
              ${/* O jeito mais confiável de informar é o próprio jogador dizer "acabei uma agora" —
                   e cada clique recalibra o ritmo, então a contagem se ajusta sozinha com o uso. */''}
              <button class="btn btn-d btn-xs" onclick="bumpActiveSessionRuns()" title="Acabei mais uma run — soma 1 e recalibra o ritmo">+1</button>
            </div></div>
          ${/* Tempo por run editável DURANTE a sessão: a sugestão do histórico é ponto de partida,
               e se hoje a DG está saindo mais lenta, corrigir aqui recoloca a contagem no trilho
               sem precisar encerrar. */''}
          <div><label class="lbl" style="margin:0 0 2px">Min / run</label>
            <input class="inp" style="width:78px${AppState.activeDgSession.runMinutes > 0 ? '' : ';border-color:var(--warn)'}" type="number" min="0" step="0.5" placeholder="—" value="${AppState.activeDgSession.runMinutes || ''}" onchange="setActiveSessionRunMinutes(this.value)" title="Tempo médio de cada run. Preenchido, as runs são contadas sozinhas pelo tempo ativo."></div>
          <div><label class="lbl" style="margin:0 0 2px">&nbsp;</label>
            <button class="btn" style="background:var(--err-bg);color:var(--err);border:none" onclick="endDgSession()"><i class="ti ti-player-stop"></i>Encerrar</button></div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">
        <i class="ti ti-info-circle"></i> ${AppState.activeDgSession.runMinutes > 0 && !AppState.activeDgSession.runsManuallySet
          ? `Contando sozinho a ${String(AppState.activeDgSession.runMinutes).replace('.', ',')}min por run. <strong>Não bateu com as entradas do inventário?</strong> Corrija o número (ou use o +1) — eu recalibro o ritmo pelo valor certo e sigo contando daí.`
          : 'Contagem manual: informe o tempo por run ao lado, ou corrija "Runs feitas" com a sessão já andada — a partir daí eu conto sozinho no ritmo certo.'}
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <label class="lbl" style="margin-bottom:6px">Itens caindo agora</label>
        <div id="dgLiveItemsBox" style="display:flex;flex-wrap:wrap;gap:6px"></div>
      </div>
      ${resetNudge}`
    : `<div class="row" style="align-items:flex-end">
        <div style="flex:1"><label class="lbl">DG que vou farmar</label>
          <select class="inp" id="dgSessionSelect" onchange="fillSuggestedRunMinutes()">
            ${renderDungeonOptionsGrouped(AppState.dungeonList, undefined, AppState.pendingSessionDungeonId || null, rushPriorityGroups)}
          </select></div>
        <div style="width:150px"><label class="lbl">Tempo por run (min)</label>
          <input class="inp" id="dgSessionRunMinutes" type="number" min="0" step="0.5" placeholder="opcional"></div>
        <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="startDgSession(document.getElementById('dgSessionSelect').value, document.getElementById('dgSessionRunMinutes').value);clearPendingSessionDungeon()"><i class="ti ti-player-play"></i>Iniciar</button></div>
      </div>
      <div id="runMinutesHint" style="font-size:11px;color:var(--gold);margin-top:8px"></div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px"><i class="ti ti-info-circle"></i> Com o tempo por run preenchido, "Runs feitas" é contado sozinho — e ele já vem sugerido pelo seu próprio histórico naquela DG, quando existe. Cada sessão que você encerra melhora a próxima sugestão.${pendingRushDungeons.length ? ' As DGs que ainda faltam no rush de hoje aparecem no topo da lista e saem de lá conforme você completa as runs.' : ''}</div>
      <label class="tgl-row" style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:var(--muted);cursor:pointer">
        <label class="tgl"><input type="checkbox" aria-label="Cuidar da sessão sozinho" ${AppState.autoSessionEnabled ? 'checked' : ''} onchange="toggleAutoSessionStart(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
        Cuidar da sessão sozinho (abre quando começo a farmar, encerra quando os drops param)
      </label>
      ${AppState.autoSessionEnabled ? `<div class="row" style="align-items:center;margin-top:10px;flex-wrap:wrap">
        <div style="width:170px"><label class="lbl">Encerrar após (min) sem drop</label>
          <input class="inp inp-sm" type="number" min="1" value="${AppState.sessionIdleCloseMinutes}" onchange="setSessionIdleCloseMinutes(this.value)"></div>
        <div style="flex:1;min-width:240px;font-size:11px;color:var(--muted)">Esse tempo vale pra todas as DGs, do jeito que você colocar. Se os drops voltarem dentro de ${AppState.sessionIdleCloseMinutes * 3}min <em>e</em> os itens indicarem que é o mesmo farme, ele <strong>retoma a mesma sessão</strong> e o intervalo parado não entra no tempo — na dúvida ele abre outra, porque juntar farme de duas DGs seria pior. <strong>Deixe folgado o bastante pra cobrir uma run inteira</strong> da DG mais lenta que você faz.</div>
      </div>` : ''}
      <button style="background:transparent;border:none;color:var(--muted);font-size:11px;cursor:pointer;text-decoration:underline;margin-top:10px;padding:0" onclick="toggleForgottenSessionRecovery()"><i class="ti ti-history-toggle"></i> Esqueceu de marcar uma sessão? Recuperar pelo log</button>
      ${AppState.forgottenSessionRecoveryOpen ? forgottenSessionRecoveryPanel() : ''}`}
</div>`;

  const totalSessionsEver = AppState.dgSessions.length;
  const earliestSessionDate = totalSessionsEver
    ? AppState.dgSessions.reduce((min, s) => (s.date && s.date < min ? s.date : min), AppState.dgSessions[0].date || today)
    : null;

  // Janela de exibição: Tudo (padrão) ou só os últimos 30 dias — SÓ recalcula quando o toggle não
  // é o padrão, pra não custar uma segunda varredura do histórico à toa na maioria das vezes.
  // Rota, "vale resetar" e a sugestão por tempo continuam sobre comparisonAllTime — de propósito,
  // ver comentário em setDgComparisonPeriod.
  const dgPeriodDays = AppState.dgComparisonPeriodDays === 30 ? 30 : 0;
  const comparison = dgPeriodDays
    ? computeDgComparison({ sinceDate: todayISODate(new Date(Date.now() - dgPeriodDays * 86400000)) })
    : comparisonAllTime;

  // Líquido reordena por netAlzPerRun em vez do bruto de computeDgComparison — SÓ pra exibição
  // desta tabela (uma cópia). O array original continua ordenado por bruto pra quem mais usa
  // ele (rota, "o que fazer agora" da Visão geral), sem herdar uma troca de critério que eles
  // não pediram.
  const liquidoDg = !!AppState.dgComparisonShowNet;
  const comparisonSorted = !liquidoDg ? comparison
    : [...comparison].sort((x, y) => (y.netAlzPerRun ?? -1) - (x.netAlzPerRun ?? -1));
  const gemValueSet = getCostPerGem() > 0;
  const temDgComGema = comparison.some(c => {
    const dg = AppState.dungeonList.find(d => d.id === c.dungeonId);
    return dg?.gemsPerRun > 0;
  });

  const botaoDgMode = (v, txt) => `<button class="btn btn-xs ${liquidoDg === v ? 'btn-p' : 'btn-d'}" onclick="setDgComparisonMode(${v})">${txt}</button>`;
  const botaoDgPeriodo = (v, txt) => `<button class="btn btn-xs ${dgPeriodDays === v ? 'btn-p' : 'btn-d'}" onclick="setDgComparisonPeriod(${v})">${txt}</button>`;
  const comparisonCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-trophy"></i>Qual DG rende mais</div>
    <div style="display:flex;gap:6px">${botaoDgMode(false, 'Bruto')}${botaoDgMode(true, 'Líquido')}</div></div>
  <div style="display:flex;gap:6px;margin:-4px 0 10px">${botaoDgPeriodo(0, 'Tudo')}${botaoDgPeriodo(30, 'Últimos 30 dias')}</div>
  ${infoToggle('sessions-comparison', `Ordenado por <strong style="color:var(--gold)">Alz por run</strong> — como DG tem limite diário de entradas, o que decide onde gastar suas runs é o rendimento por run, não por hora. Informe as runs de cada sessão pra esta coluna aparecer. <strong>Líquido</strong> desconta o custo de entrada da run (Alz + tickets + gemas, os mesmos valores de <a href="#" onclick="navigateTo('rush');return false" style="color:var(--acc);text-decoration:underline">Parâmetros do dia</a> que o carrinho de rush usa de verdade) — é a mesma conta de "Vale a pena resetar?" abaixo, só que aplicada em toda DG, não só nas que valem resetar. <strong>Últimos 30 dias</strong> ignora sessão mais antiga que isso — o histórico completo nunca é apagado, então uma DG que rendia bem há meses pode continuar no topo do "Tudo" mesmo que o mercado já tenha mudado; esse toggle só afeta esta tabela, não rota/reset/sugestão por tempo abaixo. O ícone <i class="ti ti-trending-down" style="color:var(--warn)"></i> ao lado do nome avisa quando as últimas ${RECENT_SESSIONS_FOR_TREND} sessões dessa DG renderam bem menos que a média mostrada — o mesmo alerta, mas linha a linha em vez de precisar trocar a janela inteira.${totalSessionsEver ? ` Baseado em <strong style="color:var(--txt)">${totalSessionsEver} sessões</strong> registradas${earliestSessionDate ? ' desde ' + formatDateBR(earliestSessionDate) : ''} — o histórico não é mais apagado com o tempo.` : ''}`)}
  ${liquidoDg && !gemValueSet && temDgComGema ? `<div style="font-size:11px;color:var(--warn);margin-bottom:10px"><i class="ti ti-alert-triangle"></i> Preço do Card Cash não configurado em <a href="#" onclick="navigateTo('rush');return false" style="color:var(--acc);text-decoration:underline">Parâmetros do dia</a> — o custo de entrada em gemas de algumas DGs ainda não entra nesta conta.</div>` : ''}
  ${!comparison.length
    ? '<div class="empty">Marque um DG em “Farmando agora” e encerre a sessão para começar a comparar.</div>'
    : `<table class="t-cards"><thead><tr><th style="width:36px">#</th><th>DG</th><th>Sessões</th><th>Runs</th><th>Tempo / run</th><th>Tempo total</th>${liquidoDg ? '<th>Custo entrada / run</th>' : ''}<th>Alz total</th><th>Alz / run</th><th>Alz / hora</th></tr></thead><tbody>
      ${comparisonSorted.map((c, i) => `<tr>
        <td class="rank">${i + 1}</td>
        <td data-label="DG" style="font-weight:500">${esc(c.dungeonName)}${c.cooling ? coolingBadge(c) : ''}</td>
        <td data-label="Sessões">${c.sessions}</td>
        <td data-label="Runs">${c.runs || '—'}</td>
        <td data-label="Tempo / run" style="color:var(--txt2)">${c.msPerRun != null ? formatDuration(c.msPerRun) : '<span style="color:var(--muted)">—</span>'}</td>
        <td data-label="Tempo total">${formatDuration(c.durationMs)}</td>
        ${liquidoDg ? `<td data-label="Custo entrada / run" style="color:var(--muted)">${formatAlzGamer(c.entryCostPerRun)}</td>` : ''}
        <td data-label="Alz total" style="color:${getAlzTierColor(liquidoDg ? c.netTotalAlz : c.totalAlz)}" title="${formatNumber(liquidoDg ? c.netTotalAlz : c.totalAlz)} Alz">${formatAlzGamer(liquidoDg ? c.netTotalAlz : c.totalAlz)}</td>
        <td data-label="Alz / run" style="color:var(--gold);font-weight:700">${(liquidoDg ? c.netAlzPerRun : c.alzPerRun) != null ? formatAlzGamer(liquidoDg ? c.netAlzPerRun : c.alzPerRun) : '<span style="color:var(--muted);font-weight:400">informe as runs</span>'}</td>
        <td data-label="Alz / hora" style="color:var(--muted)">${(liquidoDg ? c.netAlzPerHour : c.alzPerHour) != null ? formatAlzGamer(liquidoDg ? c.netAlzPerHour : c.alzPerHour) + '/h' : '—'}</td>
      </tr>`).join('')}
      </tbody></table>`}
</div>`;

  // Não é "qual DG", é "que horário" — agrupa toda sessão pela hora de início e mostra onde o
  // Alz/hora historicamente é maior. Só aparece com pelo menos 3 faixas de horário diferentes já
  // farmadas — com 1 ou 2 faixas a "comparação" seria só reafirmar o óbvio (é a única hora que
  // você joga), não uma informação nova.
  const bestHours = computeBestFarmingHours();
  const bestHoursCard = bestHours.length < 3 ? '' : `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-clock"></i>Seu horário mais produtivo</div></div>
  ${infoToggle('sessions-best-hours', 'Junta TODAS as suas sessões já farmadas (de dias diferentes, não só hoje) pela hora em que cada uma começou, e soma o Alz/hora de cada faixa — não é qual DG rende mais, é em que horário do dia o seu farme historicamente rende mais, pra quem tem horários livres pra escolher. "N sessões" quer dizer N sessões daquela faixa espalhadas pelo seu histórico (dias diferentes), não N sessões feitas de uma vez — os nomes de DG listados são só quais DGs você já farmou nesse horário em algum dia, não que todas foram feitas na mesma hora. Uma faixa só entra no ranking com pelo menos 2 sessões — com 1 só, um drop de sorte isolado inflaria o número sem repetir de verdade.')}
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${bestHours.slice(0, 3).map((b, i) => `<div style="flex:1;min-width:150px;padding:10px 12px;background:${i === 0 ? 'var(--gold-bg)' : 'var(--surf2)'};border:1px solid ${i === 0 ? 'var(--gold-border)' : 'var(--border)'};border-radius:8px">
      <div style="font-size:11px;color:var(--muted)">${i === 0 ? '🏆 Melhor faixa' : `#${i + 1}`}</div>
      <div style="font-weight:700;font-size:15px">${String(b.hour).padStart(2, '0')}h–${String((b.hour + 1) % 24).padStart(2, '0')}h</div>
      <div style="color:var(--gold);font-weight:600">${formatAlzGamer(b.alzPerHour)}/h</div>
      <div style="font-size:11px;color:var(--muted)">${b.sessions} sessão${b.sessions > 1 ? 'ões' : ''}${b.sessions > 1 ? ', em dias diferentes' : ''}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">DG${b.dungeonNames.length > 1 ? 's' : ''}: ${b.dungeonNames.map(esc).join(', ')}</div>
    </div>`).join('')}
  </div>
</div>`;

  const routeComparisonCard = !routeComparison.length ? '' : `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-route"></i>Qual rota rende mais</div></div>
  ${infoToggle('sessions-route-comparison', `Ordenado por <strong style="color:var(--gold)">Lucro/hora</strong> — uma rota mais longa pode ter lucro total maior sem ser a melhor forma de gastar seu tempo, então a comparação é por eficiência, não pelo lucro bruto. Lucro esperado = Alz/run histórico de cada DG (a coluna acima) × repetições da rota, menos o custo de rodar nos preços de hoje (já incluindo reset por gemas quando alguma DG passa de ${DAILY_RUN_LIMIT} runs e vale a pena resetar). Rota sem tempo estimado completo fica no fim, sem eficiência calculável ainda. Crie e edite rotas em Planejamento de Rush.`)}
  <table class="t-cards"><thead><tr><th style="width:36px">#</th><th>Rota</th><th>DGs</th><th>Tempo estimado</th><th>Retorno esperado</th><th>Custo</th><th>Lucro</th><th>Lucro/hora</th></tr></thead><tbody>
  ${routeComparison.map((r, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td data-label="Rota" style="font-weight:500">${esc(r.name)}${r.missingDataCount ? ` <i class="ti ti-alert-triangle" style="color:var(--warn)" title="${r.missingDataCount} DG(s) desta rota ainda sem sessão farmada com runs registradas — não entram no retorno esperado"></i>` : ''}${r.needsReset ? ` <i class="ti ti-sparkles" style="color:var(--warn)" title="Custo inclui reset por gemas — alguma DG desta rota passa de ${DAILY_RUN_LIMIT} runs"></i>` : ''}</td>
    <td data-label="DGs">${r.dgCount}</td>
    <td data-label="Tempo estimado">${r.estimatedTimeMs
      ? (r.hasTimeData
        ? `<span title="${esc(timeBreakdownTooltip(r.timeBreakdown))}">${formatDuration(r.estimatedTimeMs)}</span>`
        : `<span title="${esc(timeBreakdownTooltip(r.timeBreakdown) + (r.timeBreakdown.length ? '\n\n' : '') + 'Falta tempo/run farmado de: ' + r.missingTimeDataDgNames.join(', ') + ' — soma só das DGs com dado')}">≈${formatDuration(r.estimatedTimeMs)} <i class="ti ti-alert-triangle" style="color:var(--warn)"></i></span>`)
      : '<span style="color:var(--muted)">—</span>'}</td>
    <td data-label="Retorno esperado" style="color:${getAlzTierColor(r.expectedAlz)}" title="${formatNumber(r.expectedAlz)} Alz">${formatAlzGamer(r.expectedAlz)}</td>
    <td data-label="Custo" style="color:var(--muted)" title="${formatNumber(r.cost)} Alz">${formatAlzGamer(r.cost)}</td>
    <td data-label="Lucro" style="color:${r.profit >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:700" title="${formatNumber(r.profit)} Alz">${r.profit >= 0 ? '+' : ''}${formatAlzGamer(r.profit)}</td>
    <td data-label="Lucro/hora" style="color:var(--gold);font-weight:700">${r.profitPerHour != null ? formatAlzGamer(r.profitPerHour) + '/h' : '<span style="color:var(--muted);font-weight:400">—</span>'}</td>
  </tr>`).join('')}
  </tbody></table>
</div>`;

  // A alternativa montada na hora, mostrada embaixo da rota salva. Só aparece quando de fato tem
  // conteúdo — e diz de cara se rende mais ou menos que a salva, porque comparar dois números de
  // Alz de cabeça, em kk, é exatamente o tipo de conta que a tela deveria poupar.
  const generatedRouteBlock = (gerada, lucroDaSalva) => {
    if (!gerada || gerada.type === 'none' || !gerada.items.length) return '';
    const diferenca = gerada.profit - lucroDaSalva;
    const melhor = diferenca > 0;
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px"><i class="ti ti-wand"></i> Ou <strong style="color:var(--txt)">montar na hora</strong>, sem usar rota salva — escolhendo as DGs que melhor preenchem ${formatDuration(gerada.estimatedTimeMs)}:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        ${gerada.items.map(it => `<span class="badge badge-muted">${esc(it.dungeonName)} × ${it.repetitions}${it.usedReset ? ` <i class="ti ti-sparkles" title="Passa dos ${DAILY_RUN_LIMIT} runs/dia — precisa resetar"></i>` : ''}</span>`).join('')}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div style="font-size:12px;color:var(--muted)">Lucro esperado: <strong style="color:${gerada.profit >= 0 ? 'var(--ok)' : 'var(--err)'}">${gerada.profit >= 0 ? '+' : ''}${formatAlzGamer(gerada.profit)}</strong> <span style="color:${melhor ? 'var(--ok)' : 'var(--muted)'}">(${melhor ? `${formatAlzGamer(diferenca)} a mais` : diferenca === 0 ? 'igual' : `${formatAlzGamer(-diferenca)} a menos`} que a rota acima)</span></div>
        <button class="btn btn-d btn-xs" onclick="applyGeneratedRoute()"><i class="ti ti-player-play"></i>Aplicar esta</button>
      </div>
    </div>`;
  };

  const timeSuggestionCard = `
<div class="card card-featured">
  <div class="ctitle"><i class="ti ti-clock" style="color:var(--gold)"></i>Quanto tempo você tem hoje?</div>
  ${infoToggle('sessions-time-suggestion', `Sugere a rota salva de melhor Lucro/hora que cabe no tempo (tempo/run vem da média real das suas sessões) e completa a sobra com DGs avulsas pelas de melhor Alz/hora, sem deixar tempo disponível sem uso. Se nenhuma rota salva couber, monta um encaixe novo do zero, respeitando o limite de ${DAILY_RUN_LIMIT} runs/dia por DG.`)}
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
          ${generatedRouteBlock(generatedRoute, timeSuggestion.profit)}
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
  ${infoToggle('sessions-history', 'Mostra só o dia selecionado, agrupado por rota quando você iniciou a sessão com uma aplicada no carrinho (farme avulso fica junto em "Avulsas"). A <strong>Duração</strong> é o tempo <strong>ativo</strong> de farme — descontamos os intervalos longos sem drop (ex: o rush parou e você demorou a encerrar). Passe o mouse pra ver o relógio total. Marcou a DG errada? Troque direto no seletor da linha — os itens continuam os mesmos, só a etiqueta muda. Informe as runs e clique na seta pra ver os itens. Sessão errada (ex: ficou aberta por horas sem farmar) distorce a média de tempo daquele DG pra sempre — exclua pela lixeira.')}
  ${!history.length
    ? `<div class="empty">Nenhuma sessão de DG encerrada em ${formatDateBR(historyDate)}.</div>`
    : `<table class="t-cards"><thead><tr><th>Dia</th><th>DG</th><th>Horário</th><th>Duração</th><th>Runs</th><th>Drops</th><th>Alz</th><th>Alz / run</th><th>Anotação</th><th style="width:80px"></th></tr></thead><tbody>
      ${renderSessionHistoryGroups(history)}
      </tbody></table>`}
  ${unclaimedWindowsPanel(historyDate)}
  ${renderDeletedSessionsBin()}
</div>`;

  const rc = AppState.resetConfig; // reset (computeResetWorth) já foi calculado lá em cima, reusado aqui
  const resetCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-refresh"></i>Vale a pena resetar?</div></div>
  ${infoToggle('sessions-reset-worth', 'Resetar o limite do DG custa gemas. Só compensa se o líquido por run (Alz do drop menos o custo de entrada) superar o custo do reset rateado por run. Valor da gema e do ticket vêm de Parâmetros do dia — os mesmos que o carrinho de rush usa de verdade pra cobrar de você, não um valor à parte só pra esta conta.')}
  <div class="g4" style="margin-bottom:14px">
    <div><label class="lbl">Valor da gema (Alz)</label><div class="inp" style="display:flex;align-items:center;color:var(--muted)">${getCostPerGem() ? formatAlzGamer(getCostPerGem()) : '—'}</div></div>
    <div><label class="lbl">Valor do ticket (Alz)</label><div class="inp" style="display:flex;align-items:center;color:var(--muted)">${(+AppState.rushTicketPrice || 0) ? formatAlzGamer(+AppState.rushTicketPrice) : '—'}</div></div>
    <div><label class="lbl">Custo do reset (gemas)</label><input class="inp" type="number" min="0" value="${rc.resetCostGems}" onchange="setResetConfig('resetCostGems', this.value)"></div>
    <div><label class="lbl">Runs por reset</label><input class="inp" type="number" min="1" value="${rc.runsPerReset}" onchange="setResetConfig('runsPerReset', this.value)"></div>
  </div>
  <div style="font-size:11px;color:var(--muted);margin-top:-6px;margin-bottom:12px">Gema e ticket são só leitura aqui — <a href="#" onclick="navigateTo('rush');return false" style="color:var(--acc);text-decoration:underline">edite em Parâmetros do dia</a>.</div>
  ${!reset.gemValueSet
    ? `<div class="empty">Informe o preço do Card Cash em <a href="#" onclick="navigateTo('rush');return false" style="color:var(--acc);text-decoration:underline">Parâmetros do dia</a> para calcular — o reset é pago em gemas.</div>`
    : `<div style="font-size:13px;margin-bottom:12px">Cada run extra via reset custa <strong style="color:var(--err)">${formatAlzGamer(reset.resetCostPerRun)}</strong>. Um DG só vale resetar se o líquido por run passar disso.</div>
    ${!reset.rows.length
      ? '<div class="empty">Nenhum DG com runs informadas ainda — preencha as runs no histórico acima.</div>'
      : `<table class="t-cards"><thead><tr><th>DG</th><th>Alz / run</th><th>Custo de entrada / run</th><th>Líquido / run</th><th>Após reset</th><th>Veredito</th></tr></thead><tbody>
        ${reset.rows.map(r => `<tr>
          <td data-label="DG" style="font-weight:500">${esc(r.dungeonName)}</td>
          <td data-label="Alz / run">${formatAlzGamer(r.alzPerRun)}</td>
          <td data-label="Custo entrada / run" style="color:var(--muted)">${formatAlzGamer(r.entryCostPerRun)}</td>
          <td data-label="Líquido / run" style="color:${r.netAlzPerRun >= 0 ? 'var(--txt)' : 'var(--err)'}">${formatAlzGamer(r.netAlzPerRun)}</td>
          <td data-label="Após reset" style="color:${r.profitAfterReset >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:600">${r.profitAfterReset >= 0 ? '+' : ''}${formatAlzGamer(r.profitAfterReset)}</td>
          <td data-label="Veredito">${r.worth ? '<span class="badge badge-ok"><i class="ti ti-check"></i> Vale resetar</span>' : '<span class="badge" style="background:var(--err-bg);color:var(--err)"><i class="ti ti-x"></i> Não compensa</span>'}</td>
        </tr>`).join('')}
        </tbody></table>`}`}
</div>`;

  return `
<div class="pg-title"><i class="ti ti-shield" style="color:var(--acc)"></i>Sessões de farme</div>
<div class="pg-sub">Marque o DG que está farmando e veja, por dungeon, quanto rende por run — pra decidir onde gastar suas entradas limitadas do dia (as 20, ou o que resetar por gemas).</div>
${nowFarmingCard}
${renderRushProgressCard(comparisonByDgId, comparisonAllTime)}
${timeSuggestionCard}
${comparisonCard}
${bestHoursCard}
${routeComparisonCard}
${resetCard}
${historyCard}`;
}
