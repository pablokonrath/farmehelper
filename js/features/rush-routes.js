import { AppState } from '../state/app-state.js';
import { saveRushRoutes, saveAppliedRoutes } from '../state/persistence.js';
import { buildCartItem, calculateRushCartCost, getCostPerGem } from './rush-cart.js';
import { computeDgComparison, computeResetWorth, DAILY_RUN_LIMIT } from './dg-session.js';
import { actWithUndo } from './undo.js';
import { renderPage } from '../router.js';

// Custo extra (em Alz) de rodar uma DG além do limite diário de ${DAILY_RUN_LIMIT}, usando reset
// por gemas — mesma conta de "Vale a pena resetar?" em Sessões de farme, só que amortizada pra
// quantas repetições passaram do limite. Sem preço do Card Cash configurado (Parâmetros do dia),
// devolve 0 — não dá pra estimar sem esse dado, então trata como se não fosse resetar.
function extraResetCostAlz(repetitions) {
  const param = buildResetParamForRepetitions(repetitions);
  return param ? param.qty * param.price : 0;
}

// Monta o { used, qty, price } que buildCartItem espera, pras repetições que passam do limite
// diário — mesma amortização usada em extraResetCostAlz, só que no formato que o carrinho
// entende, pra o custo aplicado no carrinho bater com o estimado na sugestão/comparativo. Valor
// da gema vem de getCostPerGem() (Parâmetros do dia) — mesma fonte usada em todo o resto do
// custo de reset, não um valor à parte.
function buildResetParamForRepetitions(repetitions) {
  const cfg = AppState.resetConfig;
  const extraRuns = Math.max(0, repetitions - DAILY_RUN_LIMIT);
  const gemValue = getCostPerGem();
  if (!(gemValue > 0) || extraRuns <= 0) return null;
  const runsPerReset = Math.max(1, cfg.runsPerReset || 1);
  const resetBatches = Math.ceil(extraRuns / runsPerReset);
  return { used: true, qty: resetBatches * (cfg.resetCostGems || 0), price: gemValue };
}

// Soma repetições numa lista de itens de carrinho já montada — dungeonId repetido tem as
// repetições SOMADAS (recalculando o reset pelo total combinado) em vez de duplicar a linha.
// Compartilhado entre aplicar rota (soma no que já tem no carrinho) e a sugestão por tempo
// (completa a sobra de tempo da rota com avulsas, possivelmente na mesma DG da rota).
function mergeIntoCartItems(cartItems, dungeonId, repetitions) {
  const existing = cartItems.find(item => item.dungeonId === dungeonId);
  if (existing) {
    existing.repetitions += repetitions;
    const resetParam = buildResetParamForRepetitions(existing.repetitions);
    existing.usedReset = !!resetParam;
    existing.resetGemQuantity = resetParam ? resetParam.qty : 0;
    existing.resetGemUnitPrice = resetParam ? resetParam.price : 0;
  } else {
    const cartItem = buildCartItem(dungeonId, repetitions, buildResetParamForRepetitions(repetitions));
    if (cartItem) cartItems.push(cartItem);
  }
}

// Salva o carrinho atual como rota — nova (nome digitado) ou sobrescrevendo a que estiver sendo
// editada (ver startEditingRushRoute/AppState.editingRouteId). Guarda só dungeonId + repetições
// (nunca preço), pra aplicar depois sempre com os valores atuais da DG (ver applyRushRoute).
export function createRushRouteFromCart() {
  const input = document.getElementById('newRushRouteName');
  const name = input?.value.trim();
  if (!name || !AppState.rushCart.length) return;

  const items = AppState.rushCart
    // Itens adicionados antes do campo dungeonId existir (rush antigo carregado no carrinho)
    // caem no fallback por nome — dungeonList é um catálogo flat, nome já é praticamente único.
    .map(item => ({
      dungeonId: item.dungeonId || AppState.dungeonList.find(d => d.name === item.name)?.id,
      repetitions: item.repetitions,
    }))
    .filter(item => item.dungeonId);

  if (!items.length) return;

  const editing = AppState.editingRouteId ? AppState.rushRoutes.find(r => r.id === AppState.editingRouteId) : null;
  if (editing) {
    editing.name = name;
    editing.items = items;
    AppState.editingRouteId = null;
  } else {
    AppState.rushRoutes.push({ id: 'route' + Date.now(), name, items });
  }
  saveRushRoutes().catch(err => console.error('Falha ao salvar rota:', err));
  input.value = '';
  renderPage();
}

// SOMA os itens de uma rota salva ao carrinho de hoje (não substitui) — dá pra combinar duas
// rotas diferentes no mesmo dia. DG que já está no carrinho (de outra rota ou adicionada na mão)
// tem as repetições SOMADAS em vez de duplicar a linha, e o reset é recalculado com base no total
// combinado (pode passar o limite diário só depois de somar). Preços/custos são sempre os ATUAIS
// de cada DG — uma rota nunca guarda preço, só a composição. DG removida desde que a rota foi
// criada é ignorada. Marca a rota como aplicada hoje — sessão iniciada numa DG dela entra no
// histórico já rotulada com o nome da rota (ver startDgSession em dg-session.js e o agrupamento
// em Sessões de farme).
export function applyRushRoute(routeId) {
  const route = AppState.rushRoutes.find(r => r.id === routeId);
  if (!route) return;

  let skipped = 0;
  route.items.forEach(it => {
    if (!AppState.dungeonList.find(d => d.id === it.dungeonId)) { skipped++; return; }
    mergeIntoCartItems(AppState.rushCart, it.dungeonId, it.repetitions);
  });

  if (!AppState.appliedRouteIds.includes(route.id)) AppState.appliedRouteIds.push(route.id);
  saveAppliedRoutes().catch(err => console.error('Falha ao salvar rota aplicada:', err));
  renderPage();

  if (skipped > 0) {
    alert(`${skipped} DG${skipped > 1 ? 's' : ''} desta rota não existe${skipped > 1 ? 'm' : ''} mais no catálogo e foi${skipped > 1 ? 'ram' : ''} ignorada${skipped > 1 ? 's' : ''}.`);
  }
}

// Rotas aplicadas hoje (AppState.appliedRouteIds) — mostrado como selo no carrinho de DGs de rush
// diário. Como aplicar SOMA (pode ter 2+ rotas misturadas, e uma DG repetida em ambas vira uma
// única linha com repetições somadas), não dá pra verificar com certeza se o carrinho ainda
// "é exatamente" cada rota — é só a lista do que foi aplicado, não uma prova de que nada mudou.
export function appliedRoutesToday() {
  return AppState.appliedRouteIds.map(id => AppState.rushRoutes.find(r => r.id === id)).filter(Boolean);
}

// Carrega a rota no carrinho pra EDIÇÃO — ao contrário de applyRushRoute, SUBSTITUI o carrinho
// (edição é sobre ESSA rota isolada, não sobre o plano combinado do dia) e marca editingRouteId,
// então o próximo "salvar" sobrescreve esta rota em vez de criar uma nova (e não mexe em
// appliedRouteIds — editar não é "aplicar pra farmar hoje").
export function startEditingRushRoute(routeId) {
  const route = AppState.rushRoutes.find(r => r.id === routeId);
  if (!route) return;
  AppState.rushCart = route.items.map(it => buildCartItem(it.dungeonId, it.repetitions, buildResetParamForRepetitions(it.repetitions))).filter(Boolean);
  AppState.editingRouteId = route.id;
  renderPage();
  document.getElementById('newRushRouteName')?.focus();
}

export function cancelEditingRushRoute() {
  AppState.editingRouteId = null;
  renderPage();
}

export function renameRushRoute(routeId) {
  const route = AppState.rushRoutes.find(r => r.id === routeId);
  if (!route) return;
  const name = prompt('Novo nome da rota:', route.name);
  if (!name || !name.trim()) return;
  route.name = name.trim();
  saveRushRoutes().catch(err => console.error('Falha ao salvar rota:', err));
  renderPage();
}

export function deleteRushRoute(routeId) {
  const index = AppState.rushRoutes.findIndex(r => r.id === routeId);
  if (index < 0) return;
  const [route] = AppState.rushRoutes.splice(index, 1);
  const estavaAplicada = AppState.appliedRouteIds.includes(routeId);
  if (AppState.editingRouteId === routeId) AppState.editingRouteId = null;
  if (estavaAplicada) {
    AppState.appliedRouteIds = AppState.appliedRouteIds.filter(id => id !== routeId);
    saveAppliedRoutes().catch(err => console.error('Falha ao salvar rota aplicada:', err));
  }
  saveRushRoutes().catch(err => console.error('Falha ao salvar rota:', err));
  renderPage();

  actWithUndo(`Rota removida: ${route.name}`, () => {
    AppState.rushRoutes.splice(index, 0, route);
    if (estavaAplicada && !AppState.appliedRouteIds.includes(routeId)) {
      AppState.appliedRouteIds.push(routeId);
      saveAppliedRoutes().catch(err => console.error('Falha ao salvar rota aplicada:', err));
    }
    saveRushRoutes().catch(err => console.error('Falha ao salvar rota:', err));
    renderPage();
  });
}

// Compara o retorno esperado de cada rota: Alz/run histórico de cada DG × repetições (via
// computeDgComparison — mesma conta de "Qual DG rende mais" em Sessões de farme) menos o custo de
// rodar a rota nos preços ATUAIS (mesma conta do carrinho). DG sem sessão/runs registrados ainda
// não entra no retorno — fica sinalizado em missingDataCount, pra não fingir que uma rota com DG
// nunca farmada rende Alz que a gente não tem como saber.
//
// Ordenado por Lucro/hora, não pelo lucro total bruto — uma rota com 6h de DG pode ter lucro total
// maior que uma de 1h só por ser mais longa, sem ser de fato a melhor forma de gastar seu tempo.
// Rota sem tempo estimado (hasTimeData falso ou nenhuma DG com msPerRun) não entra nessa
// comparação — fica no fim, ordenada só pelo lucro bruto entre si, já que não dá pra saber a
// eficiência dela ainda.
//
// dgStats (opcional): mesma ideia do parâmetro em computeResetWorth — aceita um
// computeDgComparison() já pronto pra não recalcular a mesma varredura do histórico inteiro
// quando quem chama (Sessões de farme, suggestRouteForTime) já tem um em mãos.
export function computeRouteComparison(dgStats = computeDgComparison()) {
  const dgStatsById = {};
  dgStats.forEach(d => { dgStatsById[d.dungeonId] = d; });

  return AppState.rushRoutes.map(route => {
    let expectedAlz = 0;
    let missingDataCount = 0;
    const cartItems = [];

    let estimatedTimeMs = 0;
    const missingTimeDataDgNames = [];
    const timeBreakdown = [];
    let resetCost = 0;
    let needsReset = false;

    route.items.forEach(it => {
      const stat = dgStatsById[it.dungeonId];
      if (stat && stat.alzPerRun != null) expectedAlz += stat.alzPerRun * it.repetitions;
      else missingDataCount++;

      if (stat && stat.msPerRun != null) {
        const timeMs = stat.msPerRun * it.repetitions;
        estimatedTimeMs += timeMs;
        timeBreakdown.push({ dungeonName: stat.dungeonName, repetitions: it.repetitions, msPerRun: stat.msPerRun, timeMs });
      } else {
        missingTimeDataDgNames.push(stat?.dungeonName || AppState.dungeonList.find(d => d.id === it.dungeonId)?.name || it.dungeonId);
      }

      const extra = extraResetCostAlz(it.repetitions);
      if (extra > 0) { resetCost += extra; needsReset = true; }

      const cartItem = buildCartItem(it.dungeonId, it.repetitions);
      if (cartItem) cartItems.push(cartItem);
    });

    const cost = calculateRushCartCost(cartItems).total + resetCost;
    const hasTimeData = missingTimeDataDgNames.length === 0;
    const profit = expectedAlz - cost;
    // estimatedTimeMs aqui já é a soma PARCIAL (só das DGs com dado) — só vira profitPerHour
    // quando hasTimeData é true (soma completa), senão a eficiência calculada seria enganosa
    // (tempo subestimado por faltar DG).
    const profitPerHour = hasTimeData && estimatedTimeMs > 0 ? profit / (estimatedTimeMs / 3600000) : null;
    return {
      id: route.id,
      name: route.name,
      dgCount: route.items.length,
      missingDataCount,
      expectedAlz,
      cost,
      needsReset,
      profit,
      // Soma parcial: entra o tempo de toda DG que já tem sessão com runs preenchidos, mesmo que
      // outra DG da mesma rota ainda não tenha — hasTimeData (e missingTimeDataDgNames) sinalizam
      // que é parcial em vez de esconder a estimativa inteira. suggestRouteForTime ainda exige
      // hasTimeData=true pra não sugerir uma rota "rápida" que só parece rápida por faltar dado.
      estimatedTimeMs: estimatedTimeMs > 0 ? estimatedTimeMs : null,
      hasTimeData,
      missingTimeDataDgNames,
      profitPerHour,
      // Detalhe por DG do tempo estimado (tempo/run × repetições) — usado no tooltip do "Tempo
      // estimado" pra mostrar de onde vem o total, sem precisar abrir a rota pra editar.
      timeBreakdown,
    };
  }).sort((a, b) => {
    if (a.profitPerHour != null && b.profitPerHour != null) return b.profitPerHour - a.profitPerHour;
    if (a.profitPerHour != null) return -1;
    if (b.profitPerHour != null) return 1;
    return b.profit - a.profit;
  });
}

// Preenche até `remainingMs` de tempo com DGs avulsas, gulosamente pela melhor Alz/hora,
// respeitando o limite diário de runs por DG (usedRunsByDgId conta o que já foi "gasto" por
// outra coisa, ex: uma rota salva, contra esse limite). DG onde resetar compensa (ver "Vale a
// pena resetar?") não fica travada no limite — sobra de tempo só passa pra próxima DG quando
// esta já não vale mais a pena resetar (ou o valor da gema não foi configurado).
function greedyFillTimeWithDgs(remainingMs, dgStats, resetWorth, usedRunsByDgId) {
  const worthResetByDgName = {};
  resetWorth.rows.forEach(r => { worthResetByDgName[r.dungeonName] = r.worth; });
  const candidates = [...dgStats].filter(d => d.msPerRun != null && d.alzPerHour != null).sort((a, b) => b.alzPerHour - a.alzPerHour);

  const items = [];
  let anyReset = false;
  candidates.forEach(dg => {
    if (remainingMs <= 0) return;
    const canExceedCap = resetWorth.gemValueSet && worthResetByDgName[dg.dungeonName];
    const cap = canExceedCap ? Infinity : DAILY_RUN_LIMIT;
    const alreadyUsed = usedRunsByDgId[dg.dungeonId] || 0;
    const capRemaining = cap - alreadyUsed;
    if (capRemaining <= 0) return;
    const runs = Math.min(Math.floor(remainingMs / dg.msPerRun), capRemaining);
    if (runs <= 0) return;
    const totalForDg = alreadyUsed + runs;
    if (totalForDg > DAILY_RUN_LIMIT) anyReset = true;
    items.push({ dungeonId: dg.dungeonId, dungeonName: dg.dungeonName, repetitions: runs, msPerRun: dg.msPerRun, usedReset: totalForDg > DAILY_RUN_LIMIT });
    remainingMs -= runs * dg.msPerRun;
  });
  return { items, remainingMs, anyReset };
}

// "Hoje tenho N horas, qual rota eu faço?" — primeiro tenta achar a rota SALVA de melhor
// Lucro/hora que cabe no tempo (sem estourar) — computeRouteComparison já vem ordenada por
// eficiência, então a primeira que cabe já é a melhor forma de gastar essas N horas, não só a
// que mais lucra bruto. Se sobrar tempo depois da rota, completa com DGs avulsas (fora da rota,
// gulosamente pela melhor Alz/hora) em vez de deixar o resto do orçamento sem sugestão nenhuma —
// pode inclusive ser mais runs da MESMA DG da rota, se ainda houver espaço no limite diário dela.
// Se nenhuma rota salva couber (ou não existir nenhuma ainda), monta um encaixe novo do zero.
//
// dgStats (opcional): mesma ideia de computeResetWorth/computeRouteComparison — evita recalcular
// computeDgComparison() de novo quando Sessões de farme já calculou um pra esta renderização.
export function suggestRouteForTime(hoursAvailable, dgStats = computeDgComparison()) {
  const budgetMs = hoursAvailable * 3600000;
  if (!(budgetMs > 0)) return null;

  const resetWorth = computeResetWorth(dgStats);

  const savedFitting = computeRouteComparison(dgStats).filter(r => r.hasTimeData && r.estimatedTimeMs <= budgetMs);
  if (savedFitting.length) {
    const route = savedFitting[0];
    const savedRouteDef = AppState.rushRoutes.find(r => r.id === route.id);
    const usedRunsByDgId = {};
    savedRouteDef?.items.forEach(it => { usedRunsByDgId[it.dungeonId] = (usedRunsByDgId[it.dungeonId] || 0) + it.repetitions; });

    const fill = greedyFillTimeWithDgs(budgetMs - route.estimatedTimeMs, dgStats, resetWorth, usedRunsByDgId);
    if (!fill.items.length) return { type: 'saved', ...route };

    const extraExpectedAlz = fill.items.reduce((sum, it) => {
      const stat = dgStats.find(d => d.dungeonId === it.dungeonId);
      return sum + (stat?.alzPerRun ?? 0) * it.repetitions;
    }, 0);
    const extraCartItems = fill.items.map(it => buildCartItem(it.dungeonId, it.repetitions)).filter(Boolean);
    // Reset é sobre o total combinado (rota + extra) por DG, não só a parte extra isolada — senão
    // uma DG que já quase batia o limite na rota escaparia do custo de reset ao completar com avulsas.
    const extraResetCost = fill.items.reduce((sum, it) => {
      const alreadyUsed = usedRunsByDgId[it.dungeonId] || 0;
      return sum + (extraResetCostAlz(alreadyUsed + it.repetitions) - extraResetCostAlz(alreadyUsed));
    }, 0);
    const extraCost = calculateRushCartCost(extraCartItems).total + extraResetCost;

    return {
      type: 'saved+extra',
      ...route,
      extraItems: fill.items,
      estimatedTimeMs: budgetMs - fill.remainingMs,
      // Breakdown combinado (rota + avulsas) pro tooltip do "Tempo estimado" mostrar tudo, não só
      // a parte da rota.
      timeBreakdown: [
        ...route.timeBreakdown,
        ...fill.items.map(it => ({ dungeonName: it.dungeonName, repetitions: it.repetitions, msPerRun: it.msPerRun, timeMs: it.msPerRun * it.repetitions })),
      ],
      expectedAlz: route.expectedAlz + extraExpectedAlz,
      cost: route.cost + extraCost,
      profit: route.profit + extraExpectedAlz - extraCost,
      needsReset: route.needsReset || fill.anyReset,
    };
  }

  return buildGeneratedRoute(budgetMs, dgStats, resetWorth);
}

// Monta uma rota do ZERO pro tempo dado, escolhendo DGs pelo rendimento — sem olhar pras rotas
// salvas. Era código embutido no fim de suggestRouteForTime e só rodava quando NENHUMA rota salva
// cabia no tempo. Na prática isso escondia o gerador de quem tem rotas salvas: sempre aparecia
// uma delas, e a montagem automática nunca chegava à tela. Virou função própria pra poder ser
// oferecida SEMPRE, ao lado da rota salva, com os dois lucros à vista pra você escolher.
export function buildGeneratedRoute(budgetMs, dgStats = computeDgComparison(), resetWorth = computeResetWorth(dgStats)) {
  const fill = greedyFillTimeWithDgs(budgetMs, dgStats, resetWorth, {});
  if (!fill.items.length) return { type: 'none' };

  const expectedAlz = fill.items.reduce((sum, it) => {
    const stat = dgStats.find(d => d.dungeonId === it.dungeonId);
    return sum + (stat?.alzPerRun ?? 0) * it.repetitions;
  }, 0);
  const cartItems = fill.items.map(it => buildCartItem(it.dungeonId, it.repetitions)).filter(Boolean);
  const resetCost = fill.items.reduce((sum, it) => sum + extraResetCostAlz(it.repetitions), 0);
  const cost = calculateRushCartCost(cartItems).total + resetCost;

  return {
    type: 'generated',
    items: fill.items,
    dgCount: fill.items.length,
    expectedAlz,
    cost,
    needsReset: fill.anyReset,
    profit: expectedAlz - cost,
    estimatedTimeMs: budgetMs - fill.remainingMs,
  };
}

// Aplica a montagem do zero no carrinho, ignorando a rota salva que o card sugeriu ao lado.
export function applyGeneratedRoute() {
  const hours = Number(AppState.timeAvailableHours) || 0;
  if (!(hours > 0)) return;
  const gerada = buildGeneratedRoute(hours * 3600000);
  if (!gerada || gerada.type === 'none') return;

  AppState.rushCart = gerada.items
    .map(it => buildCartItem(it.dungeonId, it.repetitions, buildResetParamForRepetitions(it.repetitions)))
    .filter(Boolean);
  // Carrinho montado na hora não pertence a rota nenhuma — deixar uma rota "aplicada" faria as
  // sessões desse farme herdarem o rótulo dela no histórico.
  AppState.appliedRouteIds = [];
  saveAppliedRoutes().catch(err => console.error('Falha ao salvar rota aplicada:', err));
  renderPage();
}

export function setTimeAvailableHours(value) {
  AppState.timeAvailableHours = value;
  renderPage();
}

// Aplica a sugestão (salva ou recém-montada) no carrinho de hoje — recalcula na hora em vez de
// guardar estado à parte, pra nunca aplicar algo diferente do que está na tela. Ao contrário de
// applyRushRoute, SUBSTITUI o carrinho (não soma): a promessa da sugestão é "esse plano cabe nas
// suas N horas" — misturar com o que já estava no carrinho invalidaria essa conta.
export function applySuggestedRoute() {
  const hours = Number(AppState.timeAvailableHours) || 0;
  const suggestion = suggestRouteForTime(hours);
  if (!suggestion || suggestion.type === 'none') return;

  if (suggestion.type === 'saved' || suggestion.type === 'saved+extra') {
    const route = AppState.rushRoutes.find(r => r.id === suggestion.id);
    if (!route) return;
    const cartItems = [];
    route.items.forEach(it => mergeIntoCartItems(cartItems, it.dungeonId, it.repetitions));
    // Avulsas que completam a sobra de tempo do orçamento (ver suggestRouteForTime) — podem cair
    // na MESMA DG da rota, aí soma na mesma linha em vez de duplicar.
    (suggestion.extraItems || []).forEach(it => mergeIntoCartItems(cartItems, it.dungeonId, it.repetitions));
    AppState.rushCart = cartItems;
    AppState.appliedRouteIds = [route.id];
    saveAppliedRoutes().catch(err => console.error('Falha ao salvar rota aplicada:', err));
    renderPage();
    return;
  }

  const cartItems = suggestion.items.map(it => buildCartItem(it.dungeonId, it.repetitions, buildResetParamForRepetitions(it.repetitions))).filter(Boolean);
  AppState.rushCart = cartItems;
  AppState.appliedRouteIds = [];
  saveAppliedRoutes().catch(err => console.error('Falha ao salvar rota aplicada:', err));
  renderPage();
}
