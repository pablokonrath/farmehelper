import { AppState } from '../state/app-state.js';
import { getAllDrops, summarizeDropsByItem } from '../features/drops.js';
import { computeSalesSummary, getSalePriceHistory, getSoldItemNames } from '../features/sales.js';
import { computeSalesGoalsProgress, totalAllocatedPercentage, computeTodayGoalsAllocation } from '../features/sales-goals.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR } from '../utils/formatting.js';
import { renderDateInputBR } from '../utils/date-input.js';
import { todayISODate } from '../utils/parsing.js';
import { esc } from '../utils/escape.js';

export function renderSalesPage() {
  const summary = computeSalesSummary();
  const sales = [...AppState.salesLog].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  // Sugestões de item: o que você já precificou + o que já dropou.
  const itemNames = [...new Set([...Object.keys(AppState.itemPrices), ...summarizeDropsByItem(getAllDrops()).map(i => i.name)])].sort();
  const histItems = getSoldItemNames();

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
  <div class="ctitle"><i class="ti ti-target"></i>Metas de Alz</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Cada meta reserva uma % fixa de toda venda registrada <strong>a partir de quando ela foi criada</strong> (vendas antigas não contam). Dá pra ter várias ao mesmo tempo — a soma das % não precisa fechar 100, o resto fica livre.</div>
  ${!goalsProgress.length ? '<div class="empty" style="padding:8px 0;margin-bottom:12px">Nenhuma meta criada ainda.</div>' : `
  <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
    ${goalsProgress.map(g => `<div style="padding:12px;background:var(--surf2);border:1px solid ${g.complete ? 'var(--ok-border)' : 'var(--border)'};border-radius:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-weight:700;display:flex;align-items:center;gap:8px">${esc(g.name)} <span class="badge badge-acc">${g.percentage}% das vendas</span>${g.complete ? '<span class="badge badge-ok"><i class="ti ti-check"></i> Batida</span>' : ''}</div>
        <button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteSalesGoal('${g.id}')" title="Excluir meta"><i class="ti ti-trash"></i></button>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;height:10px;background:var(--surf);border-radius:5px;overflow:hidden"><div style="width:${Math.round(g.progress * 100)}%;height:100%;background:${g.complete ? 'var(--ok)' : 'var(--acc)'}"></div></div>
        <div style="font-size:12px;font-weight:600;color:${g.complete ? 'var(--ok)' : 'var(--txt)'};white-space:nowrap" title="${formatNumber(g.accumulated)} de ${formatNumber(g.targetAlz)} Alz">${formatAlzGamer(g.accumulated)} / ${formatAlzGamer(g.targetAlz)}</div>
      </div>
    </div>`).join('')}
  </div>
  <div style="font-size:11px;color:${totalPct > 100 ? 'var(--err)' : 'var(--muted)'};margin-bottom:12px">${totalPct > 100 ? `<i class="ti ti-alert-triangle"></i> Suas metas somam ${totalPct}% — passa de 100%, ajuste alguma.` : `${totalPct}% das vendas alocado, ${100 - totalPct}% livre.`}</div>
  ${todayAlloc ? `<div style="font-size:11px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border)"><i class="ti ti-calendar"></i> Hoje você vendeu ${formatAlzGamer(todayAlloc.todayTotal)} — <strong style="color:var(--txt)">${formatAlzGamer(todayAlloc.allocated)}</strong> (${todayAlloc.pct}%) já conta pras metas ativas, ${formatAlzGamer(todayAlloc.free)} livre.</div>` : ''}`}
  <div class="row" style="align-items:flex-end">
    <div style="flex:1"><label class="lbl">Nome da meta</label><input class="inp" id="newGoalName" placeholder="ex: Set novo"></div>
    <div style="width:150px"><label class="lbl">Valor alvo (Alz)</label><input class="inp" id="newGoalTarget" type="text" inputmode="numeric" placeholder="Alz" oninput="maskAlzInputLive(this)"></div>
    <div style="width:100px"><label class="lbl">% das vendas</label><input class="inp" id="newGoalPct" type="number" min="1" max="100" step="1" placeholder="ex: 30"></div>
    <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addSalesGoal()"><i class="ti ti-plus"></i>Criar meta</button></div>
  </div>
</div>`;

  const form = `
<div class="card">
  <div class="ctitle"><i class="ti ti-cash"></i>Registrar venda</div>
  <div class="row" style="align-items:flex-end">
    <div style="flex:1"><label class="lbl">Item</label>
      <input class="inp" id="saleItem" placeholder="ex: Anel Fatal" list="saleItemSugg">
      <datalist id="saleItemSugg">${itemNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div style="width:100px"><label class="lbl">Quantidade</label><input class="inp" id="saleQty" type="number" min="1" value="1"></div>
    <div style="width:150px"><label class="lbl">Valor de venda (unit.)</label><input class="inp" id="salePrice" type="text" inputmode="numeric" placeholder="Alz" oninput="maskAlzInputLive(this)"></div>
    <div style="width:150px"><label class="lbl">Data</label>${renderDateInputBR({ id: 'saleDate', value: todayISODate() })}</div>
    <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addSale()"><i class="ti ti-plus"></i>Registrar</button></div>
  </div>
  <div style="font-size:11px;color:var(--muted);margin-top:8px"><i class="ti ti-info-circle"></i> O "real vs. estimado" compara o valor que você vendeu com o preço cadastrado do item em Cálculo de farme.</div>
</div>`;

  const list = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-receipt"></i>Vendas <span style="color:var(--muted);font-size:12px;font-weight:400;margin-left:4px">${sales.length}</span></div></div>
  ${!sales.length
    ? '<div class="empty">Nenhuma venda registrada ainda.</div>'
    : `<table><thead><tr><th>Data</th><th>Item</th><th>Qtd</th><th>Valor unit.</th><th>Total real</th><th>Estimado</th><th>Diferença</th><th style="width:40px"></th></tr></thead><tbody>
      ${sales.map(s => {
        const real = s.unitPrice * s.qty;
        const est = (AppState.itemPrices[s.itemName] ?? 0) * s.qty;
        const d = real - est;
        return `<tr>
          <td>${formatDateBR(s.date)}</td>
          <td style="font-weight:500">${esc(s.itemName)}</td>
          <td>${s.qty}×</td>
          <td>${renderAlzValue(s.unitPrice)}</td>
          <td style="font-weight:600">${renderAlzValue(real)}</td>
          <td style="color:var(--muted)">${est ? renderAlzValue(est) : '—'}</td>
          <td style="color:${d >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:600">${est ? (d >= 0 ? '+' : '') + formatAlzGamer(d) : '—'}</td>
          <td><button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteSale('${s.id}')"><i class="ti ti-trash"></i></button></td>
        </tr>`;
      }).join('')}
      </tbody></table>`}
</div>`;

  const priceCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-chart-line"></i>Histórico de preço</div>
    <select class="inp" style="width:220px" onchange="setPriceHistoryItem(this.value)">
      <option value="">Escolha um item…</option>
      ${histItems.map(n => `<option value="${esc(n)}"${n === AppState.priceHistoryItem ? ' selected' : ''}>${esc(n)}</option>`).join('')}
    </select>
  </div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> A variação do preço pelo qual você realmente <strong>vendeu</strong> cada item ao longo do tempo (não o preço cadastrado como meta em Cálculo de farme) — pra decidir a hora de vender. Um ponto por dia com venda, com a média se vendeu mais de uma vez no mesmo dia.</div>
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
${kpis}
${goalsCard}
${form}
${list}
${priceCard}`;
}
