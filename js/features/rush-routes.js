import { AppState } from '../state/app-state.js';
import { saveRushRoutes } from '../state/persistence.js';
import { buildCartItem, calculateRushCartCost } from './rush-cart.js';
import { computeDgComparison, DAILY_RUN_LIMIT } from './dg-session.js';
import { renderPage } from '../router.js';

// Salva o carrinho atual como uma rota nomeada, reutilizável (sem data fixa) — reaproveita a
// mesma UI de montar carrinho que já existe, só troca "salvar rush do dia" por "salvar como
// rota". Guarda só dungeonId + repetições (nunca preço), pra aplicar depois sempre com os
// valores atuais da DG (ver applyRushRoute).
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

  AppState.rushRoutes.push({ id: 'route' + Date.now(), name, items });
  saveRushRoutes().catch(err => console.error('Falha ao salvar rota:', err));
  input.value = '';
  renderPage();
}

// Recarrega os itens de uma rota salva no carrinho, com os preços/custos ATUAIS de cada DG —
// uma rota nunca guarda preço, só a composição (DG + repetições). DG removida desde que a rota
// foi criada é ignorada (buildCartItem devolve null pra ela).
export function applyRushRoute(routeId) {
  const route = AppState.rushRoutes.find(r => r.id === routeId);
  if (!route) return;

  const cartItems = route.items.map(it => buildCartItem(it.dungeonId, it.repetitions)).filter(Boolean);
  const skipped = route.items.length - cartItems.length;

  AppState.rushCart = cartItems;
  renderPage();

  if (skipped > 0) {
    alert(`${skipped} DG${skipped > 1 ? 's' : ''} desta rota não existe${skipped > 1 ? 'm' : ''} mais no catálogo e foi${skipped > 1 ? 'ram' : ''} ignorada${skipped > 1 ? 's' : ''}.`);
  }
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
  const route = AppState.rushRoutes.find(r => r.id === routeId);
  if (!route || !confirm(`Excluir a rota "${route.name}"?`)) return;
  AppState.rushRoutes = AppState.rushRoutes.filter(r => r.id !== routeId);
  saveRushRoutes().catch(err => console.error('Falha ao salvar rota:', err));
  renderPage();
}

// Compara o lucro esperado de cada rota: retorno (Alz/run histórico de cada DG × repetições,
// via computeDgComparison — mesma conta de "Qual DG rende mais" em Sessões de farme) menos o
// custo de rodar a rota nos preços ATUAIS (mesma conta do carrinho). DG sem sessão/runs
// registrados ainda não entra no retorno — fica sinalizado em missingDataCount, pra não fingir
// que uma rota com DG nunca farmada rende Alz que a gente não tem como saber.
export function computeRouteComparison() {
  const dgStatsById = {};
  computeDgComparison().forEach(d => { dgStatsById[d.dungeonId] = d; });

  return AppState.rushRoutes.map(route => {
    let expectedAlz = 0;
    let missingDataCount = 0;
    const cartItems = [];

    let estimatedTimeMs = 0;
    let hasTimeData = true;

    route.items.forEach(it => {
      const stat = dgStatsById[it.dungeonId];
      if (stat && stat.alzPerRun != null) expectedAlz += stat.alzPerRun * it.repetitions;
      else missingDataCount++;

      if (stat && stat.msPerRun != null) estimatedTimeMs += stat.msPerRun * it.repetitions;
      else hasTimeData = false;

      const cartItem = buildCartItem(it.dungeonId, it.repetitions);
      if (cartItem) cartItems.push(cartItem);
    });

    const cost = calculateRushCartCost(cartItems).total;
    return {
      id: route.id,
      name: route.name,
      dgCount: route.items.length,
      missingDataCount,
      expectedAlz,
      cost,
      profit: expectedAlz - cost,
      // Só confiável se TODA DG da rota tem tempo/run conhecido — uma estimativa parcial
      // subestimaria o tempo real (ver suggestRouteForTime, que depende disso pra não sugerir
      // uma rota "rápida" que na verdade só parece rápida por faltar dado de uma DG).
      estimatedTimeMs: hasTimeData ? estimatedTimeMs : null,
      hasTimeData,
    };
  }).sort((a, b) => b.profit - a.profit);
}

// "Hoje tenho N horas, qual rota eu faço?" — primeiro tenta achar a rota SALVA de maior lucro
// que cabe no tempo (sem estourar); se nenhuma rota salva couber (ou não existir nenhuma ainda),
// monta um encaixe novo na hora, gulosamente pela DG de melhor Alz/hora, respeitando o limite
// diário de runs por DG — sobra de tempo de uma DG que bateu o limite passa pra próxima melhor.
export function suggestRouteForTime(hoursAvailable) {
  const budgetMs = hoursAvailable * 3600000;
  if (!(budgetMs > 0)) return null;

  const savedFitting = computeRouteComparison().filter(r => r.hasTimeData && r.estimatedTimeMs <= budgetMs);
  if (savedFitting.length) return { type: 'saved', ...savedFitting[0] };

  const dgStats = computeDgComparison();
  const candidates = [...dgStats].filter(d => d.msPerRun != null && d.alzPerHour != null).sort((a, b) => b.alzPerHour - a.alzPerHour);

  let remainingMs = budgetMs;
  const items = [];
  candidates.forEach(dg => {
    if (remainingMs <= 0) return;
    const runs = Math.min(Math.floor(remainingMs / dg.msPerRun), DAILY_RUN_LIMIT);
    if (runs <= 0) return;
    items.push({ dungeonId: dg.dungeonId, dungeonName: dg.dungeonName, repetitions: runs });
    remainingMs -= runs * dg.msPerRun;
  });

  if (!items.length) return { type: 'none' };

  const expectedAlz = items.reduce((sum, it) => {
    const stat = dgStats.find(d => d.dungeonId === it.dungeonId);
    return sum + (stat?.alzPerRun ?? 0) * it.repetitions;
  }, 0);
  const cartItems = items.map(it => buildCartItem(it.dungeonId, it.repetitions)).filter(Boolean);
  const cost = calculateRushCartCost(cartItems).total;

  return {
    type: 'generated',
    items,
    dgCount: items.length,
    expectedAlz,
    cost,
    profit: expectedAlz - cost,
    estimatedTimeMs: budgetMs - remainingMs,
  };
}

export function setTimeAvailableHours(value) {
  AppState.timeAvailableHours = value;
  renderPage();
}

// Aplica a sugestão (salva ou recém-montada) no carrinho de hoje — recalcula na hora em vez de
// guardar estado à parte, pra nunca aplicar algo diferente do que está na tela.
export function applySuggestedRoute() {
  const hours = Number(AppState.timeAvailableHours) || 0;
  const suggestion = suggestRouteForTime(hours);
  if (!suggestion || suggestion.type === 'none') return;

  if (suggestion.type === 'saved') {
    applyRushRoute(suggestion.id);
    return;
  }

  const cartItems = suggestion.items.map(it => buildCartItem(it.dungeonId, it.repetitions)).filter(Boolean);
  AppState.rushCart = cartItems;
  renderPage();
}
