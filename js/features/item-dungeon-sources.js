import { AppState } from '../state/app-state.js';
import { saveItemDungeonSources, saveRarityThreshold, saveRarityDismissed } from '../state/persistence.js';
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

// Raridade é medida em % de chance por run — a MESMA unidade que a página "Onde dropa" já exibe
// ("taxa por run: 4.2%"). Antes o limiar era expresso em "1 a cada N runs", que é a mesma conta,
// mas obrigava a converter de cabeça pra comparar as duas telas.
//
// O padrão é propositalmente exigente. A primeira versão marcava como raridade tudo que caísse
// abaixo de ~14% por run, e isso incluiu item que cai 2x por dia: num ritmo de ~60 runs/dia,
// qualquer coisa que caísse menos de 8 vezes POR DIA passava. Destacar o que cai todo dia é o
// mesmo que não destacar nada.
export const DEFAULT_RARITY_MAX_PERCENT = 2;

export function getRarityMaxPercent() {
  const v = Number(AppState.rarityMaxPercent);
  return v > 0 ? v : DEFAULT_RARITY_MAX_PERCENT;
}

export function setRarityMaxPercent(value) {
  const v = parseFloat(String(value).replace(',', '.'));
  AppState.rarityMaxPercent = v > 0 ? Math.min(100, v) : DEFAULT_RARITY_MAX_PERCENT;
  saveRarityThreshold().catch(err => console.error('Falha ao salvar limiar de raridade:', err));
  renderPage();
}

// Amostra mínima FIXA, de propósito. Já foi derivada do limiar (100/P runs) e isso criava um
// comportamento errado: apertar o limiar de 2% pra 1% subia a exigência de 50 pra 100 runs e
// derrubava DGs inteiras — então item de 0,5%, mais raro que os dois limiares, SUMIA ao apertar.
// Um limiar mais frouxo tem que ser sempre um superconjunto do mais apertado; com a exigência
// variando junto, deixava de ser. 50 runs é o mesmo piso que "Onde dropa" usa
// (MIN_RUNS_FOR_CONFIDENT_RATE).
export const MIN_RUNS_TO_JUDGE_RARITY = 50;

export function getMinRunsToJudgeRarity() {
  return MIN_RUNS_TO_JUDGE_RARITY;
}

// Itens que VOCÊ decidiu que não são raros, mesmo o histórico dizendo que são (ex: uma joia que
// cai pouco por run mas que você tira todo dia e não considera raridade). Vale por cima da
// detecção automática — mesma lógica do cadastro manual, no sentido oposto: curadoria ganha da
// estatística nos dois sentidos. Guardado por NOME, global: se não é raro, não é em DG nenhuma.
export function isRarityDismissed(itemName) {
  return (AppState.rarityDismissed || []).includes(itemName);
}

export function dismissRarity(itemName) {
  if (!AppState.rarityDismissed) AppState.rarityDismissed = [];
  if (!AppState.rarityDismissed.includes(itemName)) AppState.rarityDismissed.push(itemName);
  saveRarityDismissed().catch(err => console.error('Falha ao salvar exclusão de raridade:', err));
  renderPage();
}

export function restoreRarity(itemName) {
  AppState.rarityDismissed = (AppState.rarityDismissed || []).filter(n => n !== itemName);
  saveRarityDismissed().catch(err => console.error('Falha ao salvar exclusão de raridade:', err));
  renderPage();
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

  const maxPerRun = getRarityMaxPercent() / 100;
  const rare = new Set();
  for (const [name, qty] of qtyByItem) {
    if (qty / totalRuns <= maxPerRun) rare.add(name);
  }
  return rare;
}

// União do cadastro manual (curadoria) com o que o histórico mostra ser raro, menos o que você
// marcou como "não é raro" — usado em Sessões de farme pra destacar as raridades e pra o palpite
// de DG da sessão automática. A exclusão vale por último: é a sua palavra final sobre o item.
export function getExpectedItemNamesForDungeon(dungeonId) {
  const names = getManualExpectedItemNames(dungeonId);
  for (const name of getStatisticalRareItemNames(dungeonId)) names.add(name);
  for (const name of AppState.rarityDismissed || []) names.delete(name);
  return names;
}
