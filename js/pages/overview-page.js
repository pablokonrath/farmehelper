import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getAllDrops, getItemPrice, summarizeDropsByItem, getTodayFarmedAlz, getTodayFarmRate } from '../features/drops.js';
import { getHistoricalSummary, countUncoveredDays } from '../features/drop-history.js';
import { summarizeManualDropBatches } from '../features/manual-drops.js';
import { computePersonalBests } from '../features/dg-session.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR } from '../utils/formatting.js';
import { renderDateInputBR } from '../utils/date-input.js';
import { todayISODate } from '../utils/parsing.js';
import { esc } from '../utils/escape.js';
import { renderPage } from '../router.js';

// "1h 20min" / "45min" / "+12h" — usado na projeção "nesse ritmo, meta em ~X".
function formatHoursShort(hours) {
  const totalMin = Math.round(hours * 60);
  if (totalMin > 720) return '+12h';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Card da meta de farme do dia: progresso, rendimento (Alz/h) e projeção de quando bate a meta
// nesse ritmo. Sempre sobre HOJE (não respeita os filtros de data da página, de propósito).
function buildMetaCard() {
  const goal = AppState.dailyGoalAlz;
  const todayFarmed = getTodayFarmedAlz();
  const rate = getTodayFarmRate();
  const met = goal > 0 && todayFarmed >= goal;
  const pct = goal > 0 ? Math.min(100, Math.round((todayFarmed / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - todayFarmed);

  let statusRight;
  if (met) {
    statusRight = '<span style="color:var(--ok);font-weight:600">🎉 Meta batida!</span>';
  } else if (rate && rate.alzPerHour > 0 && remaining > 0) {
    statusRight = `<span style="color:var(--muted)">faltam <strong style="color:var(--txt)">${formatAlzGamer(remaining)}</strong> · nesse ritmo, meta em <strong style="color:var(--acc)">~${formatHoursShort(remaining / rate.alzPerHour)}</strong></span>`;
  } else {
    statusRight = `<span style="color:var(--muted)">faltam <strong style="color:var(--txt)">${formatAlzGamer(remaining)}</strong></span>`;
  }

  return `
<div class="card card-featured">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-target" style="color:var(--gold)"></i>Meta de farme — hoje</div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="lbl" style="margin:0">Meta (Alz)</span>
      <input class="inp" style="width:160px" type="text" inputmode="numeric" placeholder="ex: 500.000.000"
        value="${goal > 0 ? formatNumber(goal) : ''}" oninput="maskAlzInputLive(this)" onblur="setDailyGoal(this.value)">
    </div>
  </div>
  ${goal <= 0
    ? '<div class="empty" style="padding:12px 0">Defina uma meta de Alz para o dia e acompanhe o progresso + o rendimento por hora aqui.</div>'
    : `
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px">
    <span style="font-weight:700;font-size:16px;color:${met ? 'var(--ok)' : getAlzTierColor(todayFarmed)}" title="${formatNumber(todayFarmed)} Alz">${formatAlzGamer(todayFarmed)}</span>
    <span style="font-size:12px;color:var(--muted)">de ${formatAlzGamer(goal)} · <strong style="color:${met ? 'var(--ok)' : 'var(--txt)'}">${pct}%</strong></span>
  </div>
  <div style="height:10px;background:var(--surf2);border-radius:6px;overflow:hidden">
    <div style="height:100%;width:${pct}%;background:${met ? 'var(--ok)' : 'var(--acc)'};box-shadow:0 0 10px ${met ? 'var(--ok)' : 'var(--acc)'};transition:width .3s"></div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px;flex-wrap:wrap;gap:8px">
    <span style="color:var(--muted)"><i class="ti ti-bolt" style="color:var(--gold)"></i> Rendimento: <strong style="color:var(--txt)">${rate ? formatAlzGamer(rate.alzPerHour) + '/h' : '—'}</strong></span>
    ${statusRight}
  </div>`}
</div>`;
}

// Recorde pessoal: melhor dia e melhor sessão única já farmados. Não ajuda a decidir nada — é só
// um "high score", igual qualquer jogo, pra motivar olhando pros próprios números de antes.
function buildPersonalBestsCard() {
  const bests = computePersonalBests();
  if (!bests) return '';
  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-trophy" style="color:var(--gold)"></i>Recorde pessoal</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <div style="flex:1;min-width:180px;padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px">
      <div style="font-size:11px;color:var(--muted)">🏆 Melhor dia</div>
      <div style="color:var(--gold);font-weight:700;font-size:16px" title="${formatNumber(bests.bestDay.totalAlz)} Alz">${formatAlzGamer(bests.bestDay.totalAlz)}</div>
      <div style="font-size:11px;color:var(--muted)">${formatDateBR(bests.bestDay.date)}</div>
    </div>
    <div style="flex:1;min-width:180px;padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px">
      <div style="font-size:11px;color:var(--muted)">⚔️ Melhor sessão única</div>
      <div style="color:var(--gold);font-weight:700;font-size:16px" title="${formatNumber(bests.bestSession.totalAlz)} Alz">${formatAlzGamer(bests.bestSession.totalAlz)}</div>
      <div style="font-size:11px;color:var(--muted)">${esc(bests.bestSession.dungeonName)} · ${formatDateBR(bests.bestSession.date)}</div>
    </div>
  </div>
</div>`;
}

// Retrospectiva semanal: farmado/vendido/sessões dos últimos 7 dias x os 7 dias anteriores a
// esses. Diferente do resto da página (tudo focado em HOJE, ou num período que você escolhe na
// mão), essa é a única visão automática que dá um passo atrás — pra enxergar se a semana tá
// melhor ou pior que a passada sem precisar lembrar de mexer no filtro de data.
function buildWeeklyRetrospectiveCard() {
  const now = new Date();
  const from = (daysAgo) => todayISODate(new Date(now.getTime() - daysAgo * 86400000));
  const thisWeekFrom = from(6);
  const lastWeekFrom = from(13);
  const lastWeekTo = from(7);
  const today = todayISODate();

  // "Farmado" é bruto (só o valor estimado dos drops) — igual ao "Total de farme" da Visão geral,
  // que também é separado do líquido. rushSpentIn soma o custo do rush salvo em cada dia do
  // período (mesma conta do "Total gasto em rush" logo abaixo), pra dar o líquido da semana.
  const farmedIn = (a, b) => getAllDrops().filter(d => d.date >= a && d.date <= b).reduce((sum, d) => sum + getItemPrice(d.name), 0);
  const soldIn = (a, b) => AppState.salesLog.filter(s => s.date >= a && s.date <= b).reduce((sum, s) => sum + s.unitPrice * s.qty, 0);
  const sessionsIn = (a, b) => AppState.dgSessions.filter(s => s.date >= a && s.date <= b).length;
  const rushSpentIn = (a, b) => Object.entries(AppState.rushHistory)
    .filter(([date]) => date >= a && date <= b)
    .reduce((sum, [, rush]) => sum + rush.total, 0);

  const thisWeek = { farmed: farmedIn(thisWeekFrom, today), sold: soldIn(thisWeekFrom, today), sessions: sessionsIn(thisWeekFrom, today), rushSpent: rushSpentIn(thisWeekFrom, today) };
  const lastWeek = { farmed: farmedIn(lastWeekFrom, lastWeekTo), sold: soldIn(lastWeekFrom, lastWeekTo), sessions: sessionsIn(lastWeekFrom, lastWeekTo), rushSpent: rushSpentIn(lastWeekFrom, lastWeekTo) };
  const thisWeekNet = thisWeek.farmed - thisWeek.rushSpent;

  // Sem nada nas duas janelas, não tem retrospectiva pra mostrar ainda.
  if (!thisWeek.farmed && !thisWeek.sold && !lastWeek.farmed && !lastWeek.sold) return '';

  const deltaBadge = (curr, prev) => {
    if (prev <= 0) return curr > 0 ? '<span style="font-size:11px;color:var(--muted)">(sem semana anterior pra comparar)</span>' : '';
    const pct = Math.round(((curr - prev) / prev) * 100);
    const up = pct >= 0;
    return `<span style="font-size:11px;font-weight:600;color:${up ? 'var(--ok)' : 'var(--err)'}"><i class="ti ti-chevron-${up ? 'up' : 'down'}"></i> ${up ? '+' : ''}${pct}% vs. semana passada</span>`;
  };

  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-chart-bar"></i>Sua semana</div>
  <div style="font-size:11px;color:var(--muted);margin-bottom:12px">Últimos 7 dias (${formatDateBR(thisWeekFrom)}–${formatDateBR(today)}) vs. os 7 dias anteriores.</div>
  <div class="g3">
    <div class="kpi"><div class="kpi-lbl">Farmado (bruto)</div><div class="kpi-val" style="color:${getAlzTierColor(thisWeek.farmed)}" title="${formatNumber(thisWeek.farmed)} Alz">${formatAlzGamer(thisWeek.farmed)}</div><div class="kpi-sub">${deltaBadge(thisWeek.farmed, lastWeek.farmed)}${thisWeek.rushSpent > 0 ? `<br>líquido: <strong style="color:${getAlzTierColor(thisWeekNet)}">${formatAlzGamer(thisWeekNet)}</strong> <span title="${formatNumber(thisWeek.farmed)} farmado − ${formatNumber(thisWeek.rushSpent)} gasto em rush">(farmado − rush)</span>` : ''}</div></div>
    <div class="kpi"><div class="kpi-lbl">Vendido</div><div class="kpi-val" style="color:${getAlzTierColor(thisWeek.sold)}" title="${formatNumber(thisWeek.sold)} Alz">${formatAlzGamer(thisWeek.sold)}</div><div class="kpi-sub">${deltaBadge(thisWeek.sold, lastWeek.sold)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Sessões de DG</div><div class="kpi-val">${thisWeek.sessions}</div><div class="kpi-sub">${deltaBadge(thisWeek.sessions, lastWeek.sessions)}</div></div>
  </div>
</div>`;
}

export function setDateFrom(value) {
  AppState.dateFrom = value;
  renderPage();
}

export function setDateTo(value) {
  AppState.dateTo = value;
  renderPage();
}

export function toggleManualDropsManager() {
  AppState.isManualDropsOpen = !AppState.isManualDropsOpen;
  renderPage();
}

export function renderOverviewPage() {
  const drops = getFilteredDrops();
  // Costura log ao vivo (últimos ~30 dias, exato) com o histórico agregado do banco (o resto) —
  // sem isso, qualquer período mais antigo que a janela do log mostrava um total incompleto sem
  // avisar. Ver drop-history.js.
  const history = getHistoricalSummary(AppState.dateFrom, AppState.dateTo);
  const items = history.items;
  const totalFarmed = history.totalAlz;

  const totalRushSpent = (() => {
    let total = 0;
    Object.entries(AppState.rushHistory).forEach(([date, rush]) => {
      if (AppState.dateFrom && date < AppState.dateFrom) return;
      if (AppState.dateTo && date > AppState.dateTo) return;
      total += rush.total;
    });
    return total;
  })();

  const net = totalFarmed - totalRushSpent;
  // Drops/hora precisa de horário exato de cada drop, que só o log ao vivo tem (o histórico
  // agregado guarda o dia, não a hora) — por isso essa métrica continua só sobre o log.
  const elapsedHours = drops.length >= 2 ? (drops[drops.length - 1].timestamp - drops[0].timestamp) / 3600000 : 0;
  const dropsPerHour = elapsedHours > 0.1 ? (drops.length / elapsedHours).toFixed(1) : '—';

  // Dias do período pedido sem nenhuma fonte de dado (nem log, nem histórico) — normalmente
  // porque são anteriores ao dia em que o FarmHub começou a guardar. Avisar é o que impede o
  // "Total de farme" de parecer completo quando não é.
  const uncoveredDays = countUncoveredDays(AppState.dateFrom, AppState.dateTo);
  const coverageNotice = !uncoveredDays ? '' : `
<div class="notice"><i class="ti ti-info-circle" style="flex-shrink:0;margin-top:1px"></i><div>
  <strong>${uncoveredDays} dia(s) do período sem dado registrado.</strong>
  O log do jogo guarda cerca de 30 dias; o FarmHub arquiva o resto conforme você usa, então dias
  anteriores ao início do arquivamento não entram nos totais abaixo.${history.snapshotOnlyDays ? ` (${history.snapshotOnlyDays} dia(s) deste período vieram do histórico arquivado.)` : ''}
</div></div>`;
  const priceCoverage = items.length ? Math.round(items.filter(i => i.price > 0).length / items.length * 100) : 0;

  const totalsByDate = history.totalsByDate;
  const datesWithData = Object.keys(totalsByDate).sort();

  const manualBatches = summarizeManualDropBatches();
  const manualSuggestions = Object.keys(AppState.itemPrices);
  const manualDropsCard = `
<div class="card" style="padding:0;overflow:hidden">
  <div style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleManualDropsManager()">
    <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px"><i class="ti ti-hand-stop"></i>Adicionar drop manual <span style="font-size:11px;font-weight:400;color:var(--muted)">${AppState.manualDrops.length} itens</span></div>
    <i class="ti ti-chevron-${AppState.isManualDropsOpen ? 'up' : 'down'}" style="color:var(--muted)"></i>
  </div>
  ${AppState.isManualDropsOpen ? `<div style="border-top:1px solid var(--border);padding:14px 16px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px"><i class="ti ti-info-circle"></i> Para itens dropados fora do log oficial do jogo. Entram no total de farme junto com os drops do arquivo.</div>
    <div class="row" style="margin-bottom:12px">
      <div style="flex:1"><label class="lbl">Nome do item</label>
        <input class="inp" id="mdName" placeholder="ex: Nucleo de Aprimoramento" list="mdSugg">
        <datalist id="mdSugg">${manualSuggestions.map(name => `<option value="${esc(name)}">`).join('')}</datalist></div>
      <div style="width:140px"><label class="lbl">Valor unitário (Alz)</label><input class="inp" id="mdPrice" type="text" inputmode="numeric" placeholder="opcional" oninput="maskAlzInputLive(this)"></div>
      <div style="width:100px"><label class="lbl">Quantidade</label><input class="inp" id="mdQty" type="number" min="1" value="1"></div>
      <div style="width:150px"><label class="lbl">Data</label>${renderDateInputBR({ id: 'mdDate', value: todayISODate() })}</div>
      <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addManualDrop()"><i class="ti ti-plus"></i>Adicionar</button></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:-6px;margin-bottom:12px">Deixe o valor em branco para manter o preço já cadastrado desse item (se houver).</div>
    ${manualBatches.length ? `<table><thead><tr><th>Data</th><th>Item</th><th>Quantidade</th><th>Valor</th><th style="width:40px"></th></tr></thead><tbody>
    ${manualBatches.map(b => `<tr>
      <td>${formatDateBR(b.date)}</td>
      <td>${esc(b.name)}</td>
      <td>${b.qty}×</td>
      <td>${getItemPrice(b.name) ? renderAlzValue(getItemPrice(b.name) * b.qty) : '<span style="color:var(--muted)">—</span>'}</td>
      <td><button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteManualDropBatch('${b.batchId}')"><i class="ti ti-trash"></i></button></td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="empty">Nenhum item manual adicionado ainda.</div>'}
  </div>` : ''}
</div>`;

  const metaCard = buildMetaCard();
  const personalBestsCard = buildPersonalBestsCard();
  const weeklyRetrospectiveCard = buildWeeklyRetrospectiveCard();

  if (!getAllDrops().length) {
    // Recorde pessoal e retrospectiva semanal vêm do banco (sessões/vendas), não do log do dia —
    // podem existir mesmo sem o arquivo ao vivo reconectado ainda hoje.
    return metaCard + personalBestsCard + weeklyRetrospectiveCard + manualDropsCard + `<div style="text-align:center;padding:70px 0;color:var(--muted)"><i class="ti ti-chart-bar" style="font-size:52px;display:block;margin-bottom:14px;color:var(--acc)"></i><div style="font-size:18px;font-weight:600;color:var(--txt2);margin-bottom:6px">Nenhum dado carregado</div><div>Use o menu lateral para carregar seu arquivo de log, ou adicione itens manualmente acima</div></div>`;
  }

  return `
<div class="pg-title"><i class="ti ti-map" style="color:var(--acc)"></i>Visão geral</div>
<div class="pg-sub">Métricas consolidadas do seu farme com base nos filtros aplicados.</div>
${/* Ordem pensada pra quem abre a página querendo um número, não um painel: meta de hoje ->
     filtro (que comanda tudo abaixo) -> os totais -> contexto -> ferramentas. Recorde pessoal e
     "adicionar drop manual" são motivação e ferramenta, não dado operacional — foram pro fim,
     porque no celular empurravam o "Total de farme" pra ~4 telas abaixo. */''}
${metaCard}
<div class="card">
  <div class="row">
    <div style="width:130px"><label class="lbl">De</label>${renderDateInputBR({ value: AppState.dateFrom, onChange: 'setDateFrom' })}</div>
    <div style="width:130px"><label class="lbl">Até</label>${renderDateInputBR({ value: AppState.dateTo, onChange: 'setDateTo' })}</div>
  </div>
  <div class="alz-legend">
    <span>Escala Alz:</span>
    <span><span class="alz-dot" style="background:#fde68a"></span>&lt; 1kk</span>
    <span><span class="alz-dot" style="background:#93c5fd"></span>1kk – 9,9kk</span>
    <span><span class="alz-dot" style="background:#86efac"></span>10kk – 99,9kk</span>
    <span><span class="alz-dot" style="background:#fb923c"></span>100kk – 999,9kk</span>
    <span><span class="alz-dot" style="background:#38bdf8"></span>1B – 9,9B</span>
    <span><span class="alz-dot" style="background:#4ade80"></span>10B – 99,9B</span>
    <span><span class="alz-dot" style="background:#f472b6"></span>100B+</span>
  </div>
</div>
${coverageNotice}
<div class="g3" style="margin-bottom:10px">
  <div class="kpi"><div class="kpi-lbl">Total de farme</div><div class="kpi-val" style="font-size:22px;color:${getAlzTierColor(totalFarmed)}" title="${formatNumber(totalFarmed)} Alz">${formatAlzGamer(totalFarmed)}</div></div>
  <div class="kpi"><div class="kpi-lbl">Total gasto em rush</div><div class="kpi-val" style="color:${getAlzTierColor(totalRushSpent)}" title="${formatNumber(totalRushSpent)} Alz">${formatAlzGamer(totalRushSpent)}</div><div class="kpi-sub">deduzido por dia dentro do período filtrado</div></div>
  <div class="kpi"><div class="kpi-lbl">Total líquido</div><div class="kpi-val" style="font-size:22px;color:${getAlzTierColor(net)}" title="${formatNumber(net)} Alz">${formatAlzGamer(net)}</div><div class="kpi-sub">farme − gastos</div></div>
</div>
<div class="g4" style="margin-bottom:12px">
  <div class="kpi"><div class="kpi-lbl">Total de drops</div><div class="kpi-val">${history.dropCount.toLocaleString('pt-BR')}</div></div>
  <div class="kpi"><div class="kpi-lbl">Itens únicos</div><div class="kpi-val">${items.length.toLocaleString('pt-BR')}</div></div>
  <div class="kpi"><div class="kpi-lbl">Drops / hora</div><div class="kpi-val">${dropsPerHour}</div></div>
  <div class="kpi"><div class="kpi-lbl">Cobertura de preços</div><div class="kpi-val" style="color:${priceCoverage < 30 ? 'var(--err)' : priceCoverage < 70 ? 'var(--warn)' : 'var(--ok)'}">${priceCoverage}%</div><div class="kpi-sub">itens com valor cadastrado</div></div>
</div>
${weeklyRetrospectiveCard}
${datesWithData.length > 1 ? `<div class="card"><div class="ctitle"><i class="ti ti-chart-bar"></i>Farme diário</div><div class="chart-wrap"><canvas id="fc"></canvas></div></div>` : ''}
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-trophy"></i>Top itens <span style="color:var(--muted);font-size:12px;font-weight:400;margin-left:4px">${items.length} itens</span></div></div>
  <table><thead><tr><th style="width:36px">#</th><th>Item</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>
  ${items.length ? items.slice(0, 25).map((it, i) => `<tr>
    <td class="rank">${i + 1}</td><td>${esc(it.name)}</td>
    <td>${it.qty.toLocaleString('pt-BR')}</td>
    <td>${it.price ? renderAlzValue(it.price) : '<span style="color:var(--muted)">—</span>'}</td>
    <td>${it.total ? renderAlzValue(it.total, true) : '<span style="color:var(--muted)">—</span>'}</td>
  </tr>`).join('') : `<tr><td colspan="5" class="empty">Nenhum item neste período</td></tr>`}
  </tbody></table>
</div>
${personalBestsCard}
${manualDropsCard}`;
}
