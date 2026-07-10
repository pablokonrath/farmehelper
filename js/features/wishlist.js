import { AppState } from '../state/app-state.js';
import { saveWishlistItems } from '../state/persistence.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

export function addWishlistItem() {
  const input = document.getElementById('newWishlistItem');
  const name = input?.value.trim();
  if (!name || AppState.wishlistItems.includes(name)) return;
  AppState.wishlistItems.push(name);
  saveWishlistItems().catch(err => console.error('Falha ao salvar lista de desejos:', err));
  input.value = '';
  renderPage();
}

export function removeWishlistItem(name) {
  AppState.wishlistItems = AppState.wishlistItems.filter(n => n !== name);
  saveWishlistItems().catch(err => console.error('Falha ao salvar lista de desejos:', err));
  renderPage();
}

// Chamado com os nomes de drop recém-parseados (sem filtro nenhum de lista de ranking) —
// fire-and-forget, não deve travar o polling se a rede falhar.
export async function checkWishlistMatches(drops) {
  const items = [...new Set(drops.map(d => d.name))];
  if (!items.length) return;
  try {
    const response = await fetch(`${API_BASE}/wishlist-check.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) console.error('Falha ao checar lista de desejos:', response.status, await response.text());
  } catch (err) {
    console.error('Erro de conexão ao checar lista de desejos:', err);
  }
}

export async function loadWishlistMatches() {
  AppState.isWishlistMatchesLoading = true;
  renderPage();
  try {
    const response = await fetch(`${API_BASE}/wishlist-matches.php`, { credentials: 'same-origin' });
    AppState.wishlistMatches = response.ok ? await response.json() : [];
  } catch {
    AppState.wishlistMatches = [];
  }
  AppState.isWishlistMatchesLoading = false;
  renderPage();
}

export async function markAllWishlistMatchesSeen() {
  AppState.wishlistMatches.forEach(m => (m.seen = true));
  renderPage();
  try {
    const response = await fetch(`${API_BASE}/wishlist-matches.php`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen: true }),
    });
    if (!response.ok) console.error('Falha ao marcar correio como visto:', response.status, await response.text());
  } catch (err) {
    console.error('Erro de conexão ao marcar correio como visto:', err);
  }
}

export async function clearWishlistMatches() {
  if (!confirm('Limpar todo o correio da lista de desejos?')) return;
  AppState.wishlistMatches = [];
  renderPage();
  try {
    const response = await fetch(`${API_BASE}/wishlist-matches.php`, { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) console.error('Falha ao limpar correio:', response.status, await response.text());
  } catch (err) {
    console.error('Erro de conexão ao limpar correio:', err);
  }
}
