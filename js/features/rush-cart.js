import { AppState, CREDIT_CATEGORIES, CREDIT_TIER_COSTS, CREDIT_DAILY_LIMIT } from '../state/app-state.js';
import { saveRushHistory, saveRushCredits, saveRushCreditItemNames, saveAppliedRoutes, saveTicketCraft } from '../state/persistence.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, formatDateBR, parseAlzInput, renderAlzValue } from '../utils/formatting.js';
import { todayISODate, normalizeForSearch } from '../utils/parsing.js';
import { updateBalanceSidebar, getItemPrice } from './drops.js';
import { computeDgComparison, computeResetWorth, computeRunsDoneOn } from './dg-session.js';
import { getDungeonDifficulty } from './dungeon-difficulty.js';
import { esc } from '../utils/escape.js';
import { actWithUndo } from './undo.js';
import { renderPage } from '../router.js';

// Ticket FABRICADO custa o que os itens gastos pra fazê-lo valiam, não o preço de mercado.
//
// Quem faz os próprios tickets não paga o preço de mercado por eles — paga em item farmado. Usar o
// preço de mercado superestima o custo de toda DG que consome ticket (e há DG de 2 e 3 por run),
// e isso contamina o Alz líquido, a comparação entre DGs, a rota e o "vale resetar".
//
// Por que NÃO descontar os itens do farme do dia, que seria o caminho intuitivo: as duas coisas
// juntas seriam contagem dupla, e escolhendo uma, esta é a melhor. Descontar do farme faria o
// ticket sair de graça — e aí DG que come 3 tickets por run pareceria tão barata quanto uma que
// não usa nenhum, arruinando exatamente a comparação que o app existe pra fazer. Aqui o item
// entra como farme (ele caiu, tem valor) e sai como custo do ticket. Fecha, e o custo aparece na
// DG que de fato o consome.
export function getTicketCraftCost() {
  const c = AppState.ticketCraft;
  if (c?.enabled === false) return null; // receita guardada, só desligada por hoje
  if (!c?.itemName || !(c.itemQty > 0) || !(c.ticketsProduced > 0)) return null;
  const precoItem = getItemPrice(c.itemName);
  if (!(precoItem > 0)) return null;
  return {
    unit: (c.itemQty * precoItem) / c.ticketsProduced,
    precoItem,
    itemName: c.itemName,
    itemQty: c.itemQty,
    ticketsProduced: c.ticketsProduced,
  };
}

// Preço a usar em toda conta que consome ticket: o de fabricação quando você fabrica, senão o de
// mercado que você digitou. Ponto único — antes cada lugar lia AppState.rushTicketPrice direto.
export function getTicketPrice() {
  return getTicketCraftCost()?.unit ?? (+AppState.rushTicketPrice || 0);
}

export function setTicketCraft(itemName, itemQty, ticketsProduced) {
  AppState.ticketCraft = {
    itemName: (itemName || '').trim(),
    itemQty: Math.max(0, parseFloat(String(itemQty).replace(',', '.')) || 0),
    ticketsProduced: Math.max(0, parseFloat(String(ticketsProduced).replace(',', '.')) || 0),
    enabled: true, // salvar a receita é o próprio ato de dizer "vou fabricar"
  };
  saveTicketCraft().catch(err => console.error('Falha ao salvar fabricação de ticket:', err));
  renderPage();
}

// Liga/desliga a receita GUARDANDO ela. A primeira versão apagava tudo pra voltar ao preço de
// mercado, o que obrigava a digitar item, quantidade e tickets de novo pra voltar a fabricar —
// caro demais pra uma decisão que muda de um dia pro outro ("hoje acabou meu set, comprei").
export function toggleTicketCraft() {
  const c = AppState.ticketCraft || {};
  AppState.ticketCraft = { ...c, enabled: c.enabled === false };
  saveTicketCraft().catch(err => console.error('Falha ao salvar fabricação de ticket:', err));
  renderPage();
}

// 1.000 Cash custam AppState.rushCardCashPrice Alz, e 1 gema de reset custa o equivalente a 1 Cash.
export function getCostPerGem() {
  return Math.round((+AppState.rushCardCashPrice || 0) / 1000);
}

// O que falta em Parâmetros do dia pra cobrar esta DG certo — [] = nada falta. Só cobra o preço
// que a PRÓPRIA dg consome (ticketsPerRun/gemsPerRun), não pede ticket de uma DG que só usa Alz.
// Existe pra travar ANTES do custo entrar em qualquer conta como 0 em silêncio — sem isso, o
// carrinho, o líquido de "Qual DG rende mais" e o Total líquido da Visão geral ficam menores do
// que o gasto real sem avisar em lugar nenhum (pedido do jogador: "obrigatório... pra não ficar
// nada errado").
export function missingCostConfigFor(dungeon) {
  const missing = [];
  if ((dungeon.ticketsPerRun || 0) > 0 && !(getTicketPrice() > 0)) missing.push('o preço do ticket');
  if ((dungeon.gemsPerRun || 0) > 0 && !(getCostPerGem() > 0)) missing.push('o preço do Card Cash (gema)');
  return missing;
}

// A parte variável do preço de um crédito: 1 unidade do item específico daquela categoria,
// comprado em Alz, preço que muda todo dia. Se o item estiver vinculado (rushCreditItemNames) E
// já tiver preço cadastrado em Cálculo de farme, puxa sozinho (linked:true) — senão cai no preço
// manual guardado em rushCredits[cat].marketPrice, pra continuar funcionando sem a vinculação.
export function getCreditItemPrice(categoryId) {
  const itemName = AppState.rushCreditItemNames[categoryId];
  if (itemName) {
    let price = getItemPrice(itemName);
    // Nome batendo exato falha fácil por maiúscula/acento (ex: vinculou "nucleo iniciante" mas
    // cadastrou "Núcleo Iniciante" em Cálculo de farme) — sem isso o preço some sem avisar por
    // quê. Cai pra um match tolerante antes de desistir e ir pro preço manual.
    if (!(price > 0)) {
      const normalized = normalizeForSearch(itemName);
      // Procura nos seus preços E no catálogo da comunidade — senão o match tolerante só
      // funcionaria pra quem já cadastrou o item na mão, justamente o caso que ele não precisa.
      const candidatos = [...new Set([...Object.keys(AppState.itemPrices), ...Object.keys(AppState.referenceItemPrices)])];
      const matchKey = candidatos.find(k => normalizeForSearch(k) === normalized);
      if (matchKey) price = getItemPrice(matchKey);
    }
    if (price > 0) return { price, linked: true, itemName };
  }
  return { price: AppState.rushCredits[categoryId].marketPrice || 0, linked: false, itemName: itemName || '' };
}

// Custo de 1 crédito = parte fixa (Alz + tickets, regra do jogo — CREDIT_TIER_COSTS, só muda se
// a equipe do servidor mexer no preço) + a parte variável de hoje (getCreditItemPrice). Os
// tickets usam o mesmo preço de ticket já cadastrado em "Parâmetros do dia", não um campo à parte.
export function getCreditUnitCost(categoryId) {
  const fixed = CREDIT_TIER_COSTS[categoryId];
  const ticketPrice = getTicketPrice();
  return fixed.fixedAlz + fixed.fixedTickets * ticketPrice + getCreditItemPrice(categoryId).price;
}

// Não é consumido por DG específica — dá 1h de uso do macro em qualquer DG, então entra no total
// do dia como um custo à parte, não vinculado a nenhum item do carrinho.
export function calculateCreditsCost() {
  return CREDIT_CATEGORIES.reduce((sum, cat) => sum + AppState.rushCredits[cat.id].quantity * getCreditUnitCost(cat.id), 0);
}

// Quantos créditos de cada faixa (Iniciante/Intermediário/Avançado) o carrinho de hoje
// provavelmente vai precisar — soma o tempo/run real (média das suas sessões, ver
// computeDgComparison) × repetições de cada DG do carrinho, agrupado pela dificuldade dela (ver
// dungeon-difficulty.js), e arredonda pra cima já que cada crédito só dá horas inteiras de uso.
// Antes disso o jogador tinha que fazer essa conta de cabeça — o app já tem os dois dados
// separados (dificuldade da DG + tempo/run), só faltava juntar.
//
// dgStats (opcional): aceita um computeDgComparison() já pronto — Planejamento de Rush chama
// isto, computeRouteComparison e computeResetWorth na mesma renderização, e as três recalculavam
// a mesma varredura do histórico (nunca purgado) de forma independente.
export function computeCartCreditNeeds(cart = AppState.rushCart, dgStats = computeDgComparison()) {
  const statsByDgId = {};
  dgStats.forEach(d => { statsByDgId[d.dungeonId] = d; });

  const msByTier = { avancado: 0, intermediario: 0, iniciante: 0 };
  let missingDataCount = 0;
  cart.forEach(item => {
    const stat = item.dungeonId ? statsByDgId[item.dungeonId] : null;
    if (!stat || stat.msPerRun == null) { missingDataCount++; return; }
    const tierId = getDungeonDifficulty(item.name).id;
    msByTier[tierId] += stat.msPerRun * item.repetitions;
  });

  return {
    avancado: Math.ceil(msByTier.avancado / 3600000),
    intermediario: Math.ceil(msByTier.intermediario / 3600000),
    iniciante: Math.ceil(msByTier.iniciante / 3600000),
    missingDataCount,
  };
}

// Créditos têm limite de compra por dia (CREDIT_DAILY_LIMIT, igual pras 3 faixas) — sugerir mais
// que isso não é um erro de conta, é o carrinho pedindo mais do que dá pra comprar num dia só.
export function isOverDailyCreditLimit(quantity) {
  return quantity > CREDIT_DAILY_LIMIT;
}

// Preenche "Qtd. comprada" de cada categoria de crédito com a sugestão calculada pro carrinho
// atual — o jogador ainda pode ajustar na mão depois, é só um ponto de partida.
export function applySuggestedCreditQuantities() {
  const needs = computeCartCreditNeeds();
  CREDIT_CATEGORIES.forEach(cat => {
    if (needs[cat.id] > 0) AppState.rushCredits[cat.id].quantity = needs[cat.id];
  });
  saveRushCredits().catch(err => console.error('Falha ao salvar créditos:', err));
  renderPage();
}

// Custo de cada repetição de uma DG = alzCost/run + (ticketsPerRun × preço do ticket, para DGs que
// misturam Alz e tickets, ex: 400.000 Alz + 1 ticket ou 1.000.000 Alz + 2 tickets)
// + (gemsPerRun × custo por gema atual, para DGs com entrada em gemas, ex: DX Premium = 15 gemas)
// + (se usedReset: quantidade de gemas informada × valor unitário da gema, definidos ao adicionar a DG).
// As gemas de entrada e as de reset são somadas no mesmo total de gemas/custo de gemas.
// Itens salvos antes desse valor por-item existir (usedReset sem resetGemQuantity/resetGemUnitPrice)
// caem de volta em 1 gema por repetição ao preço atual, para não quebrar rushes já salvos.
//
// Devolve o breakdown POR ITEM (items[]) junto com os agregados — antes só o agregado existia, e
// a tabela do carrinho (Planejamento de Rush) reimplementava essa fórmula inteira de novo, na
// mão, só pra mostrar o custo linha a linha. Duas cópias da mesma conta com risco real de
// divergir se a fórmula mudar um dia e só uma cópia for atualizada.
export function calculateRushCartCost(cart = AppState.rushCart) {
  const ticketPrice = getTicketPrice();
  const costPerGem = getCostPerGem();
  let alzFromDungeons = 0;
  let ticketCount = 0;
  let gemCount = 0;
  let gemCost = 0;

  const items = cart.map(item => {
    const alzCost = item.alzCost * item.repetitions;
    alzFromDungeons += alzCost;

    const ticketsPerRun = item.ticketsPerRun ?? (item.requiresTicket ? 1 : 0);
    const totalTickets = item.repetitions * ticketsPerRun;
    ticketCount += totalTickets;
    const ticketCostItem = totalTickets * ticketPrice;

    const entryGems = (item.gemsPerRun || 0) * item.repetitions;
    const entryGemCost = entryGems * costPerGem;
    gemCount += entryGems;
    gemCost += entryGemCost;

    let resetGemQuantity = 0, resetGemUnitPrice = 0, resetCost = 0;
    if (item.usedReset) {
      resetGemQuantity = item.resetGemQuantity ?? item.repetitions;
      resetGemUnitPrice = item.resetGemUnitPrice ?? costPerGem;
      resetCost = resetGemQuantity * resetGemUnitPrice;
      gemCount += resetGemQuantity;
      gemCost += resetCost;
    }

    return {
      item,
      alzCost,
      totalTickets, ticketPrice, ticketCost: ticketCostItem,
      entryGems, costPerGem, entryGemCost,
      resetGemQuantity, resetGemUnitPrice, resetCost,
      total: alzCost + ticketCostItem + entryGemCost + resetCost,
    };
  });

  const ticketCost = ticketCount * ticketPrice;
  const creditsCost = calculateCreditsCost();

  return {
    items,
    alzFromDungeons,
    ticketCount,
    ticketCost,
    gemCount,
    gemCost,
    creditsCost,
    // Custo atribuível ÀS DGS desta lista: Alz de entrada + tickets + gemas. Fora dele ficam os
    // créditos de macro, que são compra do DIA (quantidade fixa que você comprou, ver
    // calculateCreditsCost) e não dependem de quais DGs estão na lista.
    //
    // Quem quer "quanto vou gastar hoje" usa total. Quem quer "quanto custa esta rota" usa este —
    // senão o custo fixo do dia é lançado inteiro em cima de cada rota avaliada, e pior: numa
    // sugestão que soma rota + avulsas, ele é lançado DUAS vezes na mesma conta.
    dungeonsTotal: alzFromDungeons + ticketCost + gemCost,
    total: alzFromDungeons + ticketCost + gemCost + creditsCost,
  };
}

// Monta um item de carrinho a partir do id da DG — usado pelo Modo guiado. reset (opcional):
// { used, qty, price } marca que a DG foi resetada com N gemas ao preço informado.
export function buildCartItem(dungeonId, repetitions, reset = null) {
  const dungeon = AppState.dungeonList.find(d => d.id === dungeonId);
  if (!dungeon) return null;
  const usedReset = !!(reset && reset.used);
  return {
    dungeonId: dungeon.id,
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

  // Trava aqui, na fonte, em vez de deixar a DG entrar no carrinho com custo 0 — é o ponto onde
  // já dá pra saber com certeza que vai faltar preço, antes de qualquer conta ser feita em cima.
  const missing = missingCostConfigFor(dungeon);
  if (missing.length) {
    alert(`Falta configurar ${missing.join(' e ')} em Parâmetros do dia antes de adicionar "${dungeon.name}" — sem isso o custo dela entraria como 0 Alz, sem avisar.`);
    return;
  }

  const repetitions = parseInt(document.getElementById('dgRp').value) || 1;
  const usedReset = document.getElementById('dgReset').checked;
  const resetGemQuantity = usedReset ? (parseInt(document.getElementById('dgGemQty')?.value) || 0) : 0;
  const resetGemUnitPrice = usedReset ? parseAlzInput(document.getElementById('dgGemPrice')?.value) : 0;

  if (usedReset && resetGemQuantity > 0 && !(resetGemUnitPrice > 0)) {
    alert('Informe o valor da gema de reset antes de adicionar — sem isso o custo do reset entraria como 0 Alz, sem avisar.');
    return;
  }

  AppState.rushCart.push({
    dungeonId: dungeon.id,
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

// Esvazia o carrinho de uma vez (em vez de remover DG por DG) — junto, solta os selos de rota
// aplicada (ver appliedRoutesToday em rush-routes.js), já que um carrinho vazio não é mais
// nenhuma rota.
export function clearRushCart() {
  if (!AppState.rushCart.length) return;
  const carrinho = AppState.rushCart;
  const rotas = AppState.appliedRouteIds;
  AppState.rushCart = [];
  AppState.appliedRouteIds = [];
  saveAppliedRoutes().catch(err => console.error('Falha ao salvar rota aplicada:', err));
  renderPage();

  actWithUndo(`Carrinho limpo (${carrinho.length} DG${carrinho.length > 1 ? 's' : ''})`, () => {
    AppState.rushCart = carrinho;
    AppState.appliedRouteIds = rotas;
    saveAppliedRoutes().catch(err => console.error('Falha ao salvar rota aplicada:', err));
    renderPage();
  });
}

export function toggleCreditsManager() {
  AppState.isCreditsManagerOpen = !AppState.isCreditsManagerOpen;
  renderPage();
}

// Chama renderPage() (não só updateRushMetricsDisplay) porque a tabela de créditos mostra um
// subtotal por linha que também precisa refletir a mudança, não só as métricas do topo. Salva
// no backend igual ao resto do carrinho — antes esses dois campos não persistiam de verdade e
// resetavam a cada reload, mesmo no mesmo dia.
export function setRushCreditQuantity(categoryId, value) {
  AppState.rushCredits[categoryId].quantity = Math.max(0, parseInt(value) || 0);
  saveRushCredits().catch(err => console.error('Falha ao salvar créditos:', err));
  renderPage();
}

// Preço manual — só usado quando a categoria ainda não tem item vinculado (ou o item vinculado
// não tem preço cadastrado ainda). Com item vinculado e precificado, esse valor fica ignorado
// (ver getCreditItemPrice), mas continua salvo pra não perder o número se o vínculo for removido.
export function setRushCreditMarketPrice(categoryId, value) {
  AppState.rushCredits[categoryId].marketPrice = parseAlzInput(value);
  saveRushCredits().catch(err => console.error('Falha ao salvar créditos:', err));
  renderPage();
}

// Vincula o item específico da categoria (ex: "Núcleo Iniciante") — a partir daí o preço vem
// sozinho de Cálculo de farme (ver getCreditItemPrice), sem precisar digitar todo dia.
export function setRushCreditItemName(categoryId, value) {
  AppState.rushCreditItemNames[categoryId] = value.trim();
  saveRushCreditItemNames().catch(err => console.error('Falha ao salvar item do crédito:', err));
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
  const ticketPrice = getTicketPrice();
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

  const costLine = lines.length
    ? `Custo estimado: ${lines.join(' + ')} → <span style="color:${getAlzTierColor(total)};font-weight:700" title="${formatNumber(total)} Alz">${formatAlzGamer(total)}</span>`
    : 'Sem custo configurado para esta DG.';

  // Avisa ANTES de adicionar, se o histórico real dessa DG (mesma conta de "Vale a pena resetar?"
  // em Sessões de farme) diz que resetar não compensa — evita descobrir isso só depois de já ter
  // gasto as gemas.
  let warning = '';
  if (usedReset) {
    const resetWorth = computeResetWorth();
    const row = resetWorth.gemValueSet && resetWorth.rows.find(r => r.dungeonName === dungeon.name);
    if (row && !row.worth) {
      warning = `<div style="color:var(--err);font-size:11px;margin-top:6px"><i class="ti ti-alert-triangle"></i> Pelo seu histórico, resetar ${esc(dungeon.name)} não compensa (líquido de ${formatAlzGamer(row.netAlzPerRun)}/run não cobre o custo do reset). Veja "Vale a pena resetar?" em Sessões de farme.</div>`;
    }
  }

  preview.innerHTML = costLine + warning;
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

// Portão final antes de gravar o "gasto de hoje" (o número que Total líquido, na Visão geral, e
// o líquido de "Qual DG rende mais" usam) — pega qualquer item que tenha chegado no carrinho sem
// passar por addDungeonToCart (rota aplicada, sugestão por tempo, Modo guiado, ou um item de
// reset editado depois que o Card Cash mudou). resetGemUnitPrice é checado à parte porque fica
// CONGELADO no item desde quando foi adicionado — pode estar 0 mesmo com o Card Cash configurado
// agora, se foi adicionado antes disso.
function findMissingCostInCart(cart) {
  const missing = new Set();
  cart.forEach(item => {
    if ((item.ticketsPerRun || 0) > 0 && !(getTicketPrice() > 0)) missing.add('o preço do ticket');
    if ((item.gemsPerRun || 0) > 0 && !(getCostPerGem() > 0)) missing.add('o preço do Card Cash (gema)');
    if (item.usedReset && (item.resetGemQuantity || 0) > 0 && !((item.resetGemUnitPrice || 0) > 0)) {
      missing.add(`o valor da gema de reset de "${item.name}"`);
    }
  });
  return [...missing];
}

// Compara o rush PLANEJADO de um dia com o que você de fato rodou.
//
// O carrinho é um plano, e o custo salvo cobra o plano inteiro. Isso está certo pra quem compra
// as entradas todas de uma vez — mas quem compra conforme usa só gastou nas runs que fez. As runs
// não feitas viram custo fantasma: infla o gasto do dia, afunda o líquido e contamina o resultado
// do mês.
//
// Não faz nada sozinho: as duas leituras são legítimas (você pode ter comprado adiantado e sobrou
// entrada pra amanhã), então isso só MOSTRA a diferença e deixa você decidir.
export function computeRushVsDone(dateISO) {
  const rush = AppState.rushHistory[dateISO];
  if (!rush?.items?.length) return null;

  const linhas = rush.items.map(item => {
    const feitas = computeRunsDoneOn(item.name, dateISO);
    // Farmou essa DG no dia, mas nenhuma sessão dela tem "Runs feitas" preenchido. Zero runs
    // registradas NÃO é a mesma coisa que zero runs feitas — e a diferença aqui é dinheiro:
    // tratar como não feita apagaria o custo inteiro de um farme que aconteceu, calado. Sem
    // saber quantas foram, o seguro é manter o planejado e pedir pra você preencher.
    const temSessaoSemRuns = feitas === 0 && AppState.dgSessions.some(s => s.date === dateISO && s.dungeonName === item.name);
    // Teto no planejado: fazer MAIS runs que o plano não vira custo extra aqui — aquele farme a
    // mais está fora deste rush, e o carrinho é que teria de ser corrigido, não a cobrança.
    const cobradas = temSessaoSemRuns ? item.repetitions : Math.min(item.repetitions, feitas);
    return { ...item, planejadas: item.repetitions, feitas, cobradas, temSessaoSemRuns };
  });

  const semRuns = linhas.filter(l => l.temSessaoSemRuns).map(l => l.name);

  const itensSoFeitos = linhas
    .filter(l => l.cobradas > 0)
    .map(l => buildCartItem(l.dungeonId, l.cobradas, l.usedReset ? { used: true, qty: l.resetGemQuantity, price: l.resetGemUnitPrice } : null))
    .filter(Boolean);

  // Créditos entram nos dois totais: são compra do dia, feita independente de quantas runs você
  // rodou. Tirar eles daqui faria a comparação medir duas coisas diferentes.
  const totalSeSoOFeito = calculateRushCartCost(itensSoFeitos).total;
  const naoFeitas = linhas.reduce((sum, l) => sum + (l.planejadas - l.cobradas), 0);

  return {
    linhas,
    naoFeitas,
    semRuns,
    totalPlanejado: rush.total || 0,
    totalSeSoOFeito,
    diferenca: (rush.total || 0) - totalSeSoOFeito,
  };
}

// Reescreve o rush do dia cobrando só as runs feitas. Mexe no REGISTRO daquele dia, não no
// carrinho de hoje: reconciliar é acertar o que já passou.
export function chargeOnlyDoneRuns(dateISO) {
  const cmp = computeRushVsDone(dateISO);
  if (!cmp || cmp.naoFeitas <= 0) return;

  const rush = AppState.rushHistory[dateISO];
  const anterior = JSON.parse(JSON.stringify(rush));

  const itens = cmp.linhas
    .filter(l => l.cobradas > 0)
    .map(l => buildCartItem(l.dungeonId, l.cobradas, l.usedReset ? { used: true, qty: l.resetGemQuantity, price: l.resetGemUnitPrice } : null))
    .filter(Boolean);

  AppState.rushHistory[dateISO] = { ...rush, items: itens, total: cmp.totalSeSoOFeito };
  saveRushHistory();
  updateBalanceSidebar();
  renderPage();

  actWithUndo(
    `Rush de ${formatDateBR(dateISO)} ajustado: ${formatAlzGamer(cmp.diferenca)} a menos (${cmp.naoFeitas} run(s) não feitas)`,
    () => {
      AppState.rushHistory[dateISO] = anterior;
      saveRushHistory();
      updateBalanceSidebar();
      renderPage();
    }
  );
}

export function saveRushForDay() {
  const missing = findMissingCostInCart(AppState.rushCart);
  if (missing.length) {
    alert(`Não dá pra salvar: falta ${missing.join(', ')}. Configure em Parâmetros do dia (ou corrija o item no carrinho) antes de salvar — sem isso o custo de hoje ficaria contado errado.`);
    return;
  }
  const cost = calculateRushCartCost();
  // Créditos de macro são um valor GLOBAL (não por data, sem histórico próprio) — mas o custo
  // deles entra no total de todo dia salvo. Sem guardar a quantidade junto, editar um rush de
  // outro dia (só pra corrigir uma DG) e salvar de novo trocava silenciosamente o crédito daquele
  // dia pela quantidade de HOJE, reescrevendo um total que nunca existiu de verdade. Snapshot
  // (não referência) pra editar os créditos de hoje depois não mudar o que já foi salvo.
  AppState.rushHistory[AppState.rushCartDate] = {
    total: cost.total,
    items: [...AppState.rushCart],
    credits: JSON.parse(JSON.stringify(AppState.rushCredits)),
  };
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
  const rush = AppState.rushHistory[date];
  if (!rush) return;
  delete AppState.rushHistory[date];
  saveRushHistory();
  updateBalanceSidebar();
  renderPage();

  actWithUndo(`Rush de ${formatDateBR(date)} removido (${formatAlzGamer(rush.total || 0)})`, () => {
    AppState.rushHistory[date] = rush;
    saveRushHistory();
    updateBalanceSidebar();
    renderPage();
  });
}

// Recarrega os itens de um rush já salvo de volta no carrinho, para adicionar/remover DGs
// e salvar de novo (sobrescrevendo o registro daquele dia). Restaura também os créditos DAQUELE
// dia (ver saveRushForDay) — sem isso, editar só a lista de DGs e salvar de novo herdaria a
// quantidade de crédito de HOJE (valor global, sem histórico próprio) por engano. Rush salvo
// antes desse snapshot existir (sem `.credits`) cai no que já estiver configurado agora.
export function editSavedRush(date) {
  const rush = AppState.rushHistory[date];
  if (!rush) return;
  AppState.rushCartDate = date;
  AppState.rushCart = (rush.items || []).map(item => ({ ...item }));
  if (rush.credits) AppState.rushCredits = JSON.parse(JSON.stringify(rush.credits));
  renderPage();
}

// Igual editSavedRush, mas pra um rush novo em vez de editar o existente — carrega as mesmas
// DGs (e os mesmos créditos) no carrinho com a data de hoje, pra repetir um rush parecido sem
// montar tudo de novo. Se hoje já tiver um rush salvo, o aviso de "já existe" (renderRushPage)
// cobre o aviso de sobrescrita — o usuário pode trocar a data antes de salvar.
export function duplicateSavedRush(date) {
  const rush = AppState.rushHistory[date];
  if (!rush) return;
  AppState.rushCartDate = todayISODate();
  AppState.rushCart = (rush.items || []).map(item => ({ ...item }));
  if (rush.credits) AppState.rushCredits = JSON.parse(JSON.stringify(rush.credits));
  renderPage();
}
