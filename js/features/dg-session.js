import { AppState } from '../state/app-state.js';
import { getItemPrice, summarizeDropsByItem } from './drops.js';
import { saveDgSessions, saveActiveDgSession } from '../state/persistence.js';
import { formatAlzGamer } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { renderPage } from '../router.js';

const MAX_DG_SESSIONS = 300;

// Drops do LOG (não manuais) que caíram na janela [startAt, endAt]. A atribuição é por horário:
// game e navegador rodam na mesma máquina, então o timestamp do log bate com o relógio real.
function sessionDrops(startAt, endAt) {
  return AppState.drops.filter(d => d.timestamp && d.timestamp.getTime() >= startAt && d.timestamp.getTime() <= endAt);
}

function summarizeDrops(drops) {
  const totalAlz = drops.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  let best = null;
  drops.forEach(d => {
    const price = getItemPrice(d.name);
    if (!best || price > best.price) best = { name: d.name, price };
  });
  return { totalAlz, bestItem: best && best.price > 0 ? best : null };
}

export function startDgSession(dungeonId) {
  if (!dungeonId) return;
  const dg = AppState.dungeonList.find(d => d.id === dungeonId);
  if (!dg) return;
  AppState.activeDgSession = { dungeonId: dg.id, dungeonName: dg.name, startAt: Date.now(), runs: 0 };
  saveActiveDgSession();
  renderPage();
}

// Nº de runs da sessão em andamento (informado pelo jogador — o log não conta runs sozinho).
export function setActiveSessionRuns(value) {
  if (!AppState.activeDgSession) return;
  AppState.activeDgSession.runs = Math.max(0, parseInt(value, 10) || 0);
  saveActiveDgSession();
}

// Edita as runs de uma sessão já encerrada (identificada pelo startAt, único por sessão).
export function setSessionRuns(startAt, value) {
  const s = AppState.dgSessions.find(x => x.startAt === startAt);
  if (!s) return;
  s.runs = Math.max(0, parseInt(value, 10) || 0);
  saveDgSessions();
  renderPage();
}

// Mostra/esconde a lista completa de itens de uma sessão no histórico (estado só de UI, não
// persiste). Guardado por startAt.
export function toggleSessionItems(startAt) {
  if (AppState.expandedDgSessions[startAt]) delete AppState.expandedDgSessions[startAt];
  else AppState.expandedDgSessions[startAt] = true;
  renderPage();
}

// Resumo ao vivo da sessão em andamento (ou null). Recalculado sob demanda a partir da janela.
export function getActiveSessionSummary() {
  const s = AppState.activeDgSession;
  if (!s) return null;
  const now = Date.now();
  const drops = sessionDrops(s.startAt, now);
  const durationMs = now - s.startAt;
  const { totalAlz } = summarizeDrops(drops);
  return {
    dungeonName: s.dungeonName,
    durationMs,
    dropCount: drops.length,
    totalAlz,
    alzPerHour: durationMs > 60000 ? totalAlz / (durationMs / 3600000) : null,
  };
}

export function endDgSession() {
  const s = AppState.activeDgSession;
  if (!s) return;
  const endAt = Date.now();
  const drops = sessionDrops(s.startAt, endAt);
  const durationMs = endAt - s.startAt;
  const { totalAlz, bestItem } = summarizeDrops(drops);
  const items = {};
  summarizeDropsByItem(drops).forEach(it => (items[it.name] = it.qty));

  AppState.dgSessions.push({
    dungeonId: s.dungeonId,
    dungeonName: s.dungeonName,
    date: drops[0]?.date || todayISODate(),
    startAt: s.startAt,
    endAt,
    durationMs,
    runs: s.runs || 0,
    dropCount: drops.length,
    uniqueItems: Object.keys(items).length,
    totalAlz,
    alzPerHour: durationMs > 60000 ? totalAlz / (durationMs / 3600000) : null,
    bestItem,
    items,
  });
  if (AppState.dgSessions.length > MAX_DG_SESSIONS) {
    AppState.dgSessions = AppState.dgSessions.slice(-MAX_DG_SESSIONS);
  }
  AppState.activeDgSession = null;
  saveDgSessions();
  saveActiveDgSession();
  renderPage();
}

// Agrega as sessões salvas por DG, ordenado por Alz/hora (qual DG rende mais). É a ferramenta de
// decisão: "onde meu tempo de macro rende melhor".
export function computeDgComparison() {
  const byDg = {};
  AppState.dgSessions.forEach(s => {
    const agg = byDg[s.dungeonId] || (byDg[s.dungeonId] = {
      dungeonId: s.dungeonId, dungeonName: s.dungeonName, sessions: 0, durationMs: 0, runs: 0, dropCount: 0, totalAlz: 0,
    });
    agg.sessions++;
    agg.durationMs += s.durationMs;
    agg.runs += s.runs || 0;
    agg.dropCount += s.dropCount;
    agg.totalAlz += s.totalAlz;
  });
  return Object.values(byDg)
    .map(a => ({
      ...a,
      alzPerHour: a.durationMs > 60000 ? a.totalAlz / (a.durationMs / 3600000) : null,
      alzPerRun: a.runs > 0 ? a.totalAlz / a.runs : null,
    }))
    .sort((x, y) => (y.alzPerHour ?? -1) - (x.alzPerHour ?? -1));
}

// Contador vivo (1s) que reflete a sessão ativa no menu lateral e, se estiver na página Sessões,
// na caixa ao vivo dela — sem re-renderizar a página inteira a cada segundo.
export function startDgSessionTicker() {
  const paint = () => {
    const summary = getActiveSessionSummary();
    const sidebar = document.getElementById('dgSessionIndicator');
    const pageBox = document.getElementById('dgLivePageBox');
    if (!summary) {
      if (sidebar) sidebar.style.display = 'none';
      if (pageBox) pageBox.textContent = '';
      return;
    }
    const mins = Math.floor(summary.durationMs / 60000);
    const secs = Math.floor((summary.durationMs % 60000) / 1000);
    const clock = mins > 0 ? `${mins}min ${secs}s` : `${secs}s`;
    if (sidebar) {
      sidebar.style.display = 'block';
      sidebar.innerHTML = `<i class="ti ti-crosshair" style="color:var(--gold)"></i> ${summary.dungeonName} · ${clock} · <strong>${formatAlzGamer(summary.totalAlz)}</strong>`;
    }
    if (pageBox) {
      pageBox.innerHTML = `${clock} · ${summary.dropCount} drops · <strong style="color:var(--gold)">${formatAlzGamer(summary.totalAlz)}</strong>${summary.alzPerHour != null ? ` · ${formatAlzGamer(summary.alzPerHour)}/h` : ''}`;
    }
  };
  paint();
  setInterval(paint, 1000);
}
