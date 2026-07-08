import { getFilteredDrops, getItemPrice } from '../features/drops.js';
import { renderAlzValue, formatDateBR } from '../utils/formatting.js';

export function renderReportPage() {
  const drops = getFilteredDrops();
  const dates = [...new Set(drops.map(d => d.date))].sort().reverse();

  return `
<div class="pg-title">Relatório</div>
<div class="pg-sub">Lista completa dos drops com base nos filtros da visão geral.</div>
<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
  <span style="font-size:13px;color:var(--txt2)">${drops.length.toLocaleString('pt-BR')} drops</span>
  <button class="btn btn-d btn-xs" onclick="exportDropsToCSV()" style="margin-left:auto"><i class="ti ti-download"></i>Exportar CSV</button>
</div>
${!dates.length ? '<div class="empty" style="padding:60px">Nenhum dado carregado.</div>' :
dates.map(date => {
  const dropsOnDate = drops.filter(d => d.date === date);
  const totalOnDate = dropsOnDate.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  return `<div class="card"><div class="sh" style="margin-bottom:8px">
<div style="font-weight:600">${formatDateBR(date)} <span style="color:var(--muted);font-size:12px;font-weight:400">${dropsOnDate.length} drops</span></div>
${totalOnDate ? renderAlzValue(totalOnDate, true) : ''}
</div><table><thead><tr><th>Hora</th><th>Item</th><th>Cat.</th><th>Valor</th></tr></thead><tbody>
${dropsOnDate.map(d => `<tr>
  <td class="mono" style="color:var(--muted)">${d.time}</td>
  <td style="font-size:12px">${d.name}</td>
  <td><span class="badge badge-acc" style="font-size:10px">${d.category}</span></td>
  <td>${getItemPrice(d.name) ? renderAlzValue(getItemPrice(d.name)) : '<span style="color:var(--muted)">—</span>'}</td>
</tr>`).join('')}
</tbody></table></div>`;
}).join('')}`;
}
