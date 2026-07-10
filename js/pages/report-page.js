import { getFilteredDrops, getItemPrice, getItemCategory } from '../features/drops.js';
import { renderAlzValue, formatDateBR } from '../utils/formatting.js';

const NO_CATEGORY_LABEL = 'Sem categoria';

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
  const categoryDrops = dropsByCategory[category].slice().sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const totalInCategory = categoryDrops.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  return `<div class="card"><div class="sh" style="margin-bottom:8px">
<div style="font-weight:600">${category} <span style="color:var(--muted);font-size:12px;font-weight:400">${categoryDrops.length} drops</span></div>
${totalInCategory ? renderAlzValue(totalInCategory, true) : ''}
</div><table><thead><tr><th>Data</th><th>Hora</th><th>Item</th><th>Valor</th></tr></thead><tbody>
${categoryDrops.map(d => `<tr>
  <td class="mono" style="color:var(--muted)">${formatDateBR(d.date)}</td>
  <td class="mono" style="color:var(--muted)">${d.time}</td>
  <td style="font-size:12px">${d.name}</td>
  <td>${getItemPrice(d.name) ? renderAlzValue(getItemPrice(d.name)) : '<span style="color:var(--muted)">—</span>'}</td>
</tr>`).join('')}
</tbody></table></div>`;
}).join('')}`;
}
