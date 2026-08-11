import { AppState } from '../state/app-state.js';
import { saveSalesLog, savePriceHistory, saveItemPrices } from '../state/persistence.js';
import { getItemPrice } from './drops.js';
import { parseAlzInput, parseDateInputBR, formatAlzGamer } from '../utils/formatting.js';
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
//
// Toda venda também atualiza o preço cadastrado do item (mesma tabela usada em Cálculo de farme,
// Visão geral, raridade — em qualquer lugar que precise de um preço pra multiplicar). Uma venda
// real é o dado mais confiável que existe sobre quanto o item vale AGORA, mais confiável que
// qualquer preço digitado à mão — então ao invés de exigir que o jogador mantenha os preços
// cadastrados em dia manualmente, cada venda já faz essa manutenção sozinha. Vale pra data de
// hoje (ver recordPriceChange) mesmo que a venda seja lançada com data retroativa — igual ao
// padrão já usado em manual-drops.js.
export function recordSale({ itemName, qty, unitPrice, date }) {
  AppState.salesLog.push({
    id: 's' + Date.now() + Math.random().toString(36).slice(2, 6),
    itemName,
    qty: Math.max(1, parseInt(qty, 10) || 1),
    unitPrice: unitPrice || 0,
    date: date || todayISODate(),
  });
  saveSalesLog();
  if (itemName && unitPrice > 0) {
    AppState.itemPrices[itemName] = unitPrice;
    recordPriceChange(itemName, unitPrice);
    saveItemPrices();
  }
}

// Compara um preço de venda com a média das últimas vendas recentes do mesmo item — pra pegar
// aquela venda apressada por bem menos do que o mercado tem pago ultimamente, antes dela virar
// histórico e distorcer o "preço de venda real" pra sempre. Olha só as 5 últimas (não a vida
// toda — preço de mercado muda; o que importa é a tendência recente). Com menos de 2 vendas
// anteriores não tem base pra comparar, então não avisa (evita falso positivo com amostra de 1).
const PRICE_DROP_WARNING_THRESHOLD = 0.2; // 20% abaixo da média recente
export function checkSalePriceDrop(itemName, unitPrice) {
  const key = stripEnhancementSuffix(itemName);
  const recent = AppState.salesLog.filter(s => stripEnhancementSuffix(s.itemName) === key).slice(-5);
  if (recent.length < 2 || !(unitPrice > 0)) return null;
  const avg = recent.reduce((sum, s) => sum + s.unitPrice, 0) / recent.length;
  if (avg <= 0) return null;
  const dropPct = (avg - unitPrice) / avg;
  return dropPct >= PRICE_DROP_WARNING_THRESHOLD ? { avg, dropPct: Math.round(dropPct * 100) } : null;
}

// Pede o valor TOTAL recebido, não o valor por unidade — é isso que o jogo mostra quando vende
// um lote ("recebeu X Alz"), então digitar o total e deixar o app dividir evita a conta de
// cabeça (e o arredondamento torto de quem faz ela errado). O valor por unidade guardado no log
// (e usado pra atualizar o preço cadastrado, ver recordSale) é sempre total ÷ quantidade.
export function addSale() {
  const name = document.getElementById('saleItem')?.value.trim();
  const rawTotal = document.getElementById('salePrice')?.value.trim();
  if (!name || !rawTotal) return;
  const qty = Math.max(1, parseInt(document.getElementById('saleQty')?.value) || 1);
  const unitPrice = Math.round(parseAlzInput(rawTotal) / qty);
  const date = parseDateInputBR(document.getElementById('saleDate')?.value) || todayISODate();

  const drop = checkSalePriceDrop(name, unitPrice);
  if (drop && !confirm(`Você tá vendendo "${name}" ${drop.dropPct}% abaixo da sua média recente (~${formatAlzGamer(drop.avg)}). Confirma mesmo assim?`)) return;

  recordSale({ itemName: name, qty, unitPrice, date });
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

// Há quantos dias o preço cadastrado de um item foi mexido pela última vez (null = nunca teve
// histórico, ex: cadastrado antes do priceHistory existir). Economia de servidor privado varia —
// um preço nunca revisto vira estimativa cada vez menos confiável sem avisar em lugar nenhum;
// usado em Cálculo de farme só pra sinalizar isso, não é um erro nem bloqueia nada.
export function daysSincePriceUpdate(itemName) {
  const hist = AppState.priceHistory[itemName];
  if (!hist || !hist.length) return null;
  const lastDate = hist[hist.length - 1].date;
  const diffMs = Date.now() - new Date(lastDate + 'T00:00:00').getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
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
