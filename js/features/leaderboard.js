import { AppState } from '../state/app-state.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { getAllDrops, summarizeDropsByItem, computeAllDropsByDate, expandServerDropsToState, updateBalanceSidebar } from './drops.js';
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

// Filtra pra lista PESSOAL de palavras rastreadas de cada um (AppState.trackedKeywords) — usada
// pra alimentar tracked_drop_counts_daily, que o /drop do bot do Telegram lê. Distinta de
// filterToRankingItems (lista global do admin): aqui é "os itens que EU rastreio".
function filterToTrackedKeywords(drops) {
  if (!AppState.trackedKeywords.length) return [];
  const keywords = AppState.trackedKeywords.map(kw => normalizeForSearch(kw.word));
  return drops.filter(d => keywords.some(k => normalizeForSearch(d.name).includes(k)));
}

export function computeTrackedKeywordCountsByDate() {
  const trackedDrops = filterToTrackedKeywords(getAllDrops());
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

// Faz o envio de fato das contagens agregadas (não os drops individuais) pro ranking entre
// contas — best-effort, uma falha aqui não deve travar o resto do app (o log local continua
// sendo a fonte de verdade pro próprio usuário). Loga no console em caso de erro (inclusive erro
// HTTP, não só falha de rede) pra não esconder silenciosamente uma sincronização que não aconteceu.
async function doSyncTrackedDropCounts() {
  lastSyncAt = Date.now();
  await Promise.all([
    putCounts('drop-counts.php', computeTrackedItemCounts(), 'ranking'),
    putCounts('drop-counts-daily.php', computeTrackedItemCountsByDate(), 'ranking por dia'),
    // Contagem dos itens rastreados pessoais — alimenta o /drop do bot do Telegram, que é
    // sobre "o que EU dropei", não sobre o ranking global.
    putCounts('tracked-drop-counts.php', computeTrackedKeywordCountsByDate(), 'meus drops rastreados'),
    // Farme completo (todos os itens) — snapshot que deixa o servidor com o farme inteiro pra o
    // celular mostrar a Visão geral igual ao PC (ver farm-drops.php / expandServerDropsToState).
    putCounts('farm-drops.php', { data: computeAllDropsByDate() }, 'farme completo'),
  ]);
}

// Aparelho sem arquivo local (celular): carrega o farme completo do servidor e reconstrói
// AppState.drops, pra a Visão geral aparecer igual ao PC. Não faz nada quando há arquivo local
// (aí os drops vêm do próprio arquivo, que é a fonte da verdade).
export async function loadServerFarmDropsIfEmpty() {
  if (AppState.liveFileHandle || AppState.drops.length) return;
  try {
    const response = await fetch(`${API_BASE}/farm-drops.php`, { credentials: 'same-origin' });
    if (!response.ok) return;
    expandServerDropsToState(await response.json());
    updateBalanceSidebar();
    renderPage();
  } catch (err) {
    console.error('Falha ao carregar o farme do servidor:', err);
  }
}

// Throttle: no máximo 1 envio por minuto. Farmando, isso é chamado a cada poucos segundos (toda
// vez que caem linhas novas) — sem throttle, com muita gente farmando junto, viraria escrita
// constante demais pro banco compartilhado. NÃO afeta as notificações (alerta de drop e aviso de
// desejo pro Telegram são chamadas separadas, disparam na hora); só o /drop/ranking pode ficar
// até 1 min atrasado, o que é irrelevante. Sempre garante um envio final (trailing edge) pra a
// última contagem não ficar de fora quando o jogador para de farmar.
const SYNC_MIN_INTERVAL_MS = 60000;
let lastSyncAt = 0;
let trailingSyncTimer = null;

export function syncTrackedDropCounts() {
  // No celular os drops foram reconstruídos do servidor — re-sincronizar gravaria de volta um
  // dado derivado (e sobrescreveria o snapshot real vindo do PC). Nunca sincroniza nesse modo.
  if (AppState.dropsFromServer) return;
  const elapsed = Date.now() - lastSyncAt;
  if (elapsed >= SYNC_MIN_INTERVAL_MS) {
    if (trailingSyncTimer) { clearTimeout(trailingSyncTimer); trailingSyncTimer = null; }
    doSyncTrackedDropCounts();
    return;
  }
  // Ainda dentro da janela de 1 min — agenda um único envio pro fim dela, sem empilhar vários.
  if (!trailingSyncTimer) {
    trailingSyncTimer = setTimeout(() => {
      trailingSyncTimer = null;
      doSyncTrackedDropCounts();
    }, SYNC_MIN_INTERVAL_MS - elapsed);
  }
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
