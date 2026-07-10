import { getFilteredDrops, getItemPrice, getItemCategory, summarizeDropsByItem } from '../features/drops.js';
import { renderAlzValue, formatDateBR } from '../utils/formatting.js';

const NO_CATEGORY_LABEL = 'Sem categoria';

// Uma linha por (dia, item) em vez de uma linha por drop individual — sem isso, 200 drops do
// mesmo item no mesmo dia viravam 200 linhas repetidas, deixando o relatório enorme.
function summarizeByDateAndItem(drops) {
  const dates = [...new Set(drops.map(d => d.date))].sort().reverse();
  return dates.flatMap(date => {
    const dropsOnDate = drops.filter(d => d.date === date);
    return summarizeDropsByItem(dropsOnDate).map(item => ({ date, ...item }));
  });
}

export function renderReportPage() {
  const drops = getFilteredDrops();

  const dropsByCategory = {};
  drops.forEach(d => {
    const category = getItemCategory(d.name) || NO_CATEGORY_LABEL;
    (dropsByCategory[category] ??= []).push(d);
  });

  // "Sem categoria" sempre por último — o resto em ordem alfabética.
  const categories = Object.keys(dropsByCategory).sort((a, b) => {
    if (a === NO_CATEGORY_LABEL) return 1;
    if (b === NO_CATEGORY_LABEL) return -1;
    return a.localeCompare(b);
  });

  return `
<div class="pg-title">Relatório</div>
<div class="pg-sub">Drops agrupados por categoria (configurada em Admin → Categorias de item), com base nos filtros da visão geral.</div>
<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
  <span style="font-size:13px;color:var(--txt2)">${drops.length.toLocaleString('pt-BR')} drops</span>
  <button class="btn btn-d btn-xs" onclick="exportDropsToCSV()" style="margin-left:auto"><i class="ti ti-download"></i>Exportar CSV</button>
</div>
${!categories.length ? '<div class="empty" style="padding:60px">Nenhum dado carregado.</div>' :
categories.map(category => {
  const categoryDrops = dropsByCategory[category];
  const totalInCategory = categoryDrops.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  const rows = summarizeByDateAndItem(categoryDrops);
  return `<div class="card"><div class="sh" style="margin-bottom:8px">
<div style="font-weight:600">${category} <span style="color:var(--muted);font-size:12px;font-weight:400">${categoryDrops.length} drops</span></div>
${totalInCategory ? renderAlzValue(totalInCategory, true) : ''}
</div><table><thead><tr><th>Data</th><th>Item</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>
${rows.map(r => `<tr>
  <td class="mono" style="color:var(--muted)">${formatDateBR(r.date)}</td>
  <td style="font-size:12px">${r.name}</td>
  <td>${r.qty}×</td>
  <td>${r.total ? renderAlzValue(r.total) : '<span style="color:var(--muted)">—</span>'}</td>
</tr>`).join('')}
</tbody></table></div>`;
}).join('')}`;
}
