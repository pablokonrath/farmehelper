import { AppState } from '../state/app-state.js';
import { saveItemCategories, saveItemCategoryAssignments } from '../state/persistence.js';
import { renderPage } from '../router.js';

export function toggleCategoryManager() {
  AppState.isCategoryManagerOpen = !AppState.isCategoryManagerOpen;
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
  AppState.itemCategories = AppState.itemCategories.filter(c => c !== name);
  saveItemCategories().catch(err => console.error('Falha ao salvar categorias:', err));
  renderPage();
}

export function setItemCategoryAssignment(itemName, categoryName) {
  if (categoryName) AppState.itemCategoryAssignments[itemName] = categoryName;
  else delete AppState.itemCategoryAssignments[itemName];
  saveItemCategoryAssignments().catch(err => console.error('Falha ao salvar atribuição de categoria:', err));
  renderPage();
}
