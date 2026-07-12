import { AppState, CREDIT_CATEGORIES } from '../state/app-state.js';
import { saveRushHistory, saveRushCreditCraftCosts } from '../state/persistence.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, formatDateBR, parseAlzInput, renderAlzValue } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { updateBalanceSidebar } from './drops.js';
import { renderPage } from '../router.js';

// 1.000 Cash custam AppState.rushCardCashPrice Alz, e 1 gema de reset custa o equivalente a 1 Cash.
export function getCostPerGem() {
  return Math.round((+AppState.rushCardCashPrice || 0) / 1000);
}

// Crédito de macro = preço de mercado do item base (varia por categoria e por dia, comprado
// direto no dia) + custo fixo de fabricar por cima (por categoria, configurável). Não é
// consumido por DG específica — dá 1h de uso do macro em qualquer DG, então entra no total
// do dia como um custo à parte, não vinculado a nenhum item do carrinho.
export function calculateCreditsCost() {
  return CREDIT_CATEGORIES.reduce((sum, cat) => {
    const { quantity, marketPrice } = AppState.rushCredits[cat.id];
    const craftCost = AppState.rushCreditCraftCosts[cat.id] || 0;
    return sum + quantity * (marketPrice + craftCost);
  }, 0);
}

// Custo de cada repetição de uma DG = alzCost/run + (ticketsPerRun × preço do ticket, para DGs que
// misturam Alz e tickets, ex: 400.000 Alz + 1 ticket ou 1.000.000 Alz + 2 tickets)
// + (gemsPerRun × custo por gema atual, para DGs com entrada em gemas, ex: DX Premium = 15 gemas)
// + (se usedReset: quantidade de gemas informada × valor unitário da gema, definidos ao adicionar a DG).
// As gemas de entrada e as de reset são somadas no mesmo total de gemas/custo de gemas.
// Itens salvos antes desse valor por-item existir (usedReset sem resetGemQuantity/resetGemUnitPrice)
// caem de volta em 1 gema por repetição ao preço atual, para não quebrar rushes já salvos.
export function calculateRushCartCost(cart = AppState.rushCart) {
  const ticketPrice = +AppState.rushTicketPrice || 0;
  const costPerGem = getCostPerGem();
  let alzFromDungeons = 0;
  let ticketCount = 0;
  let gemCount = 0;
  let gemCost = 0;

  cart.forEach(item => {
    alzFromDungeons += item.alzCost * item.repetitions;
    const ticketsPerRun = item.ticketsPerRun ?? (item.requiresTicket ? 1 : 0);
    ticketCount += item.repetitions * ticketsPerRun;

    const entryGems = (item.gemsPerRun || 0) * item.repetitions;
    gemCount += entryGems;
    gemCost += entryGems * costPerGem;

    if (item.usedReset) {
      const quantity = item.resetGemQuantity ?? item.repetitions;
      const unitPrice = item.resetGemUnitPrice ?? costPerGem;
      gemCount += quantity;
      gemCost += quantity * unitPrice;
    }
  });

  const ticketCost = ticketCount * ticketPrice;
  const creditsCost = calculateCreditsCost();

  return {
    alzFromDungeons,
    ticketCount,
    ticketCost,
    gemCount,
    gemCost,
    creditsCost,
    total: alzFromDungeons + ticketCost + gemCost + creditsCost,
  };
}

// Monta um item de carrinho a partir do id da DG — usado pelo Modo rápido. reset (opcional):
// { used, qty, price } marca que a DG foi resetada com N gemas ao preço informado.
export function buildCartItem(dungeonId, repetitions, reset = null) {
  const dungeon = AppState.dungeonList.find(d => d.id === dungeonId);
  if (!dungeon) return null;
  const usedReset = !!(reset && reset.used);
  return {
    name: dungeon.name,
    alzCost: dungeon.alzCost,
    ticketsPerRun: dungeon.ticketsPerRun || 0,
    gemsPerRun: dungeon.gemsPerRun || 0,
    repetitions: Math.max(1, parseInt(repetitions, 10) || 1),
    usedReset,
    resetGemQuantity: usedReset ? Math.max(0, parseInt(reset.qty, 10) || 0) : 0,
    resetGemUnitPrice: usedReset ? (reset.price || 0) : 0,
  };
}

export function addDungeonToCart() {
  const select = document.getElementById('dgS');
  if (!select) return;
  const dungeon = AppState.dungeonList.find(d => d.id === select.value);
  if (!dungeon) return;

  const repetitions = parseInt(document.getElementById('dgRp').value) || 1;
  const usedReset = document.getElementById('dgReset').checked;
  const resetGemQuantity = usedReset ? (parseInt(document.getElementById('dgGemQty')?.value) || 0) : 0;
  const resetGemUnitPrice = usedReset ? parseAlzInput(document.getElementById('dgGemPrice')?.value) : 0;

  AppState.rushCart.push({
    name: dungeon.name,
    alzCost: dungeon.alzCost,
    ticketsPerRun: dungeon.ticketsPerRun || 0,
    gemsPerRun: dungeon.gemsPerRun || 0,
    repetitions,
    usedReset,
    resetGemQuantity,
    resetGemUnitPrice,
  });
  renderPage();
}

export function removeDungeonFromCart(index) {
  AppState.rushCart.splice(index, 1);
  renderPage();
}

// Chama renderPage() (não só updateRushMetricsDisplay) porque a tabela de créditos mostra um
// subtotal por linha que também precisa refletir a mudança, não só as métricas do topo.
export function setRushCreditQuantity(categoryId, value) {
  AppState.rushCredits[categoryId].quantity = Math.max(0, parseInt(value) || 0);
  renderPage();
}

export function setRushCreditMarketPrice(categoryId, value) {
  AppState.rushCredits[categoryId].marketPrice = parseAlzInput(value);
  renderPage();
}

export function setRushCreditCraftCost(categoryId, value) {
  AppState.rushCreditCraftCosts[categoryId] = parseAlzInput(value);
  saveRushCreditCraftCosts();
  renderPage();
}

export function updateRushMetricsDisplay() {
  const cost = calculateRushCartCost();
  const updateMetric = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = formatAlzGamer(value);
      el.title = formatNumber(value) + ' Alz';
      el.style.color = getAlzTierColor(value);
    }
  };

  updateMetric('m-a', cost.alzFromDungeons);
  const ticketCountEl = document.getElementById('m-t');
  if (ticketCountEl) ticketCountEl.textContent = cost.ticketCount;

  updateMetric('m-ct', cost.ticketCost);
  const gemCountEl = document.getElementById('m-g');
  if (gemCountEl) gemCountEl.textContent = cost.gemCount;

  updateMetric('m-cg', cost.gemCost);
  updateMetric('m-cc', cost.creditsCost);
  updateMetric('m-tot', cost.total);
}

export function updateCartPreview() {
  updateResetCostPreview();

  const preview = document.getElementById('cartPreview');
  if (!preview) return;
  const select = document.getElementById('dgS');
  if (!select) return;
  const dungeon = AppState.dungeonList.find(d => d.id === select.value);
  if (!dungeon) return;

  const repetitions = parseInt(document.getElementById('dgRp')?.value) || 1;
  const usedReset = document.getElementById('dgReset')?.checked || false;
  const ticketPrice = +AppState.rushTicketPrice || 0;
  const gemQuantity = usedReset ? (parseInt(document.getElementById('dgGemQty')?.value) || 0) : 0;
  const gemUnitPrice = usedReset ? parseAlzInput(document.getElementById('dgGemPrice')?.value) : 0;

  const ticketsPerRun = dungeon.ticketsPerRun || 0;
  const totalTickets = ticketsPerRun * repetitions;
  const entryGems = (dungeon.gemsPerRun || 0) * repetitions;
  const entryGemCost = entryGems * getCostPerGem();
  const alzCost = dungeon.alzCost * repetitions;
  const ticketCost = totalTickets * ticketPrice;
  const resetCost = gemQuantity * gemUnitPrice;
  const total = alzCost + ticketCost + entryGemCost + resetCost;

  const lines = [];
  if (alzCost > 0) lines.push(`<b>${formatAlzGamer(dungeon.alzCost)}/run × ${repetitions}</b> = ${formatAlzGamer(alzCost)}`);
  if (totalTickets > 0) {
    lines.push(`<b>${totalTickets} ticket${totalTickets > 1 ? 's' : ''} × ${ticketPrice ? formatAlzGamer(ticketPrice) : '(preço não configurado)'}</b> = ${formatAlzGamer(ticketCost)}`);
  }
  if (entryGems > 0) lines.push(`<b>${entryGems} gema${entryGems > 1 ? 's' : ''} de entrada × ${formatAlzGamer(getCostPerGem())}</b> = ${formatAlzGamer(entryGemCost)}`);
  if (usedReset) lines.push(`<b>${gemQuantity} gema${gemQuantity !== 1 ? 's' : ''} de reset × ${formatAlzGamer(gemUnitPrice)}</b> = ${formatAlzGamer(resetCost)}`);

  preview.innerHTML = lines.length
    ? `Custo estimado: ${lines.join(' + ')} → <span style="color:${getAlzTierColor(total)};font-weight:700" title="${formatNumber(total)} Alz">${formatAlzGamer(total)}</span>`
    : 'Sem custo configurado para esta DG.';
}

// Mostra/esconde os campos de detalhe do reset (quantidade e valor da gema) e
// preenche os padrões: quantidade = repetições atuais, preço = custo por gema do momento.
export function toggleResetDetailFields() {
  const checkbox = document.getElementById('dgReset');
  const wrapper = document.getElementById('resetDetailFields');
  if (!checkbox || !wrapper) return;

  wrapper.style.display = checkbox.checked ? 'block' : 'none';
  if (checkbox.checked) {
    const repetitions = parseInt(document.getElementById('dgRp')?.value) || 1;
    const qtyInput = document.getElementById('dgGemQty');
    const priceInput = document.getElementById('dgGemPrice');
    if (qtyInput) qtyInput.value = repetitions;
    if (priceInput) priceInput.value = formatNumber(getCostPerGem());
  }
  updateCartPreview();
}

export function updateResetCostPreview() {
  const preview = document.getElementById('resetCostPreview');
  const breakdown = document.getElementById('resetCostBreakdown');
  if (!preview) return;

  const quantity = parseInt(document.getElementById('dgGemQty')?.value) || 0;
  const unitPrice = parseAlzInput(document.getElementById('dgGemPrice')?.value);
  const cost = quantity * unitPrice;

  preview.innerHTML = renderAlzValue(cost, true);
  if (breakdown) breakdown.textContent = `${quantity} gema${quantity !== 1 ? 's' : ''} x ${formatAlzGamer(unitPrice)}`;
}

export function saveRushForDay() {
  const cost = calculateRushCartCost();
  AppState.rushHistory[AppState.rushCartDate] = { total: cost.total, items: [...AppState.rushCart] };
  saveRushHistory();
  updateBalanceSidebar();
  renderPage();

  const messageEl = document.getElementById('rMsg');
  if (messageEl) {
    messageEl.style.display = 'block';
    messageEl.textContent = 'Rush de ' + formatDateBR(AppState.rushCartDate) + ' salvo! Total: ' + formatAlzGamer(cost.total);
    setTimeout(() => (messageEl.style.display = 'none'), 4000);
  }
}

export function deleteRushForDay(date) {
  if (!confirm('Remover rush do dia ' + formatDateBR(date) + '?')) return;
  delete AppState.rushHistory[date];
  saveRushHistory();
  updateBalanceSidebar();
  renderPage();
}

// Recarrega os itens de um rush já salvo de volta no carrinho, para adicionar/remover DGs
// e salvar de novo (sobrescrevendo o registro daquele dia).
export function editSavedRush(date) {
  const rush = AppState.rushHistory[date];
  if (!rush) return;
  AppState.rushCartDate = date;
  AppState.rushCart = (rush.items || []).map(item => ({ ...item }));
  renderPage();
}

// Igual editSavedRush, mas pra um rush novo em vez de editar o existente — carrega as mesmas
// DGs no carrinho com a data de hoje, pra repetir um rush parecido sem montar tudo de novo.
// Se hoje já tiver um rush salvo, o aviso de "já existe" (renderRushPage) cobre o aviso de
// sobrescrita — o usuário pode trocar a data antes de salvar.
export function duplicateSavedRush(date) {
  const rush = AppState.rushHistory[date];
  if (!rush) return;
  AppState.rushCartDate = todayISODate();
  AppState.rushCart = (rush.items || []).map(item => ({ ...item }));
  renderPage();
}
