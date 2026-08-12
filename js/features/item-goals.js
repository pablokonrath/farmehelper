import { AppState } from '../state/app-state.js';
import { saveItemGoals } from '../state/persistence.js';
import { getAllDrops } from './drops.js';
import { findDropSources } from './drop-source.js';
import { normalizeForSearch, todayISODate, stripEnhancementSuffix } from '../utils/parsing.js';
import { actWithUndo } from './undo.js';
import { renderPage } from '../router.js';

// Meta de ITEM, não de Alz.
//
// Toda meta do app é em Alz (dia, semana, mês, cofre), mas objetivo de jogador raramente nasce
// assim — nasce em item: "preciso de 300 Núcleos pro +15", "faltam 40 Joias". O app tinha todas as
// peças pra responder isso (taxa de drop real por DG em Onde dropa, tempo por run em Sessões,
// ritmo diário no histórico) e não respondia nada, porque nenhuma delas se falava.
//
// Conta drops a partir da CRIAÇÃO da meta, não o acumulado de sempre — mesmo modelo dos Cofres de
// Alz. É o único recorte honesto: o app não conhece seu inventário (não sabe o que você já gastou,
// craftou ou vendeu), então "quanto você tem" é impossível de afirmar. "Quanto caiu desde que você
// decidiu perseguir isso" é verificável.

const RITMO_JANELA_DIAS = 14;

export function createItemGoal({ itemName, targetQty }) {
  itemName = (itemName || '').trim();
  targetQty = Math.max(1, parseInt(targetQty, 10) || 0);
  if (!itemName || targetQty < 1) return false;
  AppState.itemGoals.push({
    id: 'ig' + Date.now(),
    itemName,
    targetQty,
    createdAt: Date.now(),
    sinceDate: todayISODate(),
  });
  saveItemGoals().catch(err => console.error('Falha ao salvar meta de item:', err));
  return true;
}

export function addItemGoal() {
  const nameInput = document.getElementById('newItemGoalName');
  const qtyInput = document.getElementById('newItemGoalQty');
  const name = nameInput?.value.trim();
  const qty = qtyInput?.value;
  if (!name || !(parseInt(qty, 10) > 0)) {
    alert('Informe o item e quantas unidades você precisa.');
    return;
  }
  if (!createItemGoal({ itemName: name, targetQty: qty })) return;
  nameInput.value = '';
  qtyInput.value = '';
  renderPage();
}

export function deleteItemGoal(id) {
  const index = AppState.itemGoals.findIndex(g => g.id === id);
  if (index < 0) return;
  const [goal] = AppState.itemGoals.splice(index, 1);
  saveItemGoals().catch(err => console.error('Falha ao salvar meta de item:', err));
  renderPage();

  actWithUndo(`Meta removida: ${goal.targetQty}× ${goal.itemName}`, () => {
    AppState.itemGoals.splice(index, 0, goal);
    saveItemGoals().catch(err => console.error('Falha ao salvar meta de item:', err));
    renderPage();
  });
}

// Quantos desse item caíram a partir de uma data (inclusive). Casa por trecho do nome, sem
// diferenciar maiúscula/acento e ignorando o sufixo +N — mesma regra do resto do app, pra "Joia"
// pegar "Joia Enfraquecida" e "Joia Enfraquecida +3".
function countDropsSince(itemName, sinceDate) {
  const key = normalizeForSearch(stripEnhancementSuffix(itemName));
  return getAllDrops().filter(d =>
    d.date >= sinceDate && normalizeForSearch(stripEnhancementSuffix(d.name)).includes(key)
  ).length;
}

export function computeItemGoalsProgress() {
  const hoje = todayISODate();
  const inicioJanela = todayISODate(new Date(Date.now() - RITMO_JANELA_DIAS * 86400000));

  return AppState.itemGoals.map(goal => {
    const obtained = countDropsSince(goal.itemName, goal.sinceDate);
    const remaining = Math.max(0, goal.targetQty - obtained);
    const complete = remaining === 0;

    // Melhor DG pra esse item, pela taxa por run do SEU histórico (mesma função que alimenta
    // "Onde dropa" — não uma segunda conta que pode divergir dela).
    const fontes = findDropSources(goal.itemName);
    const melhorDg = fontes.find(f => f.dropRate != null) || null;
    const runsNeeded = melhorDg && melhorDg.dropRate > 0 && !complete
      ? Math.ceil(remaining / melhorDg.dropRate)
      : null;

    // ETA por ritmo REAL dos últimos 14 dias: é o que você de fato tira por dia jogando do jeito
    // que joga, não uma projeção teórica de "se você fizesse 20 runs por dia". Projeção teórica
    // sempre erra pra otimista, porque ninguém joga no teto todo dia.
    const naJanela = countDropsSince(goal.itemName, inicioJanela);
    const diasDeJanela = Math.max(1, Math.round((new Date(hoje) - new Date(inicioJanela)) / 86400000));
    const perDay = naJanela / diasDeJanela;
    let etaDays = null;
    let etaDate = null;
    if (!complete && perDay > 0) {
      etaDays = Math.ceil(remaining / perDay);
      const eta = new Date(hoje);
      eta.setDate(eta.getDate() + etaDays);
      etaDate = todayISODate(eta);
    }

    return {
      ...goal,
      obtained,
      remaining,
      complete,
      progress: goal.targetQty > 0 ? Math.min(1, obtained / goal.targetQty) : 0,
      melhorDg,
      runsNeeded,
      perDay,
      etaDays,
      etaDate,
    };
  });
}
