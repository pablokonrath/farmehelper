import { AppState } from '../state/app-state.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { getAllDrops, summarizeDropsByItem } from './drops.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

// AppState.rankingItems é uma lista GLOBAL controlada só pelo admin (api/ranking-items.php) —
// diferente de AppState.trackedKeywords, que é pessoal e controla só os alertas de cada um.
// O ranking usa a lista global, não a de cada usuário, senão cada pessoa só apareceria no
// ranking dos itens que ELA MESMA escolheu rastrear pros próprios alertas.
function filterToRankingItems(drops) {
  if (!AppState.rankingItems.length) return [];
  const keywords = AppState.rankingItems.map(r => normalizeForSearch(r.word));
  return drops.filter(d => keywords.some(k => normalizeForSearch(d.name).includes(k)));
}

export function computeTrackedItemCounts() {
  const trackedDrops = filterToRankingItems(getAllDrops());
  const counts = {};
  summarizeDropsByItem(trackedDrops).forEach(item => (counts[item.name] = item.qty));
  return counts;
}

// Um nome de item "conta" como destaque se bater (mesma lógica de substring) com alguma
// palavra da lista global marcada featured=true.
export function isItemFeatured(itemName) {
  const normalizedName = normalizeForSearch(itemName);
  return AppState.rankingItems.some(r => r.featured && normalizedName.includes(normalizeForSearch(r.word)));
}

// Sincroniza só as contagens agregadas (não os drops individuais) pro ranking entre contas —
// best-effort, uma falha aqui não deve travar o resto do app (o log local continua sendo a
// fonte de verdade pro próprio usuário). Loga no console em caso de erro (inclusive erro HTTP,
// não só falha de rede) pra não esconder silenciosamente uma sincronização que não aconteceu.
export async function syncTrackedDropCounts() {
  try {
    const response = await fetch(`${API_BASE}/drop-counts.php`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(computeTrackedItemCounts()),
    });
    if (!response.ok) console.error('Falha ao sincronizar ranking:', response.status, await response.text());
  } catch (err) {
    console.error('Erro de conexão ao sincronizar ranking:', err);
  }
}

export function setRankingFilterItem(value) {
  AppState.rankingFilterItem = value;
  renderPage();
}

export function setRankingCompareUsername(value) {
  AppState.rankingCompareUsername = value;
  renderPage();
}

// Outras contas presentes no ranking (excluindo a própria) — só quem já tem alguma
// contagem sincronizada aparece como opção pra comparar.
export function getGuildUsernames() {
  const data = AppState.leaderboardData || {};
  const names = new Set();
  Object.values(data).forEach(rows => rows.forEach(r => names.add(r.username)));
  names.delete(AppState.currentUsername);
  return [...names].sort();
}

// Comparação por quantidade dos itens rastreados — nunca por Alz, que é privado de cada um.
export function buildPlayerComparison(otherUsername) {
  const data = AppState.leaderboardData || {};
  return Object.keys(data)
    .sort()
    .map(itemName => {
      const rows = data[itemName];
      const myQty = rows.find(r => r.username === AppState.currentUsername)?.quantity || 0;
      const otherQty = rows.find(r => r.username === otherUsername)?.quantity || 0;
      return { name: itemName, myQty, otherQty, delta: myQty - otherQty };
    })
    .filter(row => row.myQty > 0 || row.otherQty > 0);
}

export async function loadLeaderboardData() {
  AppState.isLeaderboardLoading = true;
  renderPage();
  try {
    const response = await fetch(`${API_BASE}/leaderboard.php`, { credentials: 'same-origin' });
    AppState.leaderboardData = response.ok ? await response.json() : {};
  } catch {
    AppState.leaderboardData = {};
  }
  AppState.isLeaderboardLoading = false;
  renderPage();
}
