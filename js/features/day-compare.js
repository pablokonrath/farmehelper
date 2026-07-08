import { AppState } from '../state/app-state.js';
import { getAllDrops, getAvailableDropDates, getItemPrice, summarizeDropsByItem, applyTrackedKeywordFilter } from './drops.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { renderPage } from '../router.js';

export function setCompareDayA(value) {
  AppState.compareDayA = value;
  renderPage();
}

export function setCompareDayB(value) {
  AppState.compareDayB = value;
  renderPage();
}

export function setCompareItemFilter(value) {
  AppState.compareItemFilter = value;
  renderPage();
}

function getDropsForDay(date, itemFilter) {
  let drops = getAllDrops().filter(d => d.date === date);
  drops = applyTrackedKeywordFilter(drops);
  if (itemFilter) {
    const query = normalizeForSearch(itemFilter);
    drops = drops.filter(d => normalizeForSearch(d.name).includes(query));
  }
  return drops;
}

// Uma linha por item que apareceu em pelo menos um dos dois dias — em vez de duas tabelas
// "top 5" separadas (onde o mesmo item podia cair em posições diferentes ou nem aparecer
// nos dois lados), assim dá pra comparar cada item lado a lado numa olhada só.
function buildItemComparisonRows(itemsA, itemsB) {
  const rowsByName = {};
  itemsA.forEach(it => {
    rowsByName[it.name] = { name: it.name, qtyA: it.qty, totalA: it.total, qtyB: 0, totalB: 0 };
  });
  itemsB.forEach(it => {
    if (!rowsByName[it.name]) rowsByName[it.name] = { name: it.name, qtyA: 0, totalA: 0, qtyB: it.qty, totalB: it.total };
    else {
      rowsByName[it.name].qtyB = it.qty;
      rowsByName[it.name].totalB = it.total;
    }
  });
  return Object.values(rowsByName)
    .map(row => ({ ...row, delta: row.totalB - row.totalA }))
    .sort((a, b) => b.totalA + b.totalB - (a.totalA + a.totalB));
}

// Sem seleção do usuário, compara os dois dias mais recentes com dados por padrão —
// já cobre o caso comum ("como foi hoje comparado com ontem") sem exigir configuração.
export function buildDayComparison() {
  const dates = getAvailableDropDates();
  const dayA = AppState.compareDayA || dates[dates.length - 2] || '';
  const dayB = AppState.compareDayB || dates[dates.length - 1] || '';
  const itemFilter = AppState.compareItemFilter;

  const dropsA = dayA ? getDropsForDay(dayA, itemFilter) : [];
  const dropsB = dayB ? getDropsForDay(dayB, itemFilter) : [];

  const totalA = dropsA.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  const totalB = dropsB.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  const deltaAlz = totalB - totalA;
  const deltaPercent = totalA > 0 ? (deltaAlz / totalA) * 100 : (totalB > 0 ? 100 : 0);

  const itemsA = summarizeDropsByItem(dropsA);
  const itemsB = summarizeDropsByItem(dropsB);

  return {
    dates,
    dayA,
    dayB,
    itemFilter,
    totalA,
    totalB,
    countA: dropsA.length,
    countB: dropsB.length,
    itemRows: buildItemComparisonRows(itemsA, itemsB),
    deltaAlz,
    deltaPercent,
  };
}
