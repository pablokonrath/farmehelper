import { AppState } from '../state/app-state.js';
import { getItemPrice, summarizeDropsByItem } from './drops.js';
import { saveDgSessions, saveActiveDgSession, saveResetConfig } from '../state/persistence.js';
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

// Um intervalo sem nenhum drop maior que isso conta como INATIVIDADE (ex: o rush parou e você foi
// dormir) e não entra no tempo de farme — assim a duração fica fiel ao tempo realmente farmando,
// e o Alz/hora não fica achatado por horas paradas.
const ACTIVE_IDLE_CAP_MS = 5 * 60 * 1000;

// Tempo "ativo" da sessão: soma os intervalos entre drops consecutivos, cortando cada gap no teto
// de inatividade. Continuar farmando (drops seguidos) conta tudo; parar por horas conta só o teto.
function activeDurationMs(drops) {
  const times = drops.filter(d => d.timestamp).map(d => d.timestamp.getTime()).sort((a, b) => a - b);
  let active = 0;
  for (let i = 1; i < times.length; i++) active += Math.min(times[i] - times[i - 1], ACTIVE_IDLE_CAP_MS);
  return active;
}

// Resumo ao vivo da sessão em andamento (ou null). Recalculado sob demanda a partir da janela.
export function getActiveSessionSummary() {
  const s = AppState.activeDgSession;
  if (!s) return null;
  const now = Date.now();
  const drops = sessionDrops(s.startAt, now);
  const activeMs = activeDurationMs(drops);
  const { totalAlz } = summarizeDrops(drops);
  return {
    dungeonName: s.dungeonName,
    durationMs: now - s.startAt, // relógio desde o início (mostrado no contador ao vivo)
    activeMs,                    // tempo farmando, sem inatividade
    dropCount: drops.length,
    totalAlz,
    alzPerHour: activeMs > 60000 ? totalAlz / (activeMs / 3600000) : null,
  };
}

export function endDgSession() {
  const s = AppState.activeDgSession;
  if (!s) return;
  const endAt = Date.now();
  const drops = sessionDrops(s.startAt, endAt);
  const durationMs = endAt - s.startAt;
  const activeMs = activeDurationMs(drops); // tempo farmando, sem contar inatividade
  const { totalAlz, bestItem } = summarizeDrops(drops);
  const items = {};
  summarizeDropsByItem(drops).forEach(it => (items[it.name] = it.qty));

  AppState.dgSessions.push({
    dungeonId: s.dungeonId,
    dungeonName: s.dungeonName,
    date: drops[0]?.date || todayISODate(),
    startAt: s.startAt,
    endAt,
    durationMs,               // relógio total (início → encerrar)
    activeDurationMs: activeMs, // tempo fiel de farme (desconta inatividade)
    runs: s.runs || 0,
    dropCount: drops.length,
    uniqueItems: Object.keys(items).length,
    totalAlz,
    alzPerHour: activeMs > 60000 ? totalAlz / (activeMs / 3600000) : null,
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
      dungeonId: s.dungeonId, dungeonName: s.dungeonName, sessions: 0, activeMs: 0, runs: 0, dropCount: 0, totalAlz: 0,
    });
    agg.sessions++;
    // Tempo ativo (fiel), com fallback pra duração total em sessões antigas sem o campo.
    agg.activeMs += s.activeDurationMs ?? s.durationMs;
    agg.runs += s.runs || 0;
    agg.dropCount += s.dropCount;
    agg.totalAlz += s.totalAlz;
  });
  return Object.values(byDg)
    .map(a => ({
      ...a,
      durationMs: a.activeMs, // "tempo total" exibido = soma do tempo ativo
      alzPerHour: a.activeMs > 60000 ? a.totalAlz / (a.activeMs / 3600000) : null,
      alzPerRun: a.runs > 0 ? a.totalAlz / a.runs : null,
    }))
    // Ordena por Alz/RUN, não por Alz/hora: DG tem limite diário de runs, então o que decide
    // onde gastar as entradas é o rendimento por run (quem não tem runs informadas vai pro fim).
    .sort((x, y) => (y.alzPerRun ?? -1) - (x.alzPerRun ?? -1));
}

// Parâmetros do "vale a pena resetar?" — todos inteiros não-negativos (valores em Alz ou gemas
// vêm de inputs mascarados; runs por reset no mínimo 1).
export function setResetConfig(field, value) {
  const n = Math.max(0, parseInt(String(value).replace(/\D/g, ''), 10) || 0);
  AppState.resetConfig[field] = field === 'runsPerReset' ? Math.max(1, n) : n;
  saveResetConfig();
  renderPage();
}

// Pra cada DG com Alz/run medido: desconta o custo de entrada da run (Alz + tickets + gemas, pelos
// valores informados) e o custo do reset rateado por run. Se sobrar lucro, vale resetar.
export function computeResetWorth() {
  const cfg = AppState.resetConfig;
  const gemValue = cfg.gemValueAlz || 0;
  const ticketValue = cfg.ticketValueAlz || 0;
  const runsPerReset = Math.max(1, cfg.runsPerReset || 1);
  const resetCostPerRun = ((cfg.resetCostGems || 0) * gemValue) / runsPerReset;

  const rows = computeDgComparison()
    .filter(c => c.alzPerRun != null)
    .map(c => {
      const dg = AppState.dungeonList.find(d => d.id === c.dungeonId);
      const entryCostPerRun = dg
        ? (dg.alzCost || 0) + (dg.ticketsPerRun || 0) * ticketValue + (dg.gemsPerRun || 0) * gemValue
        : 0;
      const netAlzPerRun = c.alzPerRun - entryCostPerRun;
      const profitAfterReset = netAlzPerRun - resetCostPerRun;
      return {
        dungeonName: c.dungeonName,
        alzPerRun: c.alzPerRun,
        entryCostPerRun,
        netAlzPerRun,
        profitAfterReset,
        worth: profitAfterReset > 0,
      };
    })
    .sort((a, b) => b.profitAfterReset - a.profitAfterReset);

  return { resetCostPerRun, rows, gemValueSet: gemValue > 0 };
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
