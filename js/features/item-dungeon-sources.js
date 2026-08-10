import { AppState } from '../state/app-state.js';
import { saveItemDungeonSources } from '../state/persistence.js';
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

// Raro = cai em poucas runs daquela DG. Acima dessa taxa é item de rotina, não raridade.
const RARE_MAX_DROPS_PER_RUN = 0.15; // ~1 a cada 7 runs ou menos
// Piso de amostra: com poucas runs, qualquer item parece raro só por não ter caído ainda.
const MIN_RUNS_TO_JUDGE_RARITY = 30;

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
      qtyByItem.set(name, (qtyByItem.get(name) || 0) + qty);
    }
  }
  if (totalRuns < MIN_RUNS_TO_JUDGE_RARITY) return new Set();

  const rare = new Set();
  for (const [name, qty] of qtyByItem) {
    if (qty / totalRuns <= RARE_MAX_DROPS_PER_RUN) rare.add(name);
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
