import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getAllDrops, getItemPrice, summarizeDropsByItem, getTodayFarmedAlz, getTodayFarmRate } from '../features/drops.js';
import { summarizeManualDropBatches } from '../features/manual-drops.js';
import { buildDayComparison } from '../features/day-compare.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR } from '../utils/formatting.js';
import { renderDateInputBR } from '../utils/date-input.js';
import { todayISODate } from '../utils/parsing.js';
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
<div class="card">
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

export function setSearchQuery(value) {
  AppState.searchQuery = value;
  renderPage();
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
  const items = summarizeDropsByItem(drops);
  const totalFarmed = drops.reduce((sum, d) => sum + getItemPrice(d.name), 0);

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
  const elapsedHours = drops.length >= 2 ? (drops[drops.length - 1].timestamp - drops[0].timestamp) / 3600000 : 0;
  const dropsPerHour = elapsedHours > 0.1 ? (drops.length / elapsedHours).toFixed(1) : '—';
  const priceCoverage = items.length ? Math.round(items.filter(i => i.price > 0).length / items.length * 100) : 0;

  const totalsByDate = {};
  drops.forEach(d => { totalsByDate[d.date] = (totalsByDate[d.date] || 0) + getItemPrice(d.name); });
  const datesWithData = Object.keys(totalsByDate).sort();

  const comparison = buildDayComparison();
  const compareItemSuggestions = summarizeDropsByItem(getAllDrops()).slice(0, 40);

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
        <datalist id="mdSugg">${manualSuggestions.map(name => `<option value="${name}">`).join('')}</datalist></div>
      <div style="width:140px"><label class="lbl">Valor unitário (Alz)</label><input class="inp" id="mdPrice" type="text" inputmode="numeric" placeholder="opcional" oninput="maskAlzInputLive(this)"></div>
      <div style="width:100px"><label class="lbl">Quantidade</label><input class="inp" id="mdQty" type="number" min="1" value="1"></div>
      <div style="width:150px"><label class="lbl">Data</label>${renderDateInputBR({ id: 'mdDate', value: todayISODate() })}</div>
      <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addManualDrop()"><i class="ti ti-plus"></i>Adicionar</button></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:-6px;margin-bottom:12px">Deixe o valor em branco para manter o preço já cadastrado desse item (se houver).</div>
    ${manualBatches.length ? `<table><thead><tr><th>Data</th><th>Item</th><th>Quantidade</th><th>Valor</th><th style="width:40px"></th></tr></thead><tbody>
    ${manualBatches.map(b => `<tr>
      <td>${formatDateBR(b.date)}</td>
      <td>${b.name}</td>
      <td>${b.qty}×</td>
      <td>${getItemPrice(b.name) ? renderAlzValue(getItemPrice(b.name) * b.qty) : '<span style="color:var(--muted)">—</span>'}</td>
      <td><button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteManualDropBatch('${b.batchId}')"><i class="ti ti-trash"></i></button></td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="empty">Nenhum item manual adicionado ainda.</div>'}
  </div>` : ''}
</div>`;

  const metaCard = buildMetaCard();

  if (!getAllDrops().length) {
    return metaCard + manualDropsCard + `<div style="text-align:center;padding:70px 0;color:var(--muted)"><i class="ti ti-chart-bar" style="font-size:52px;display:block;margin-bottom:14px;color:var(--acc)"></i><div style="font-size:18px;font-weight:600;color:var(--txt2);margin-bottom:6px">Nenhum dado carregado</div><div>Use o menu lateral para carregar seu arquivo de log, ou adicione itens manualmente acima</div></div>`;
  }

  return `
<div class="pg-title">Visão geral</div>
<div class="pg-sub">Métricas consolidadas do seu farme com base nos filtros aplicados.</div>
${metaCard}
${manualDropsCard}
<div class="card">
  <div class="row">
    <div style="flex:1"><label class="lbl">Buscar item (ignora acentos e maiúsculas)</label>
      <div style="position:relative"><i class="ti ti-search" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:14px"></i>
      <input class="inp" style="padding-left:30px" placeholder="ex: nucleo, joia, pocao..." value="${AppState.searchQuery}" oninput="setSearchQuery(this.value)"></div></div>
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
<div class="g3" style="margin-bottom:10px">
  <div class="kpi"><div class="kpi-lbl">Total de farme</div><div class="kpi-val" style="font-size:22px;color:${getAlzTierColor(totalFarmed)}" title="${formatNumber(totalFarmed)} Alz">${formatAlzGamer(totalFarmed)}</div></div>
  <div class="kpi"><div class="kpi-lbl">Total gasto em rush</div><div class="kpi-val" style="color:${getAlzTierColor(totalRushSpent)}" title="${formatNumber(totalRushSpent)} Alz">${formatAlzGamer(totalRushSpent)}</div><div class="kpi-sub">deduzido por dia dentro do período filtrado</div></div>
  <div class="kpi"><div class="kpi-lbl">Total líquido</div><div class="kpi-val" style="font-size:22px;color:${getAlzTierColor(net)}" title="${formatNumber(net)} Alz">${formatAlzGamer(net)}</div><div class="kpi-sub">farme − gastos</div></div>
</div>
<div class="g4" style="margin-bottom:12px">
  <div class="kpi"><div class="kpi-lbl">Total de drops</div><div class="kpi-val">${drops.length.toLocaleString('pt-BR')}</div></div>
  <div class="kpi"><div class="kpi-lbl">Itens únicos</div><div class="kpi-val">${items.length.toLocaleString('pt-BR')}</div></div>
  <div class="kpi"><div class="kpi-lbl">Drops / hora</div><div class="kpi-val">${dropsPerHour}</div></div>
  <div class="kpi"><div class="kpi-lbl">Cobertura de preços</div><div class="kpi-val" style="color:${priceCoverage < 30 ? 'var(--err)' : priceCoverage < 70 ? 'var(--warn)' : 'var(--ok)'}">${priceCoverage}%</div><div class="kpi-sub">itens com valor cadastrado</div></div>
</div>
${datesWithData.length > 1 ? `<div class="card"><div class="ctitle"><i class="ti ti-chart-bar"></i>Farme diário</div><div class="chart-wrap"><canvas id="fc"></canvas></div></div>` : ''}
<div class="card">
  <div class="ctitle"><i class="ti ti-arrows-left-right"></i>Comparar dias</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Também respeita o filtro "Filtrar apenas itens rastreados" de Cálculo de farme — se estiver ativo, só itens rastreados entram na comparação.</div>
  <div class="g3" style="margin-bottom:14px">
    <div><label class="lbl">Dia A</label>${renderDateInputBR({ value: comparison.dayA, onChange: 'setCompareDayA' })}</div>
    <div><label class="lbl">Dia B</label>${renderDateInputBR({ value: comparison.dayB, onChange: 'setCompareDayB' })}</div>
    <div><label class="lbl">Item (opcional)</label>
      <select class="inp" onchange="setCompareItemFilter(this.value)">
        <option value=""${AppState.compareItemFilter ? '' : ' selected'}>Todos os itens</option>
        ${compareItemSuggestions.map(it => `<option value="${it.name}"${it.name === AppState.compareItemFilter ? ' selected' : ''}>${it.name}</option>`).join('')}
      </select></div>
  </div>
  ${comparison.dates.length < 2 ? '<div class="empty">Carregue drops de pelo menos 2 dias diferentes para comparar.</div>' :
    !comparison.dayA || !comparison.dayB ? '<div class="empty">Escolha os dois dias que quer comparar acima.</div>' : `
  <div class="g3" style="margin-bottom:14px">
    <div class="kpi">
      <div class="kpi-lbl">${formatDateBR(comparison.dayA)}</div>
      <div class="kpi-val" style="color:${getAlzTierColor(comparison.totalA)}" title="${formatNumber(comparison.totalA)} Alz">${formatAlzGamer(comparison.totalA)}</div>
      <div class="kpi-sub">${comparison.countA.toLocaleString('pt-BR')} drops</div>
    </div>
    <div class="kpi" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      <i class="ti ${comparison.deltaAlz >= 0 ? 'ti-trending-up' : 'ti-trending-down'}" style="font-size:20px;color:${comparison.deltaAlz >= 0 ? 'var(--ok)' : 'var(--err)'};margin-bottom:4px"></i>
      <div style="font-weight:700;font-size:14px;color:${comparison.deltaAlz >= 0 ? 'var(--ok)' : 'var(--err)'}" title="${formatNumber(comparison.deltaAlz)} Alz">${comparison.deltaAlz >= 0 ? '+' : ''}${formatAlzGamer(comparison.deltaAlz)}</div>
      <div class="kpi-sub">${comparison.deltaPercent >= 0 ? '+' : ''}${comparison.deltaPercent.toFixed(1)}% vs. Dia A</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">${formatDateBR(comparison.dayB)}</div>
      <div class="kpi-val" style="color:${getAlzTierColor(comparison.totalB)}" title="${formatNumber(comparison.totalB)} Alz">${formatAlzGamer(comparison.totalB)}</div>
      <div class="kpi-sub">${comparison.countB.toLocaleString('pt-BR')} drops</div>
    </div>
  </div>
  <div class="chart-wrap" style="height:180px;margin-bottom:14px"><canvas id="cc"></canvas></div>
  <div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:6px">Todos os itens — ${formatDateBR(comparison.dayA)} vs ${formatDateBR(comparison.dayB)}</div>
  ${!comparison.itemRows.length ? '<div class="empty" style="padding:14px 0">Sem drops nos dois dias.</div>' : `
  <table><thead><tr>
    <th>Item</th>
    <th>Qtd ${formatDateBR(comparison.dayA)}</th><th>Total ${formatDateBR(comparison.dayA)}</th>
    <th>Qtd ${formatDateBR(comparison.dayB)}</th><th>Total ${formatDateBR(comparison.dayB)}</th>
    <th>Diferença</th>
  </tr></thead><tbody>
  ${comparison.itemRows.map(row => {
    const higherIsA = row.totalA > row.totalB;
    const higherIsB = row.totalB > row.totalA;
    const deltaCell = row.delta === 0
      ? '<span style="color:var(--muted)">=</span>'
      : `<span style="color:${row.delta > 0 ? 'var(--ok)' : 'var(--err)'};font-weight:700" title="${formatNumber(Math.abs(row.delta))} Alz"><i class="ti ${row.delta > 0 ? 'ti-arrow-up' : 'ti-arrow-down'}"></i> ${formatAlzGamer(Math.abs(row.delta))}</span>`;
    return `<tr>
      <td style="font-weight:500">${row.name}</td>
      <td style="${higherIsA ? 'font-weight:700' : 'color:var(--muted)'}">${row.qtyA || '—'}</td>
      <td style="${higherIsA ? 'font-weight:700' : ''}">${row.totalA ? renderAlzValue(row.totalA) : '<span style="color:var(--muted)">—</span>'}</td>
      <td style="${higherIsB ? 'font-weight:700' : 'color:var(--muted)'}">${row.qtyB || '—'}</td>
      <td style="${higherIsB ? 'font-weight:700' : ''}">${row.totalB ? renderAlzValue(row.totalB) : '<span style="color:var(--muted)">—</span>'}</td>
      <td>${deltaCell}</td>
    </tr>`;
  }).join('')}
  </tbody></table>`}`}
</div>
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-trophy"></i>Top itens <span style="color:var(--muted);font-size:12px;font-weight:400;margin-left:4px">${items.length} itens</span></div></div>
  <table><thead><tr><th style="width:36px">#</th><th>Item</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>
  ${items.length ? items.slice(0, 25).map((it, i) => `<tr>
    <td class="rank">${i + 1}</td><td>${it.name}</td>
    <td>${it.qty.toLocaleString('pt-BR')}</td>
    <td>${it.price ? renderAlzValue(it.price) : '<span style="color:var(--muted)">—</span>'}</td>
    <td>${it.total ? renderAlzValue(it.total, true) : '<span style="color:var(--muted)">—</span>'}</td>
  </tr>`).join('') : `<tr><td colspan="5" class="empty">Nenhum item neste período</td></tr>`}
  </tbody></table>
</div>`;
}
