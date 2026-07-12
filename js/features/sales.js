import { AppState } from '../state/app-state.js';
import { saveSalesLog, savePriceHistory } from '../state/persistence.js';
import { getItemPrice, getAllDrops, summarizeDropsByItem } from './drops.js';
import { parseAlzInput, parseDateInputBR } from '../utils/formatting.js';
import { todayISODate, stripEnhancementSuffix } from '../utils/parsing.js';
import { renderPage } from '../router.js';

// Registra a mudança de preço de um item no histórico (1 ponto por dia: atualiza se já mexeu
// hoje, adiciona se for dia novo, ignora se o preço não mudou). Chamado sempre que um preço é
// definido/editado (pricing.js, manual-drops.js).
export function recordPriceChange(name, price) {
  if (!name || !(price > 0)) return;
  const hist = AppState.priceHistory[name] || (AppState.priceHistory[name] = []);
  const last = hist[hist.length - 1];
  const today = todayISODate();
  if (last && last.price === price) return;
  if (last && last.date === today) last.price = price;
  else hist.push({ date: today, price });
  if (hist.length > 120) AppState.priceHistory[name] = hist.slice(-120);
  savePriceHistory();
}

// Insere uma venda no log (sem re-renderizar) — usado tanto pela página de Vendas quanto pelo
// Modo guiado, pra não duplicar o formato do registro.
export function recordSale({ itemName, qty, unitPrice, date }) {
  AppState.salesLog.push({
    id: 's' + Date.now() + Math.random().toString(36).slice(2, 6),
    itemName,
    qty: Math.max(1, parseInt(qty, 10) || 1),
    unitPrice: unitPrice || 0,
    date: date || todayISODate(),
  });
  saveSalesLog();
}

export function addSale() {
  const name = document.getElementById('saleItem')?.value.trim();
  const rawPrice = document.getElementById('salePrice')?.value.trim();
  if (!name || !rawPrice) return;
  const qty = Math.max(1, parseInt(document.getElementById('saleQty')?.value) || 1);
  const date = parseDateInputBR(document.getElementById('saleDate')?.value) || todayISODate();
  recordSale({ itemName: name, qty, unitPrice: parseAlzInput(rawPrice), date });
  renderPage();
}

export function deleteSale(id) {
  AppState.salesLog = AppState.salesLog.filter(s => s.id !== id);
  saveSalesLog();
  renderPage();
}

export function setPriceHistoryItem(item) {
  AppState.priceHistoryItem = item;
  renderPage();
}

// Total vendido (real), o que valeria pelo preço cadastrado (estimado), a diferença, e o valor
// ainda parado em estoque (dropado − vendido, por item, valorizado pelo preço cadastrado).
export function computeSalesSummary() {
  let realTotal = 0;
  let estimatedTotal = 0;
  const soldByItem = {};
  AppState.salesLog.forEach(s => {
    realTotal += s.unitPrice * s.qty;
    estimatedTotal += getItemPrice(s.itemName) * s.qty;
    const key = stripEnhancementSuffix(s.itemName);
    soldByItem[key] = (soldByItem[key] || 0) + s.qty;
  });

  let stockValue = 0;
  summarizeDropsByItem(getAllDrops()).forEach(it => {
    const remaining = Math.max(0, it.qty - (soldByItem[it.name] || 0));
    stockValue += remaining * getItemPrice(it.name);
  });

  return { realTotal, estimatedTotal, diff: realTotal - estimatedTotal, stockValue, count: AppState.salesLog.length };
}
