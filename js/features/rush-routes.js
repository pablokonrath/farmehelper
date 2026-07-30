import { AppState } from '../state/app-state.js';
import { saveRushRoutes } from '../state/persistence.js';
import { buildCartItem, calculateRushCartCost } from './rush-cart.js';
import { computeDgComparison } from './dg-session.js';
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

    route.items.forEach(it => {
      const stat = dgStatsById[it.dungeonId];
      if (stat && stat.alzPerRun != null) expectedAlz += stat.alzPerRun * it.repetitions;
      else missingDataCount++;

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
    };
  }).sort((a, b) => b.profit - a.profit);
}
