import { AppState } from '../state/app-state.js';
import { saveWishlistItems } from '../state/persistence.js';
import { showInfoToast } from './alerts.js';
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

// --- Propostas de compra ---

// Abre o campo de valor da proposta num aviso do correio (guarda qual, pra renderizar o input).
export function startOffer(matchId) {
  AppState.offeringMatchId = matchId;
  renderPage();
}

export function cancelOffer() {
  AppState.offeringMatchId = null;
  renderPage();
}

export async function sendWishlistOffer() {
  const match = AppState.wishlistMatches.find(m => m.id === AppState.offeringMatchId);
  if (!match) return;
  const offerPrice = parseInt(String(document.getElementById('offerPriceInput')?.value || '').replace(/\D/g, ''), 10) || 0;
  if (offerPrice <= 0) return;
  AppState.offeringMatchId = null;
  renderPage();
  try {
    const response = await fetch(`${API_BASE}/wishlist-offers.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dropperUsername: match.dropperUsername, itemName: match.itemName, offerPrice }),
    });
    if (!response.ok) {
      console.error('Falha ao enviar proposta:', response.status, await response.text());
      alert('Não foi possível enviar a proposta.');
    } else {
      showInfoToast('Proposta enviada para ' + match.dropperUsername);
    }
  } catch (err) {
    console.error('Erro de conexão ao enviar proposta:', err);
  }
}

export async function loadWishlistOffers() {
  AppState.isWishlistOffersLoading = true;
  try {
    const response = await fetch(`${API_BASE}/wishlist-offers.php`, { credentials: 'same-origin' });
    AppState.wishlistOffers = response.ok ? await response.json() : [];
  } catch {
    AppState.wishlistOffers = [];
  }
  AppState.isWishlistOffersLoading = false;
  renderPage();
}

// O vendedor aceita ou recusa uma proposta recebida; o comprador é avisado (tela + Telegram).
export async function respondToOffer(id, status) {
  const offer = AppState.wishlistOffers.find(o => o.id === id);
  const who = offer ? offer.buyerUsername : 'o comprador';
  const msg = status === 'accepted'
    ? `Aceitar a proposta de ${who}? A pessoa vai ser avisada (e no Telegram, se ela vinculou).`
    : `Recusar a proposta de ${who}?`;
  if (!confirm(msg)) return;
  try {
    const response = await fetch(`${API_BASE}/wishlist-offers.php`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respond: id, status }),
    });
    if (!response.ok) {
      console.error('Falha ao responder proposta:', response.status, await response.text());
      alert('Não foi possível responder a proposta.');
      return;
    }
    if (offer) offer.status = status;
    showInfoToast(status === 'accepted'
      ? 'Proposta aceita — combine a troca no jogo ou pelo Seguro Neo (GM).'
      : 'Proposta recusada.');
    renderPage();
  } catch (err) {
    console.error('Erro de conexão ao responder proposta:', err);
  }
}

// Propostas que EU enviei (sou o comprador) + o status da resposta de cada uma.
export async function loadWishlistSentOffers() {
  AppState.isWishlistSentOffersLoading = true;
  try {
    const response = await fetch(`${API_BASE}/wishlist-offers.php?box=sent`, { credentials: 'same-origin' });
    AppState.wishlistSentOffers = response.ok ? await response.json() : [];
  } catch {
    AppState.wishlistSentOffers = [];
  }
  AppState.isWishlistSentOffersLoading = false;
  renderPage();
}

export async function markSentOffersSeen() {
  AppState.wishlistSentOffers.forEach(o => (o.buyerSeen = true));
  renderPage();
  try {
    await fetch(`${API_BASE}/wishlist-offers.php`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyerSeen: true }) });
  } catch (err) {
    console.error('Erro ao marcar respostas como vistas:', err);
  }
}

export async function markOffersSeen() {
  AppState.wishlistOffers.forEach(o => (o.seen = true));
  renderPage();
  try {
    await fetch(`${API_BASE}/wishlist-offers.php`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seen: true }) });
  } catch (err) {
    console.error('Erro ao marcar propostas como vistas:', err);
  }
}

export async function clearOffers() {
  if (!confirm('Limpar todas as propostas recebidas?')) return;
  AppState.wishlistOffers = [];
  renderPage();
  try {
    await fetch(`${API_BASE}/wishlist-offers.php`, { method: 'DELETE', credentials: 'same-origin' });
  } catch (err) {
    console.error('Erro ao limpar propostas:', err);
  }
}
