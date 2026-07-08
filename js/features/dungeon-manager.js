import { AppState, DEFAULT_DUNGEONS } from '../state/app-state.js';
import { saveDungeonList } from '../state/persistence.js';
import { renderPage } from '../router.js';

export function saveDungeonEdit(id) {
  const dungeon = AppState.dungeonList.find(d => d.id === id);
  if (!dungeon) return;

  const name = document.getElementById('ed-n-' + id)?.value.trim();
  const alzCost = parseInt(document.getElementById('ed-a-' + id)?.value) || 0;
  const ticketsPerRun = parseInt(document.getElementById('ed-tk-' + id)?.value) || 0;
  const gemsPerRun = parseInt(document.getElementById('ed-g-' + id)?.value) || 0;

  if (name) dungeon.name = name;
  dungeon.alzCost = alzCost;
  dungeon.ticketsPerRun = ticketsPerRun;
  dungeon.gemsPerRun = gemsPerRun;

  AppState.editingDungeonId = null;
  saveDungeonList();
  renderPage();
}

export function deleteDungeon(id) {
  if (!confirm('Remover esta DG?')) return;
  AppState.dungeonList = AppState.dungeonList.filter(d => d.id !== id);
  saveDungeonList();
  renderPage();
}

export function addNewDungeon() {
  const name = document.getElementById('new-dg-n')?.value.trim();
  if (!name) return;
  const alzCost = parseInt(document.getElementById('new-dg-a')?.value) || 0;
  const ticketsPerRun = parseInt(document.getElementById('new-dg-tk')?.value) || 0;
  const gemsPerRun = parseInt(document.getElementById('new-dg-g')?.value) || 0;

  AppState.dungeonList.push({ id: 'c' + Date.now(), name, alzCost, ticketsPerRun, gemsPerRun, custom: true });
  saveDungeonList();
  renderPage();
}

export function resetDungeonList() {
  if (!confirm('Restaurar lista padrão de DGs?')) return;
  AppState.dungeonList = DEFAULT_DUNGEONS.map(d => ({ ...d }));
  saveDungeonList();
  renderPage();
}
