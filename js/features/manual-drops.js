import { AppState } from '../state/app-state.js';
import { saveManualDrops, saveItemPrices } from '../state/persistence.js';
import { updateBalanceSidebar } from './drops.js';
import { processNewDropsForAlerts } from './alerts.js';
import { checkWishlistMatches } from './wishlist.js';
import { checkFarmGoalReached } from './farm-goal.js';
import { recordPriceChange } from './sales.js';
import { parseDateInputBR, parseAlzInput } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { renderPage } from '../router.js';

// Um item dropado fora do log oficial vira `quantity` registros individuais (mesmo formato
// dos drops do log), agrupados por batchId só para poder editar/apagar o lote de uma vez.
// O valor informado (opcional) é salvo em AppState.itemPrices, a mesma tabela de preços
// usada pelo Cálculo de farme — não existe um preço "só do manual".
export function addManualDrop() {
  const nameInput = document.getElementById('mdName');
  const qtyInput = document.getElementById('mdQty');
  const dateInput = document.getElementById('mdDate');
  const priceInput = document.getElementById('mdPrice');

  const name = nameInput?.value.trim();
  if (!name) return;
  const quantity = Math.max(1, parseInt(qtyInput?.value) || 1);
  const date = parseDateInputBR(dateInput?.value) || todayISODate();
  const batchId = 'm' + Date.now();

  const rawPrice = priceInput?.value.trim();
  if (rawPrice) {
    AppState.itemPrices[name] = parseAlzInput(rawPrice);
    recordPriceChange(name, AppState.itemPrices[name]);
    saveItemPrices();
  }

  const newEntries = [];
  for (let i = 0; i < quantity; i++) {
    const entry = {
      date,
      time: '00:00:00',
      timestamp: new Date(date + 'T00:00:00'),
      category: 0,
      name,
      manual: true,
      batchId,
    };
    AppState.manualDrops.push(entry);
    newEntries.push(entry);
  }

  nameInput.value = '';
  qtyInput.value = '1';
  if (priceInput) priceInput.value = '';
  saveManualDrops();
  updateBalanceSidebar();
  processNewDropsForAlerts(newEntries);
  checkWishlistMatches(newEntries);
  checkFarmGoalReached();
  renderPage();
}

export function deleteManualDropBatch(batchId) {
  if (!confirm('Remover estes itens adicionados manualmente?')) return;
  AppState.manualDrops = AppState.manualDrops.filter(d => d.batchId !== batchId);
  saveManualDrops();
  updateBalanceSidebar();
  renderPage();
}

export function summarizeManualDropBatches() {
  const batches = {};
  AppState.manualDrops.forEach(d => {
    if (!batches[d.batchId]) batches[d.batchId] = { batchId: d.batchId, name: d.name, date: d.date, qty: 0 };
    batches[d.batchId].qty++;
  });
  return Object.values(batches).sort((a, b) => b.date.localeCompare(a.date));
}
