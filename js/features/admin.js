import { AppState } from '../state/app-state.js';
import { saveRankingItems, saveItemCategories, saveItemCategoryAssignments, saveGuilds } from '../state/persistence.js';
import { renderPage } from '../router.js';
import { logAdminAction } from './admin-log.js';

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
  const guildInput = document.getElementById('newUserGuild');
  const isAdminInput = document.getElementById('newUserIsAdmin');
  const errorEl = document.getElementById('createUserError');
  if (errorEl) errorEl.style.display = 'none';

  const username = usernameInput?.value.trim() || '';
  const password = passwordInput?.value || '';
  const guild = guildInput?.value || '';
  const isAdmin = !!isAdminInput?.checked;

  try {
    const response = await fetch(`${API_BASE}/users.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, guild, isAdmin }),
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
    if (guildInput) guildInput.value = '';
    if (isAdminInput) isAdminInput.checked = false;
    logAdminAction('create_user', `Criou a conta "${username}"${guild ? ` (guild ${guild})` : ''}${isAdmin ? ' como admin' : ''}.`);
    await loadUsers();
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Erro de conexão com o servidor.';
      errorEl.style.display = 'block';
    }
  }
}

async function updateUser(id, patch) {
  try {
    const response = await fetch(`${API_BASE}/users.php`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!response.ok) console.error('Falha ao atualizar conta:', response.status, await response.text());
    await loadUsers();
  } catch (err) {
    console.error('Erro de conexão ao atualizar conta:', err);
  }
}

export function toggleUserAdmin(id, currentlyAdmin) {
  const username = AppState.adminUsers.find(u => u.id === id)?.username || `#${id}`;
  logAdminAction(currentlyAdmin ? 'demote_user' : 'promote_user', `${currentlyAdmin ? 'Rebaixou' : 'Promoveu'} "${username}" ${currentlyAdmin ? 'de' : 'a'} admin.`);
  updateUser(id, { isAdmin: !currentlyAdmin });
}

export function setUserGuild(id, guild) {
  const username = AppState.adminUsers.find(u => u.id === id)?.username || `#${id}`;
  logAdminAction('set_user_guild', `Definiu a guild de "${username}" como "${guild || 'sem guild'}".`);
  updateUser(id, { guild });
}

// Exclusivo do admin mestre (checado também no servidor) — apaga a conta e, em cascata, todos
// os dados dela (farme, rush, alertas etc.), já que as tabelas por-usuário têm ON DELETE CASCADE.
export async function deleteUser(id, username) {
  if (!confirm(`Excluir a conta "${username}"? Isso apaga todos os dados dela (farme, rush, alertas). Não dá pra desfazer.`)) return;
  try {
    const response = await fetch(`${API_BASE}/users.php`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      console.error('Falha ao excluir conta:', response.status, await response.text());
      return;
    }
    logAdminAction('delete_user', `Excluiu a conta "${username}".`);
    await loadUsers();
  } catch (err) {
    console.error('Erro de conexão ao excluir conta:', err);
  }
}

// Preenche o campo de usuário do form "Editar login" com o valor atual da conta selecionada,
// pra ficar claro o que vai ser sobrescrito (e dar pra editar só a senha sem trocar o usuário).
export function prefillEditLoginUsername(id) {
  const usernameInput = document.getElementById('editLoginUsername');
  if (!usernameInput) return;
  const user = AppState.adminUsers.find(u => u.id === Number(id));
  usernameInput.value = user ? user.username : '';
}

export async function saveEditedLogin() {
  const idInput = document.getElementById('editLoginUserId');
  const usernameInput = document.getElementById('editLoginUsername');
  const passwordInput = document.getElementById('editLoginPassword');
  const errorEl = document.getElementById('editLoginError');
  if (errorEl) errorEl.style.display = 'none';

  const id = Number(idInput?.value || 0);
  const username = usernameInput?.value.trim() || '';
  const password = passwordInput?.value || '';

  if (!id || !username) {
    if (errorEl) {
      errorEl.textContent = 'Selecione uma conta e informe o usuário.';
      errorEl.style.display = 'block';
    }
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/users.php`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, username, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (errorEl) {
        errorEl.textContent = data.message || 'Erro ao salvar.';
        errorEl.style.display = 'block';
      }
      return;
    }
    logAdminAction('edit_user_login', `Editou o login da conta "${username}"${password ? ' (com troca de senha)' : ''}.`);
    if (passwordInput) passwordInput.value = '';
    await loadUsers();
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Erro de conexão com o servidor.';
      errorEl.style.display = 'block';
    }
  }
}

export function addGuild() {
  const input = document.getElementById('newGuild');
  const name = input?.value.trim();
  if (!name || AppState.guilds.includes(name)) return;
  AppState.guilds.push(name);
  saveGuilds().catch(err => console.error('Falha ao salvar guilds:', err));
  logAdminAction('add_guild', `Adicionou a guild "${name}".`);
  input.value = '';
  renderPage();
}

export function removeGuild(name) {
  AppState.guilds = AppState.guilds.filter(g => g !== name);
  saveGuilds().catch(err => console.error('Falha ao salvar guilds:', err));
  logAdminAction('remove_guild', `Removeu a guild "${name}".`);
  renderPage();
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
  logAdminAction('add_ranking_item', `Adicionou "${word}" ao ranking${featuredInput?.checked ? ' (destaque)' : ''}.`);
  input.value = '';
  if (featuredInput) featuredInput.checked = false;
  renderPage();
}

export function removeRankingItem(word) {
  AppState.rankingItems = AppState.rankingItems.filter(r => r.word !== word);
  saveRankingItems().catch(err => console.error('Falha ao salvar itens do ranking:', err));
  logAdminAction('remove_ranking_item', `Removeu "${word}" do ranking.`);
  renderPage();
}

export function toggleRankingItemFeatured(word) {
  const item = AppState.rankingItems.find(r => r.word === word);
  if (!item) return;
  item.featured = !item.featured;
  saveRankingItems().catch(err => console.error('Falha ao salvar itens do ranking:', err));
  logAdminAction('toggle_ranking_item_featured', `${item.featured ? 'Marcou' : 'Desmarcou'} "${word}" como destaque no ranking.`);
  renderPage();
}

export function addItemCategory() {
  const input = document.getElementById('newItemCategory');
  const name = input?.value.trim();
  if (!name || AppState.itemCategories.includes(name)) return;
  AppState.itemCategories.push(name);
  saveItemCategories().catch(err => console.error('Falha ao salvar categorias:', err));
  logAdminAction('add_item_category', `Criou a categoria "${name}".`);
  input.value = '';
  renderPage();
}

export function removeItemCategory(name) {
  AppState.itemCategories = AppState.itemCategories.filter(c => c !== name);
  saveItemCategories().catch(err => console.error('Falha ao salvar categorias:', err));
  logAdminAction('remove_item_category', `Removeu a categoria "${name}".`);
  renderPage();
}

export function setItemCategoryAssignment(itemName, categoryName) {
  if (categoryName) AppState.itemCategoryAssignments[itemName] = categoryName;
  else delete AppState.itemCategoryAssignments[itemName];
  saveItemCategoryAssignments().catch(err => console.error('Falha ao salvar atribuição de categoria:', err));
  logAdminAction('set_item_category', `Definiu a categoria de "${itemName}" como "${categoryName || 'sem categoria'}".`);
  renderPage();
}
