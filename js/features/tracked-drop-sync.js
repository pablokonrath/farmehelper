import { AppState } from '../state/app-state.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { getAllDrops, summarizeDropsByItem } from './drops.js';

const API_BASE = 'api';

// Filtra pra lista PESSOAL de palavras rastreadas de cada um (AppState.trackedKeywords) — usada
// pra alimentar tracked_drop_counts_daily, que o /drop e /farm do bot do Telegram leem.
function filterToTrackedKeywords(drops) {
  if (!AppState.trackedKeywords.length) return [];
  const keywords = AppState.trackedKeywords.map(kw => normalizeForSearch(kw.word));
  return drops.filter(d => keywords.some(k => normalizeForSearch(d.name).includes(k)));
}

function computeTrackedKeywordCountsByDate() {
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

async function doSyncTrackedDropCounts() {
  lastSyncAt = Date.now();
  try {
    const response = await fetch(`${API_BASE}/tracked-drop-counts.php`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(computeTrackedKeywordCountsByDate()),
    });
    if (!response.ok) console.error('Falha ao sincronizar meus drops rastreados:', response.status, await response.text());
  } catch (err) {
    console.error('Erro de conexão ao sincronizar meus drops rastreados:', err);
  }
}

// Throttle: no máximo 1 envio por minuto. Farmando, isso é chamado a cada poucos segundos (toda
// vez que caem linhas novas) — sem throttle viraria escrita constante demais pro banco. Sempre
// garante um envio final (trailing edge) pra a última contagem não ficar de fora quando o
// jogador para de farmar.
const SYNC_MIN_INTERVAL_MS = 60000;
let lastSyncAt = 0;
let trailingSyncTimer = null;

export function syncTrackedDropCounts() {
  const elapsed = Date.now() - lastSyncAt;
  if (elapsed >= SYNC_MIN_INTERVAL_MS) {
    if (trailingSyncTimer) { clearTimeout(trailingSyncTimer); trailingSyncTimer = null; }
    doSyncTrackedDropCounts();
    return;
  }
  if (!trailingSyncTimer) {
    trailingSyncTimer = setTimeout(() => {
      trailingSyncTimer = null;
      doSyncTrackedDropCounts();
    }, SYNC_MIN_INTERVAL_MS - elapsed);
  }
}
