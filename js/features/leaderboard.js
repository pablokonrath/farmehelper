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

// Mesma contagem, mas quebrada por dia — alimenta drop-counts-daily.php, que por sua vez
// alimenta as abas Semanal/Quinzenal/Mensal do Ranking (drop_counts, o total geral, não tem
// data nenhuma pra fazer esse recorte).
export function computeTrackedItemCountsByDate() {
  const trackedDrops = filterToRankingItems(getAllDrops());
  const dates = [...new Set(trackedDrops.map(d => d.date))];
  const result = {};
  dates.forEach(date => {
    const counts = {};
    summarizeDropsByItem(trackedDrops.filter(d => d.date === date)).forEach(item => (counts[item.name] = item.qty));
    result[date] = counts;
  });
  return result;
}

// Um nome de item "conta" como destaque se bater (mesma lógica de substring) com alguma
// palavra da lista global marcada featured=true.
export function isItemFeatured(itemName) {
  const normalizedName = normalizeForSearch(itemName);
  return AppState.rankingItems.some(r => r.featured && normalizedName.includes(normalizeForSearch(r.word)));
}

async function putCounts(path, body, label) {
  try {
    const response = await fetch(`${API_BASE}/${path}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) console.error(`Falha ao sincronizar ${label}:`, response.status, await response.text());
  } catch (err) {
    console.error(`Erro de conexão ao sincronizar ${label}:`, err);
  }
}

// Sincroniza só as contagens agregadas (não os drops individuais) pro ranking entre contas —
// best-effort, uma falha aqui não deve travar o resto do app (o log local continua sendo a
// fonte de verdade pro próprio usuário). Loga no console em caso de erro (inclusive erro HTTP,
// não só falha de rede) pra não esconder silenciosamente uma sincronização que não aconteceu.
// Manda tanto o total geral (drop-counts.php) quanto a quebra por dia (drop-counts-daily.php,
// usada pelas abas de período do Ranking).
export async function syncTrackedDropCounts() {
  await Promise.all([
    putCounts('drop-counts.php', computeTrackedItemCounts(), 'ranking'),
    putCounts('drop-counts-daily.php', computeTrackedItemCountsByDate(), 'ranking por dia'),
  ]);
}

export function setRankingFilterItem(value) {
  AppState.rankingFilterItem = value;
  renderPage();
}

export function setRankingPeriod(period) {
  AppState.rankingPeriod = period;
  loadLeaderboardData();
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
    const period = AppState.rankingPeriod && AppState.rankingPeriod !== 'all' ? `?period=${AppState.rankingPeriod}` : '';
    const response = await fetch(`${API_BASE}/leaderboard.php${period}`, { credentials: 'same-origin' });
    AppState.leaderboardData = response.ok ? await response.json() : {};
  } catch {
    AppState.leaderboardData = {};
  }
  AppState.isLeaderboardLoading = false;
  renderPage();
}
