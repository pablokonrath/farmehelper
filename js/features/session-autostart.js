import { AppState } from '../state/app-state.js';
import { isExcludedGearItem } from './drops.js';
import { startDgSession } from './dg-session.js';
import { getExpectedItemNamesForDungeon } from './item-dungeon-sources.js';
import { showGoalToast } from './alerts.js';
import { saveAutoSessionEnabled } from '../state/persistence.js';
import { todayISODate, stripEnhancementSuffix } from '../utils/parsing.js';

// A maior fonte de buraco no histórico é humana: esquecer de apertar "Iniciar" antes de entrar
// na DG. Todo o farme daquele período existe no log, mas fica fora de qualquer sessão — e é a
// sessão que alimenta "Qual DG rende mais", tempo/run, Onde dropa e o resto.
//
// Este módulo fecha isso: quando drops começam a cair sem nenhuma sessão aberta, ele abre uma
// sozinho, retroagindo o início pro primeiro drop. O palpite da DG usa o cadastro "Onde dropa"
// (itens que só caem em certas DGs); se não der pra cravar, abre com a última DG farmada mesmo —
// conforme combinado, é melhor uma sessão com a DG errada (corrigível em 1 clique no histórico)
// do que farme nenhum registrado.

// Quantos drops precisam cair sem sessão antes de abrir uma. Baixo demais dispararia com o
// resto de um farme anterior chegando; alto demais perde os primeiros minutos.
const MIN_DROPS_TO_DETECT = 5;
// Só considera drops recentes — um lote antigo relido do arquivo não deve abrir sessão.
const RECENT_WINDOW_MS = 10 * 60 * 1000;

// Palpite da DG pelos itens que caíram: pontua cada DG pelo nº de drops recentes que constam
// como raridade dela no cadastro "Onde dropa". Sem cadastro nenhum, ninguém pontua e caímos no
// fallback (última DG farmada).
function guessDungeonFromDrops(drops) {
  const names = new Set(drops.map(d => stripEnhancementSuffix(d.name)));
  let best = null;
  for (const dg of AppState.dungeonList) {
    const expected = getExpectedItemNamesForDungeon(dg.id);
    if (!expected.size) continue;
    let score = 0;
    for (const name of names) if (expected.has(name)) score++;
    if (score > 0 && (!best || score > best.score)) best = { dg, score };
  }
  return best;
}

// Última DG que você farmou (sessão mais recente do histórico) — as pessoas repetem DG, então
// é o chute mais provável quando o cadastro de itens não resolve.
function lastFarmedDungeon() {
  let latest = null;
  for (const s of AppState.dgSessions) {
    if (!latest || s.startAt > latest.startAt) latest = s;
  }
  if (!latest) return null;
  return AppState.dungeonList.find(d => d.id === latest.dungeonId) || null;
}

// Drops do log que já caíram e não pertencem a nenhuma sessão encerrada — a mesma ideia de
// suggestForgottenSessionWindow, mas olhando só a janela recente (estamos detectando "agora").
function unclaimedRecentDrops() {
  const lastEndAt = AppState.dgSessions.length ? Math.max(...AppState.dgSessions.map(s => s.endAt || 0)) : 0;
  const cutoff = Math.max(lastEndAt, Date.now() - RECENT_WINDOW_MS);
  return AppState.drops.filter(d =>
    d.timestamp && d.timestamp.getTime() > cutoff && !isExcludedGearItem(d.name));
}

export function toggleAutoSessionStart(enabled) {
  AppState.autoSessionEnabled = !!enabled;
  saveAutoSessionEnabled().catch(err => console.error('Falha ao salvar detecção automática:', err));
}

// Chamada a cada lote de drops novos do log (ver file-source.js). Barata: sai logo de cara no
// caso comum (sessão já aberta).
export function checkAutoStartSession() {
  if (!AppState.autoSessionEnabled) return;
  if (AppState.activeDgSession) return;
  if (!AppState.dungeonList.length) return;

  const recent = unclaimedRecentDrops();
  if (recent.length < MIN_DROPS_TO_DETECT) return;

  const guess = guessDungeonFromDrops(recent);
  const dungeon = guess?.dg || lastFarmedDungeon() || AppState.dungeonList[0];
  if (!dungeon) return;

  // Retroage pro primeiro drop não reivindicado: o farme dos minutos antes da detecção conta.
  const startAt = Math.min(...recent.map(d => d.timestamp.getTime()));
  startDgSession(dungeon.id, 0, { startAt, auto: true });

  showGoalToast(
    '▶️ Sessão iniciada sozinha',
    guess
      ? `Detectei farme em ${dungeon.name} (pelos itens que caíram). Se não for essa DG, é só trocar no seletor.`
      : `Detectei farme sem sessão aberta e abri uma em ${dungeon.name} — confira se a DG está certa no seletor.`
  );
}
