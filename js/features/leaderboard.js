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
  const keywords = AppState.rankingItems.map(normalizeForSearch);
  return drops.filter(d => keywords.some(k => normalizeForSearch(d.name).includes(k)));
}

export function computeTrackedItemCounts() {
  const trackedDrops = filterToRankingItems(getAllDrops());
  const counts = {};
  summarizeDropsByItem(trackedDrops).forEach(item => (counts[item.name] = item.qty));
  return counts;
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
