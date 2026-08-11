import { AppState } from '../state/app-state.js';
import { getAllDrops, summarizeDropsByItem } from '../features/drops.js';
import { computeSalesSummary, computeSalesSummaryByItem, getSalePriceHistory, getSoldItemNames } from '../features/sales.js';
import { computeSalesGoalsProgress, totalAllocatedPercentage, computeTodayGoalsAllocation } from '../features/sales-goals.js';
import { infoToggle } from '../features/ui-toggles.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR } from '../utils/formatting.js';
import { renderDateInputBR } from '../utils/date-input.js';
import { todayISODate } from '../utils/parsing.js';
import { esc, escAttr } from '../utils/escape.js';
import { renderPage } from '../router.js';

// Filtro De/Até só de Vendas (não confundir com o da Visão geral — pools diferentes: mesmo motivo
// pelo qual essa página tem seu próprio AppState.salesDateFrom/salesDateTo). Comanda os KPIs e a
// lista de vendas; Cofres e Histórico de preço ignoram de propósito (ver app-state.js).
export function setSalesDateFrom(value) {
  AppState.salesDateFrom = value;
  renderPage();
}

export function setSalesDateTo(value) {
  AppState.salesDateTo = value;
  renderPage();
}

export function renderSalesPage() {
  const { salesDateFrom: from, salesDateTo: to } = AppState;
  const summary = computeSalesSummary(from, to);
  const sales = [...AppState.salesLog]
    .filter(s => (!from || s.date >= from) && (!to || s.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const isFiltered = !!(from || to);

  // Sugestões de item: o que você já precificou + o que já dropou.
  const itemNames = [...new Set([...Object.keys(AppState.itemPrices), ...summarizeDropsByItem(getAllDrops()).map(i => i.name)])].sort();
  const histItems = getSoldItemNames();

  const editingSale = AppState.editingSaleId ? AppState.salesLog.find(s => s.id === AppState.editingSaleId) : null;

  const filterCard = `
<div class="card">
  <div class="row" style="align-items:flex-end">
    <div style="width:130px"><label class="lbl">De</label>${renderDateInputBR({ value: from, onChange: 'setSalesDateFrom' })}</div>
    <div style="width:130px"><label class="lbl">Até</label>${renderDateInputBR({ value: to, onChange: 'setSalesDateTo' })}</div>
    ${isFiltered ? `<div><button class="btn btn-xs" onclick="setSalesDateFrom('');setSalesDateTo('')"><i class="ti ti-x"></i>Limpar filtro</button></div>` : ''}
  </div>
  ${isFiltered ? '<div style="font-size:11px;color:var(--muted);margin-top:6px"><i class="ti ti-info-circle"></i> Os totais e a lista abaixo refletem só o período filtrado. Cofres de Alz e Histórico de preço continuam olhando tudo — são sobre acumulado/tendência, não sobre um recorte de data.</div>' : ''}
</div>`;

  const kpis = `
<div class="g2" style="margin-bottom:12px">
  <div class="kpi"><div class="kpi-lbl">Total vendido (real)</div><div class="kpi-val" style="font-size:22px;color:${getAlzTierColor(summary.realTotal)}" title="${formatNumber(summary.realTotal)} Alz">${formatAlzGamer(summary.realTotal)}</div><div class="kpi-sub">${summary.count} venda(s)</div></div>
  <div class="kpi"><div class="kpi-lbl">Real vs. estimado</div><div class="kpi-val" style="font-size:22px;color:${summary.diff >= 0 ? 'var(--ok)' : 'var(--err)'}" title="${formatNumber(summary.diff)} Alz">${summary.diff >= 0 ? '+' : ''}${formatAlzGamer(summary.diff)}</div><div class="kpi-sub">vs. ${formatAlzGamer(summary.estimatedTotal)} cadastrado</div></div>
</div>`;

  const goalsProgress = computeSalesGoalsProgress();
  const totalPct = totalAllocatedPercentage();
  const todayAlloc = goalsProgress.length ? computeTodayGoalsAllocation() : null;
  const goalsCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-target"></i>Cofres de Alz</div>
  ${infoToggle('sales-goals', 'Cada cofre reserva uma % fixa de toda venda registrada <strong>a partir de quando ele foi criado</strong> (vendas antigas não contam). Dá pra ter vários ao mesmo tempo — a soma das % não precisa fechar 100, o resto fica livre. Não confunda com a "Meta de farme" da Visão geral — são pools diferentes: uma é valor farmado, o cofre é venda de fato. O ritmo (Alz/dia) e a previsão de data usam a média desde a criação do cofre — vendeu mais forte ontem, a previsão adianta; ficou parado, ela atrasa.')}
  ${!goalsProgress.length ? '<div class="empty" style="padding:8px 0;margin-bottom:12px">Nenhum cofre criado ainda.</div>' : `
  <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
    ${goalsProgress.map(g => `<div style="padding:12px;background:var(--surf2);border:1px solid ${g.complete ? 'var(--ok-border)' : 'var(--border)'};border-radius:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-weight:700;display:flex;align-items:center;gap:8px">${esc(g.name)} <span class="badge badge-acc">${g.percentage}% das vendas</span>${g.complete ? '<span class="badge badge-ok"><i class="ti ti-check"></i> Cheio</span>' : ''}</div>
        <button aria-label="Excluir cofre ${esc(g.name)}" title="Excluir cofre" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteSalesGoal('${g.id}')"><i class="ti ti-trash"></i></button>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;height:10px;background:var(--surf);border-radius:5px;overflow:hidden"><div style="width:${Math.round(g.progress * 100)}%;height:100%;background:${g.complete ? 'var(--ok)' : 'var(--acc)'}"></div></div>
        <div style="font-size:12px;font-weight:600;color:${g.complete ? 'var(--ok)' : 'var(--txt)'};white-space:nowrap" title="${formatNumber(g.accumulated)} de ${formatNumber(g.targetAlz)} Alz">${formatAlzGamer(g.accumulated)} / ${formatAlzGamer(g.targetAlz)}</div>
      </div>
      ${!g.complete && g.etaDate ? `<div style="font-size:11px;color:var(--muted);margin-top:6px"><i class="ti ti-trending-up"></i> No ritmo atual (~${formatAlzGamer(g.dailyPace)}/dia), cheio em ~${g.etaDays} dia(s) — por volta de ${formatDateBR(g.etaDate)}.</div>` : ''}
      ${!g.complete && !g.etaDate ? `<div style="font-size:11px;color:var(--muted);margin-top:6px"><i class="ti ti-minus"></i> Ainda sem venda desde a criação — sem ritmo pra prever data.</div>` : ''}
    </div>`).join('')}
  </div>
  <div style="font-size:11px;color:${totalPct > 100 ? 'var(--err)' : 'var(--muted)'};margin-bottom:12px">${totalPct > 100 ? `<i class="ti ti-alert-triangle"></i> Seus cofres somam ${totalPct}% — passa de 100%, ajuste algum.` : `${totalPct}% das vendas alocado, ${100 - totalPct}% livre.`}</div>
  ${todayAlloc ? `<div style="font-size:11px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border)"><i class="ti ti-calendar"></i> Hoje você vendeu ${formatAlzGamer(todayAlloc.todayTotal)} — <strong style="color:var(--txt)">${formatAlzGamer(todayAlloc.allocated)}</strong> (${todayAlloc.pct}%) já cai nos cofres ativos, ${formatAlzGamer(todayAlloc.free)} livre.</div>` : ''}`}
  <div class="row" style="align-items:flex-end">
    <div style="flex:1"><label class="lbl">Nome do cofre</label><input class="inp" id="newGoalName" placeholder="ex: Set novo"></div>
    <div style="width:150px"><label class="lbl">Valor alvo (Alz)</label><input class="inp" id="newGoalTarget" type="text" inputmode="numeric" placeholder="Alz" oninput="maskAlzInputLive(this)"></div>
    <div style="width:100px"><label class="lbl">% das vendas</label><input class="inp" id="newGoalPct" type="number" min="1" max="100" step="1" placeholder="ex: 30"></div>
    <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addSalesGoal()"><i class="ti ti-plus"></i>Criar cofre</button></div>
  </div>
</div>`;

  const form = `
<div class="card">
  <div class="ctitle"><i class="ti ti-cash"></i>${editingSale ? `Editando venda de ${esc(editingSale.itemName)}` : 'Registrar venda'}</div>
  <div id="sMsg" style="display:none;font-size:12px;color:var(--ok);background:var(--ok-bg);border:1px solid var(--ok-border);border-radius:6px;padding:8px 10px;margin-bottom:10px"></div>
  <div class="row" style="align-items:flex-end">
    <div style="flex:1"><label class="lbl">Item</label>
      <input class="inp" id="saleItem" placeholder="ex: Anel Fatal" list="saleItemSugg" value="${editingSale ? escAttr(editingSale.itemName) : ''}" onkeydown="if(event.key==='Enter')addSale()">
      <datalist id="saleItemSugg">${itemNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div style="width:100px"><label class="lbl">Quantidade</label><input class="inp" id="saleQty" type="number" min="1" value="${editingSale ? editingSale.qty : 1}" onkeydown="if(event.key==='Enter')addSale()"></div>
    <div style="width:150px"><label class="lbl">Valor recebido (total)</label><input class="inp" id="salePrice" type="text" inputmode="numeric" placeholder="Alz" value="${editingSale ? formatNumber(editingSale.unitPrice * editingSale.qty) : ''}" oninput="maskAlzInputLive(this)" onkeydown="if(event.key==='Enter')addSale()"></div>
    <div style="width:150px"><label class="lbl">Data</label>${renderDateInputBR({ id: 'saleDate', value: editingSale ? editingSale.date : todayISODate() })}</div>
    <div style="display:flex;gap:6px">
      <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addSale()"><i class="ti ${editingSale ? 'ti-check' : 'ti-plus'}"></i>${editingSale ? 'Salvar' : 'Registrar'}</button></div>
      ${editingSale ? `<div><label class="lbl">&nbsp;</label><button class="btn btn-d" onclick="cancelEditingSale()">Cancelar</button></div>` : ''}
    </div>
  </div>
  <div style="font-size:11px;color:var(--muted);margin-top:8px"><i class="ti ti-info-circle"></i> É o total da venda (não por unidade) — a gente divide pela quantidade. O "real vs. estimado" compara com o preço cadastrado do item em Cálculo de farme, e toda venda já atualiza esse preço cadastrado sozinha.</div>
</div>`;

  const list = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-receipt"></i>Vendas <span style="color:var(--muted);font-size:12px;font-weight:400;margin-left:4px">${sales.length}${isFiltered ? ` de ${AppState.salesLog.length}` : ''}</span></div></div>
  ${!sales.length
    ? `<div class="empty">${isFiltered ? 'Nenhuma venda no período filtrado.' : 'Nenhuma venda registrada ainda.'}</div>`
    : `<table><thead><tr><th>Data</th><th>Item</th><th>Qtd</th><th>Valor unit.</th><th>Total real</th><th>Estimado</th><th>Diferença</th><th style="width:64px"></th></tr></thead><tbody>
      ${sales.map(s => {
        const real = s.unitPrice * s.qty;
        const est = (AppState.itemPrices[s.itemName] ?? 0) * s.qty;
        const d = real - est;
        const isEditing = s.id === AppState.editingSaleId;
        return `<tr${isEditing ? ' style="background:var(--acc-bg)"' : ''}>
          <td>${formatDateBR(s.date)}</td>
          <td style="font-weight:500">${esc(s.itemName)}</td>
          <td>${s.qty}×</td>
          <td>${renderAlzValue(s.unitPrice)}</td>
          <td style="font-weight:600">${renderAlzValue(real)}</td>
          <td style="color:var(--muted)">${est ? renderAlzValue(est) : '—'}</td>
          <td style="color:${d >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:600">${est ? (d >= 0 ? '+' : '') + formatAlzGamer(d) : '—'}</td>
          <td><div style="display:flex;gap:4px">
            <button aria-label="Editar venda de ${esc(s.itemName)} em ${formatDateBR(s.date)}" title="Editar" style="background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:14px" onclick="startEditingSale('${s.id}')"><i class="ti ti-edit"></i></button>
            <button aria-label="Remover venda de ${esc(s.itemName)} em ${formatDateBR(s.date)}" title="Remover" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteSale('${s.id}')"><i class="ti ti-trash"></i></button>
          </div></td>
        </tr>`;
      }).join('')}
      </tbody></table>`}
</div>`;

  const byItem = computeSalesSummaryByItem(from, to).filter(i => i.estimatedTotal > 0);
  const belowExpected = byItem.filter(i => i.diff < 0);
  const itemBreakdownCard = byItem.length < 2 ? '' : `
<div class="card">
  <div class="ctitle"><i class="ti ti-list-details"></i>Real vs. estimado por item</div>
  ${infoToggle('sales-by-item', 'Quebra do "Real vs. estimado" item a item — pra achar rápido qual item específico tá rendendo menos que o esperado (venda abaixo do preço cadastrado), em vez de ver só a diferença geral escondida no meio de itens indo bem. Ordenado do que mais precisa de atenção pro que mais está surpreendendo pra cima.')}
  ${belowExpected.length ? `<div style="font-size:11px;color:var(--err);margin-bottom:10px"><i class="ti ti-alert-triangle"></i> ${belowExpected.length} item(ns) vendendo abaixo do preço cadastrado — considere revisar o preço ou a hora de vender.</div>` : ''}
  <table><thead><tr><th>Item</th><th>Qtd</th><th>Total real</th><th>Estimado</th><th>Diferença</th></tr></thead><tbody>
    ${byItem.map(i => `<tr>
      <td style="font-weight:500">${esc(i.itemName)}</td>
      <td>${i.qty}×</td>
      <td style="font-weight:600">${renderAlzValue(i.realTotal)}</td>
      <td style="color:var(--muted)">${renderAlzValue(i.estimatedTotal)}</td>
      <td style="color:${i.diff >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:600">${i.diff >= 0 ? '+' : ''}${formatAlzGamer(i.diff)}</td>
    </tr>`).join('')}
  </tbody></table>
</div>`;

  const priceCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-chart-line"></i>Histórico de preço</div>
    <select class="inp" style="width:220px" onchange="setPriceHistoryItem(this.value)">
      <option value="">Escolha um item…</option>
      ${histItems.map(n => `<option value="${esc(n)}"${n === AppState.priceHistoryItem ? ' selected' : ''}>${esc(n)}</option>`).join('')}
    </select>
  </div>
  ${infoToggle('sales-price-history', 'A variação do preço pelo qual você realmente <strong>vendeu</strong> cada item ao longo do tempo (não o preço cadastrado como meta em Cálculo de farme) — pra decidir a hora de vender. Um ponto por dia com venda, com a média se vendeu mais de uma vez no mesmo dia.')}
  ${!histItems.length
    ? '<div class="empty">Ainda sem venda registrada. Registre uma venda acima pra começar.</div>'
    : !AppState.priceHistoryItem
      ? '<div class="empty">Escolha um item acima para ver a variação do preço de venda.</div>'
      : getSalePriceHistory(AppState.priceHistoryItem).length < 2
        ? '<div class="empty">Só há uma venda registrada deste item ainda — venda em outro dia pra ver a linha.</div>'
        : '<div class="chart-wrap" style="height:200px"><canvas id="ph"></canvas></div>'}
</div>`;

  return `
<div class="pg-title"><i class="ti ti-coin" style="color:var(--acc)"></i>Vendas</div>
<div class="pg-sub">Registre suas vendas reais e compare com o preço estimado, veja a variação de preço de cada item.</div>
${filterCard}
${kpis}
${goalsCard}
${form}
${list}
${itemBreakdownCard}
${priceCard}`;
}
