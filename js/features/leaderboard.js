import { AppState } from '../state/app-state.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { getAllDrops, summarizeDropsByItem } from './drops.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

// Diferente de applyTrackedKeywordFilter (drops.js), que só filtra quando o toggle "Filtrar
// apenas itens rastreados" está ligado — aqui o ranking sempre é só de itens rastreados,
// independente desse toggle (que controla a exibição da lista principal, outra coisa).
function filterToTrackedItems(drops) {
  if (!AppState.trackedKeywords.length) return [];
  const keywords = AppState.trackedKeywords.map(kw => normalizeForSearch(kw.word));
  return drops.filter(d => keywords.some(k => normalizeForSearch(d.name).includes(k)));
}

export function computeTrackedItemCounts() {
  const trackedDrops = filterToTrackedItems(getAllDrops());
  const counts = {};
  summarizeDropsByItem(trackedDrops).forEach(item => (counts[item.name] = item.qty));
  return counts;
}

// Sincroniza só as contagens agregadas (não os drops individuais) pro ranking entre contas —
// best-effort, uma falha aqui não deve travar o resto do app (o log local continua sendo a
// fonte de verdade pro próprio usuário).
export async function syncTrackedDropCounts() {
  try {
    await fetch(`${API_BASE}/drop-counts.php`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(computeTrackedItemCounts()),
    });
  } catch {
    // sem conexão/erro do servidor — tenta de novo na próxima sincronização
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
