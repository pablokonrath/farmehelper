import { AppState, resetTrackedKeywordsToDefault } from '../state/app-state.js';
import { saveTrackedKeywords } from '../state/persistence.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { getAllDrops, summarizeDropsByItem } from './drops.js';
import { renderPage } from '../router.js';

// Adiciona uma palavra rastreada por nome (sem tocar no DOM nem re-renderizar). Devolve false se
// vazio ou duplicado. Duplicidade é checada sem diferenciar maiúscula/acento — "Fatal" e "fatal"
// rastreiam exatamente a mesma coisa (matchesTrackedKeywordFilter já normaliza pra comparar), então
// deixar cadastrar os dois só duplicava linha na lista sem adicionar cobertura nenhuma.
// alertEnabled controla se já entra com o alerta ligado — a página adiciona desligado (o usuário
// liga o sininho depois); o Modo guiado adiciona já ligado.
export function addTrackedKeywordByName(word, alertEnabled = false) {
  word = (word || '').trim();
  if (!word || AppState.trackedKeywords.some(kw => normalizeForSearch(kw.word) === normalizeForSearch(word))) return false;
  AppState.trackedKeywords.push({ word, alertEnabled });
  saveTrackedKeywords();
  return true;
}

export function addTrackedKeyword() {
  const input = document.getElementById('nKw');
  const word = (input?.value || '').trim();
  if (!word) {
    alert('Digite uma palavra antes de adicionar.');
    return;
  }
  if (!addTrackedKeywordByName(word)) {
    alert(`"${word}" já está rastreada (mesma palavra, maiúscula/acento não conta).`);
    return;
  }
  input.value = '';
  renderPage();
}

// Quantos itens DISTINTOS já dropados (pelo nome) contêm a palavra — confirma que ela realmente
// corresponde a algo. 0 é sinal de alerta: pode ser erro de digitação, ou o item ainda não caiu
// nenhuma vez pra essa conta (então o alerta nunca disparou, e ninguém percebeu).
//
// allItems (opcional): summarizeDropsByItem(getAllDrops()) já calculado por quem chama. A página de
// Alertas chama isto uma vez POR PALAVRA rastreada — sem o parâmetro, cada chamada recalculava o
// log inteiro de novo (getAllDrops + summarizeDropsByItem), ficando O(palavras × log) à toa; com 10
// palavras rastreadas isso é 10x o trabalho de 1. Passando a lista pronta, vira O(palavras × itens
// distintos), que é barato (poucos nomes distintos mesmo com dezenas de milhares de drops — mesmo
// motivo de performance já documentado em isExcludedGearItem).
export function countKeywordMatches(word, allItems) {
  const key = normalizeForSearch(word);
  if (!key) return 0;
  const items = allItems || summarizeDropsByItem(getAllDrops());
  return items.filter(i => normalizeForSearch(i.name).includes(key)).length;
}

// Palavra rastreada já cobre esse item? (substring, sem diferenciar maiúscula/acento) — usado pra
// não sugerir de novo (ver suggestUntrackedValuableItems) o que já tem alerta configurado.
function isItemTracked(itemName) {
  const key = normalizeForSearch(itemName);
  return AppState.trackedKeywords.some(kw => key.includes(normalizeForSearch(kw.word)));
}

// Sugestão automática de palavra pra rastrear: cruza tudo que você já dropou (com preço cadastrado,
// ver Cálculo de farme) com o que NENHUMA palavra rastreada cobre ainda, e devolve os mais valiosos
// primeiro. Sem isso, o único jeito de um item novo passar a gerar alerta é o jogador LEMBRAR de
// cadastrar a palavra manualmente — aqui o próprio histórico de preços já aponta quem merece
// atenção, o jogador só confirma. Sem piso de valor fixo (a economia de servidor privado varia
// demais pra travar um número — mesmo raciocínio já usado no limiar de raridade).
const SUGGESTION_LIMIT = 5;
export function suggestUntrackedValuableItems() {
  return summarizeDropsByItem(getAllDrops())
    .filter(i => i.price > 0 && !isItemTracked(i.name))
    .sort((a, b) => b.price - a.price)
    .slice(0, SUGGESTION_LIMIT);
}

// Aceitar uma sugestão já liga o alerta na hora — diferente de addTrackedKeyword (que entra
// desligado, já que o jogador ainda não decidiu se quer ser avisado): aqui ele já viu o valor do
// item e clicou justamente pra ser avisado, pedir mais um clique pra ligar o sininho seria atrito
// à toa sobre uma decisão que ele já tomou.
export function addSuggestedKeyword(name) {
  if (addTrackedKeywordByName(name, true)) renderPage();
}

export function removeTrackedKeyword(word) {
  AppState.trackedKeywords = AppState.trackedKeywords.filter(kw => kw.word !== word);
  saveTrackedKeywords();
  renderPage();
}

export function resetTrackedKeywords() {
  resetTrackedKeywordsToDefault();
  saveTrackedKeywords();
  renderPage();
}

export function toggleKeywordAlert(word) {
  const keyword = AppState.trackedKeywords.find(kw => kw.word === word);
  if (!keyword) return;
  keyword.alertEnabled = !keyword.alertEnabled;
  saveTrackedKeywords();
  renderPage();
}
