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

// Nomes de item cadastrados como esperados numa DG específica — usado em Sessões de farme pra
// destacar, dentro dos drops de uma sessão, quais já eram esperados daquela DG.
export function getExpectedItemNamesForDungeon(dungeonId) {
  const names = new Set();
  Object.entries(AppState.itemDungeonSources).forEach(([itemName, dungeonIds]) => {
    if (dungeonIds.includes(dungeonId)) names.add(itemName);
  });
  return names;
}
