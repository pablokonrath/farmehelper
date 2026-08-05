import { AppState } from '../state/app-state.js';
import { saveSalesLog, savePriceHistory } from '../state/persistence.js';
import { getItemPrice } from './drops.js';
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

// Histórico do preço de VENDA de um item (não o preço cadastrado como meta em Cálculo de farme —
// esse é só uma estimativa; o que importa acompanhar é por quanto você realmente vendeu). Um
// ponto por dia: média ponderada pela quantidade, pra não espalhar vários pontos no mesmo dia
// quando você vende o mesmo item mais de uma vez. Começa naturalmente na primeira venda, já que
// só existe ponto pra dia em que houve venda de verdade.
export function getSalePriceHistory(itemName) {
  const itemKey = stripEnhancementSuffix(itemName);
  const byDate = {};
  AppState.salesLog
    .filter(s => stripEnhancementSuffix(s.itemName) === itemKey)
    .forEach(s => {
      const d = byDate[s.date] || (byDate[s.date] = { totalValue: 0, totalQty: 0 });
      d.totalValue += s.unitPrice * s.qty;
      d.totalQty += s.qty;
    });
  return Object.entries(byDate)
    .map(([date, d]) => ({ date, price: Math.round(d.totalValue / d.totalQty) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Nomes de item que já foram vendidos ao menos uma vez — pra popular o seletor do gráfico de
// preço de venda (getSalePriceHistory), já que agora o gráfico é sobre vendas reais, não sobre
// tudo que já teve preço cadastrado.
export function getSoldItemNames() {
  return [...new Set(AppState.salesLog.map(s => stripEnhancementSuffix(s.itemName)))].sort();
}

// Total vendido (real) e o que valeria pelo preço cadastrado (estimado). Não estima valor "em
// estoque" (dropado − vendido) — nem todo drop é vendido (parte vai pra coleção ou vira insumo
// de craft), então esse número nunca representou Alz de verdade parado em algum lugar.
export function computeSalesSummary() {
  let realTotal = 0;
  let estimatedTotal = 0;
  AppState.salesLog.forEach(s => {
    realTotal += s.unitPrice * s.qty;
    estimatedTotal += getItemPrice(s.itemName) * s.qty;
  });

  return { realTotal, estimatedTotal, diff: realTotal - estimatedTotal, count: AppState.salesLog.length };
}
