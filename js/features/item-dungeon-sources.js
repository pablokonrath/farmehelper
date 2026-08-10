import { AppState } from '../state/app-state.js';
import { saveItemDungeonSources, saveRarityThreshold } from '../state/persistence.js';
import { isExcludedGearItem } from './drops.js';
import { renderPage } from '../router.js';

// Cadastra um item novo no mapa item → DGs (começa sem nenhuma DG marcada, o jogador marca
// depois pelos checkboxes). Mesmo nome já cadastrado só reabre o card, não duplica.
export function addItemDungeonSourceItem() {
  const input = document.getElementById('newItemDungeonSource');
  const name = input?.value.trim();
  if (!name) return;
  if (!(name in AppState.itemDungeonSources)) {
    AppState.itemDungeonSources[name] = [];
    saveItemDungeonSources().catch(err => console.error('Falha ao salvar item x DG:', err));
  }
  input.value = '';
  renderPage();
}

export function removeItemDungeonSourceItem(itemName) {
  delete AppState.itemDungeonSources[itemName];
  saveItemDungeonSources().catch(err => console.error('Falha ao salvar item x DG:', err));
  renderPage();
}

export function toggleItemDungeonSourceDg(itemName, dungeonId) {
  const list = AppState.itemDungeonSources[itemName];
  if (!list) return;
  const idx = list.indexOf(dungeonId);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(dungeonId);
  saveItemDungeonSources().catch(err => console.error('Falha ao salvar item x DG:', err));
  renderPage();
}

// Nomes de item cadastrados MANUALMENTE como esperados numa DG específica.
export function getManualExpectedItemNames(dungeonId) {
  const names = new Set();
  Object.entries(AppState.itemDungeonSources).forEach(([itemName, dungeonIds]) => {
    if (dungeonIds.includes(dungeonId)) names.add(itemName);
  });
  return names;
}

// Raridade é medida em "1 a cada N runs" — a unidade em que o jogador realmente pensa ("esse aí
// demora mil DGs pra cair"). Guardado como N (não como taxa) pelo mesmo motivo.
//
// O padrão é propositalmente EXIGENTE. A primeira versão usava 1-a-cada-7 runs e marcou como
// raridade coisa que cai 2x por dia: num ritmo de ~60 runs/dia, qualquer item que caia menos de
// 8 vezes por dia passava no filtro. Destacar o que cai todo dia é o mesmo que não destacar nada.
export const DEFAULT_RARITY_ONE_IN_RUNS = 500;

export function getRarityOneInRuns() {
  return Math.max(2, AppState.rarityOneInRuns || DEFAULT_RARITY_ONE_IN_RUNS);
}

export function setRarityOneInRuns(value) {
  AppState.rarityOneInRuns = Math.max(2, parseInt(value, 10) || DEFAULT_RARITY_ONE_IN_RUNS);
  saveRarityThreshold().catch(err => console.error('Falha ao salvar limiar de raridade:', err));
  renderPage();
}

// Amostra mínima DERIVADA do próprio limiar, em vez de um segundo número solto: pra afirmar que
// algo é "mais raro que 1 a cada N", é preciso ter feito ao menos N runs — antes disso o item não
// teve nem chance de cair uma vez, e "não caiu ainda" não é evidência de raridade.
export function getMinRunsToJudgeRarity() {
  return getRarityOneInRuns();
}

// Taxa real de um item numa DG, pelo seu histórico ({ perRun, runs, qty } ou null sem amostra).
// Serve pra UI mostrar POR QUE um item foi considerado raro, em vez de só afirmar que é.
export function getItemRateInDungeon(dungeonId, itemName) {
  let runs = 0;
  let qty = 0;
  for (const session of AppState.dgSessions) {
    if (session.dungeonId !== dungeonId || !session.runs) continue;
    runs += session.runs;
    qty += session.items?.[itemName] || 0;
  }
  return runs > 0 ? { perRun: qty / runs, runs, qty } : null;
}

// Itens que o SEU histórico mostra serem raros nesta DG — derivado das sessões já encerradas
// (quantidade ÷ runs), sem depender de cadastro nenhum. Existe porque o cadastro manual de
// "Onde dropa" é trabalhoso item a item, e enquanto ele está vazio o destaque de raridade e o
// palpite de DG da sessão automática ficariam inertes — sendo que o dado pra decidir isso já
// está no histórico. O cadastro manual continua valendo por cima (é curadoria, ganha da
// estatística), este é o piso automático.
function getStatisticalRareItemNames(dungeonId) {
  let totalRuns = 0;
  const qtyByItem = new Map();
  for (const session of AppState.dgSessions) {
    if (session.dungeonId !== dungeonId || !session.runs) continue;
    totalRuns += session.runs;
    for (const [name, qty] of Object.entries(session.items || {})) {
      // Sessões antigas (de antes do filtro de equipamento genérico, ou de antes de uma palavra
      // ter sido adicionada à lista) ainda guardam esses itens no registro. Sem filtrar aqui,
      // armadura/espada/coturno entravam como "raridade" — justamente o lixo que o filtro existe
      // pra sumir, e que por cair pouco em cada variação passava em qualquer limiar.
      if (isExcludedGearItem(name)) continue;
      qtyByItem.set(name, (qtyByItem.get(name) || 0) + qty);
    }
  }
  if (totalRuns < getMinRunsToJudgeRarity()) return new Set();

  const maxPerRun = 1 / getRarityOneInRuns();
  const rare = new Set();
  for (const [name, qty] of qtyByItem) {
    if (qty / totalRuns <= maxPerRun) rare.add(name);
  }
  return rare;
}

// União do cadastro manual (curadoria) com o que o histórico mostra ser raro — usado em Sessões
// de farme pra destacar as raridades e pra o palpite de DG da sessão automática.
export function getExpectedItemNamesForDungeon(dungeonId) {
  const names = getManualExpectedItemNames(dungeonId);
  for (const name of getStatisticalRareItemNames(dungeonId)) names.add(name);
  return names;
}
