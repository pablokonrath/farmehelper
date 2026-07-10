import { AppState } from '../state/app-state.js';
import { saveRankingItems, saveItemCategories, saveItemCategoryAssignments } from '../state/persistence.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

export async function loadUsers() {
  AppState.isAdminUsersLoading = true;
  renderPage();
  try {
    const response = await fetch(`${API_BASE}/users.php`, { credentials: 'same-origin' });
    AppState.adminUsers = response.ok ? await response.json() : [];
  } catch {
    AppState.adminUsers = [];
  }
  AppState.isAdminUsersLoading = false;
  renderPage();
}

export async function createUser() {
  const usernameInput = document.getElementById('newUserUsername');
  const passwordInput = document.getElementById('newUserPassword');
  const errorEl = document.getElementById('createUserError');
  if (errorEl) errorEl.style.display = 'none';

  const username = usernameInput?.value.trim() || '';
  const password = passwordInput?.value || '';

  try {
    const response = await fetch(`${API_BASE}/users.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (errorEl) {
        errorEl.textContent = data.message || 'Erro ao criar conta.';
        errorEl.style.display = 'block';
      }
      return;
    }
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    await loadUsers();
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Erro de conexão com o servidor.';
      errorEl.style.display = 'block';
    }
  }
}

// save*() aqui são "fire and forget" (não bloqueiam a UI), mas o .catch garante que um erro
// do servidor (ex: 403 se a sessão não for mais admin) apareça no console em vez de sumir
// como uma promise rejeitada silenciosa — foi exatamente isso que escondeu o bug do ranking
// numa rodada anterior de debug.
export function addRankingItem() {
  const input = document.getElementById('newRankingItem');
  const featuredInput = document.getElementById('newRankingItemFeatured');
  const word = input?.value.trim();
  if (!word || AppState.rankingItems.some(r => r.word === word)) return;
  AppState.rankingItems.push({ word, featured: !!featuredInput?.checked });
  saveRankingItems().catch(err => console.error('Falha ao salvar itens do ranking:', err));
  input.value = '';
  if (featuredInput) featuredInput.checked = false;
  renderPage();
}

export function removeRankingItem(word) {
  AppState.rankingItems = AppState.rankingItems.filter(r => r.word !== word);
  saveRankingItems().catch(err => console.error('Falha ao salvar itens do ranking:', err));
  renderPage();
}

export function toggleRankingItemFeatured(word) {
  const item = AppState.rankingItems.find(r => r.word === word);
  if (!item) return;
  item.featured = !item.featured;
  saveRankingItems().catch(err => console.error('Falha ao salvar itens do ranking:', err));
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
