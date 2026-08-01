import { AppState } from '../state/app-state.js';
import { saveCraftRecipes, saveCraftAlertHistory } from '../state/persistence.js';
import { renderPage } from '../router.js';

// Cria uma receita vazia (só o nome do item final) — materiais entram depois, um de cada vez.
export function addCraftRecipe() {
  const input = document.getElementById('newCraftRecipeName');
  const name = input?.value.trim();
  if (!name) return;
  AppState.craftRecipes.push({ id: 'recipe' + Date.now(), itemName: name, materials: [], resetAt: Date.now() });
  saveCraftRecipes().catch(err => console.error('Falha ao salvar receita:', err));
  input.value = '';
  renderPage();
}

export function deleteCraftRecipe(recipeId) {
  const recipe = AppState.craftRecipes.find(r => r.id === recipeId);
  if (!recipe || !confirm(`Excluir a receita "${recipe.itemName}"?`)) return;
  AppState.craftRecipes = AppState.craftRecipes.filter(r => r.id !== recipeId);
  saveCraftRecipes().catch(err => console.error('Falha ao salvar receita:', err));
  renderPage();
}

export function addCraftMaterial(recipeId) {
  const recipe = AppState.craftRecipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const nameInput = document.getElementById(`craftMatName-${recipeId}`);
  const qtyInput = document.getElementById(`craftMatQty-${recipeId}`);
  const itemName = nameInput?.value.trim();
  const quantity = Math.max(1, parseInt(qtyInput?.value, 10) || 1);
  if (!itemName || recipe.materials.some(m => m.itemName === itemName)) return;
  recipe.materials.push({ itemName, quantity });
  saveCraftRecipes().catch(err => console.error('Falha ao salvar receita:', err));
  renderPage();
}

export function removeCraftMaterial(recipeId, index) {
  const recipe = AppState.craftRecipes.find(r => r.id === recipeId);
  if (!recipe) return;
  recipe.materials.splice(index, 1);
  saveCraftRecipes().catch(err => console.error('Falha ao salvar receita:', err));
  renderPage();
}

// Quanto já caiu de cada material da receita desde o último checkpoint (resetAt) — soma os itens
// das SESSÕES de DG encerradas (fonte durável, persistida pra sempre — ver dg-session.js), não o
// log bruto do jogo (esse é só a janela atual, se apaga/roda). Drop que caiu sem nenhuma sessão
// marcada não entra na conta, igual qualquer outra estatística por-DG do app; se esquecer de
// marcar, dá pra recuperar a sessão pelo log em Sessões de farme antes de contar aqui.
export function computeCraftProgress() {
  return AppState.craftRecipes.map(recipe => {
    const counts = {};
    AppState.dgSessions.forEach(s => {
      if (!s.endAt || s.endAt <= recipe.resetAt) return;
      Object.entries(s.items || {}).forEach(([name, qty]) => {
        if (recipe.materials.some(m => m.itemName === name)) counts[name] = (counts[name] || 0) + qty;
      });
    });
    const materials = recipe.materials.map(m => ({
      itemName: m.itemName,
      needed: m.quantity,
      have: counts[m.itemName] || 0,
      ready: (counts[m.itemName] || 0) >= m.quantity,
    }));
    return { id: recipe.id, itemName: recipe.itemName, materials, ready: materials.length > 0 && materials.every(m => m.ready) };
  });
}

// Chamado depois de qualquer sessão nova (endDgSession/recoverForgottenSession em dg-session.js).
// Receita que acabou de juntar TODOS os materiais dispara aviso, entra no histórico com a
// quantidade reunida, e o checkpoint (resetAt) avança pra agora — a contagem começa do zero de
// novo pro próximo craft. Não mexe nas sessões em si, só o ponto de partida da conta (mesma ideia
// de suggestForgottenSessionWindow: um checkpoint, não uma edição de histórico). Não é controle
// de estoque de verdade — não desconta se o material for vendido/gasto de outro jeito.
export function checkCraftReadiness() {
  const progress = computeCraftProgress();
  const justReady = progress.filter(p => p.ready);
  if (!justReady.length) return [];

  justReady.forEach(p => {
    const recipe = AppState.craftRecipes.find(r => r.id === p.id);
    if (!recipe) return;
    AppState.craftAlertHistory.push({
      id: 'craftalert' + Date.now() + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      recipeName: recipe.itemName,
      materials: p.materials.map(m => ({ itemName: m.itemName, quantity: m.have })),
    });
    recipe.resetAt = Date.now();
  });
  saveCraftRecipes().catch(err => console.error('Falha ao salvar receita:', err));
  saveCraftAlertHistory().catch(err => console.error('Falha ao salvar histórico de craft:', err));
  renderPage();
  return justReady;
}
