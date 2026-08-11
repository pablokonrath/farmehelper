import { AppState } from '../state/app-state.js';
import { saveItemCategories, saveItemCategoryAssignments } from '../state/persistence.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { renderPage } from '../router.js';

export function toggleCategoryManager() {
  AppState.isCategoryManagerOpen = !AppState.isCategoryManagerOpen;
  renderPage();
}

export function setCategoryAssignSearchQuery(value) {
  AppState.categoryAssignSearchQuery = value;
  renderPage();
}

export function addItemCategory() {
  const input = document.getElementById('newItemCategory');
  const name = input?.value.trim();
  if (!name || AppState.itemCategories.includes(name)) return;
  AppState.itemCategories.push(name);
  saveItemCategories().catch(err => console.error('Falha ao salvar categorias:', err));
  input.value = '';
  renderPage();
}

export function removeItemCategory(name) {
  // Dado GLOBAL (compartilhado com todo mundo), sem lugar pra desfazer — mesmo padrão de
  // confirmação já usado no cadastro Itens × DGs. Sem isso, um clique errado apagava a categoria
  // e deixava todo item que apontava pra ela "preso" num nome fantasma: getItemCategory ainda
  // devolvia o nome removido (a atribuição continuava lá), só que sem aparecer mais na lista
  // gerenciável — o item ficava categorizado com algo que não existe mais e ninguém tinha como
  // corrigir. Por isso a limpeza das atribuições órfãs abaixo, não só remover da lista.
  const affected = Object.values(AppState.itemCategoryAssignments).filter(c => c === name).length;
  const aviso = affected
    ? `Remover a categoria "${name}"? ${affected} item(ns) atribuído(s) a ela voltam a ficar "Sem categoria". Vale pra todo mundo, não só pra você, e não tem como desfazer.`
    : `Remover a categoria "${name}"? Vale pra todo mundo, não só pra você, e não tem como desfazer.`;
  if (!confirm(aviso)) return;

  AppState.itemCategories = AppState.itemCategories.filter(c => c !== name);
  Object.entries(AppState.itemCategoryAssignments).forEach(([itemName, cat]) => {
    if (cat === name) delete AppState.itemCategoryAssignments[itemName];
  });
  Promise.all([
    saveItemCategories(),
    saveItemCategoryAssignments(),
  ]).catch(err => console.error('Falha ao salvar remoção de categoria:', err));
  renderPage();
}

export function setItemCategoryAssignment(itemName, categoryName) {
  if (categoryName) AppState.itemCategoryAssignments[itemName] = categoryName;
  else delete AppState.itemCategoryAssignments[itemName];
  saveItemCategoryAssignments().catch(err => console.error('Falha ao salvar atribuição de categoria:', err));
  renderPage();
}

// Atribui uma categoria a TODOS os itens conhecidos cujo nome contém a palavra-chave, de uma vez —
// sem isso, categorizar dezenas de itens do mesmo tipo (ex: toda variação de "Núcleo") exigia abrir
// o seletor item por item na tabela. Sobrescreve a categoria atual dos itens afetados (se tiverem
// uma) — por isso pede confirmação mostrando quantos itens seriam mexidos antes de aplicar.
export function bulkAssignCategoryByKeyword(categoryName, keyword) {
  const key = normalizeForSearch(keyword || '');
  if (!categoryName || !key) {
    alert('Escolha uma categoria e digite uma palavra-chave antes de aplicar em massa.');
    return;
  }
  const matches = (AppState.knownItemNames || []).filter(name => normalizeForSearch(name).includes(key));
  if (!matches.length) {
    alert(`Nenhum item cadastrado contém "${keyword}".`);
    return;
  }
  if (!confirm(`Atribuir a categoria "${categoryName}" a ${matches.length} item(ns) que contêm "${keyword}"? Isso substitui a categoria atual desses itens, se tiverem uma.`)) return;

  matches.forEach(name => { AppState.itemCategoryAssignments[name] = categoryName; });
  saveItemCategoryAssignments().catch(err => console.error('Falha ao salvar atribuição de categoria:', err));
  renderPage();
}
