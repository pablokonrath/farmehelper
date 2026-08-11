import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getItemPrice } from './drops.js';

export function exportDropsToCSV() {
  const drops = getFilteredDrops();
  const csv = ['Data,Hora,Categoria,Item,Preço (Alz)']
    .concat(drops.map(d => `${d.date},${d.time},${d.category},"${d.name}",${getItemPrice(d.name)}`))
    .join('\n');

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = 'drops_export.csv';
  link.click();
}

// Respeita o mesmo filtro De/Até da página de Vendas (AppState.salesDateFrom/salesDateTo) — exporta
// exatamente o que tá na tela, não o log inteiro escondido atrás de um filtro ativo.
export function exportSalesToCSV() {
  const { salesDateFrom: from, salesDateTo: to } = AppState;
  const sales = AppState.salesLog
    .filter(s => (!from || s.date >= from) && (!to || s.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const csv = ['Data,Item,Quantidade,Valor unitário (Alz),Total (Alz)']
    .concat(sales.map(s => `${s.date},"${s.itemName}",${s.qty},${s.unitPrice},${s.unitPrice * s.qty}`))
    .join('\n');

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = 'vendas_export.csv';
  link.click();
}
