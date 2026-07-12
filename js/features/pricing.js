import { AppState } from '../state/app-state.js';
import { saveItemPrices } from '../state/persistence.js';
import { updateBalanceSidebar } from './drops.js';
import { recordPriceChange } from './sales.js';
import { parseAlzInput } from '../utils/formatting.js';
import { renderPage } from '../router.js';

export function addItemPrice() {
  const name = document.getElementById('cN').value.trim();
  const rawPrice = document.getElementById('cP')?.value.trim();
  if (!name || !rawPrice) return;
  AppState.itemPrices[name] = parseAlzInput(rawPrice);
  recordPriceChange(name, AppState.itemPrices[name]);
  saveItemPrices();
  updateBalanceSidebar();
  renderPage();
}

// Edição inline na própria linha da tabela (mesmo padrão de startEditingDungeon em
// dungeon-manager.js) — antes era um window.prompt(), que não dá pra mascarar/colorir por
// ser um dialog nativo do navegador, fora do DOM da página.
export function startEditingItemPrice(name) {
  AppState.editingItemPriceName = name;
  renderPage();
}

export function cancelEditingItemPrice() {
  AppState.editingItemPriceName = null;
  renderPage();
}

export function saveItemPriceEdit(name) {
  const rawPrice = document.getElementById('editItemPriceInput')?.value;
  AppState.itemPrices[name] = parseAlzInput(rawPrice);
  recordPriceChange(name, AppState.itemPrices[name]);
  AppState.editingItemPriceName = null;
  saveItemPrices();
  updateBalanceSidebar();
  renderPage();
}

export function deleteItemPrice(name) {
  if (!confirm(`Remover preço de "${name}"?`)) return;
  delete AppState.itemPrices[name];
  saveItemPrices();
  updateBalanceSidebar();
  renderPage();
}
