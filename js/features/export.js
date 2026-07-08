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
