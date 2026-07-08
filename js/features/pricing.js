import { AppState } from '../state/app-state.js';
import { saveItemPrices } from '../state/persistence.js';
import { updateBalanceSidebar } from './drops.js';
import { renderPage } from '../router.js';

export function addItemPrice() {
  const name = document.getElementById('cN').value.trim();
  const price = parseInt(document.getElementById('cP').value);
  if (!name || isNaN(price) || price < 0) return;
  AppState.itemPrices[name] = price;
  saveItemPrices();
  updateBalanceSidebar();
  renderPage();
}

export function editItemPrice(name) {
  const value = prompt(`Novo preço para "${name}" (Alz):`, AppState.itemPrices[name]);
  if (value === null) return;
  const price = parseInt(value.replace(/\D/g, ''));
  if (!isNaN(price) && price >= 0) {
    AppState.itemPrices[name] = price;
    saveItemPrices();
    updateBalanceSidebar();
    renderPage();
  }
}

export function deleteItemPrice(name) {
  if (!confirm(`Remover preço de "${name}"?`)) return;
  delete AppState.itemPrices[name];
  saveItemPrices();
  updateBalanceSidebar();
  renderPage();
}
