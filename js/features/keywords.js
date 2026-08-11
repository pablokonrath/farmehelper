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
// nenhuma vez pra essa conta (então o alerta nunca disparou, e ninguém percebeu). Roda sobre os
// nomes DISTINTOS de summarizeDropsByItem (poucos), não sobre o log inteiro (pode ter dezenas de
// milhares de linhas) — mesmo motivo de performance já documentado em isExcludedGearItem.
export function countKeywordMatches(word) {
  const key = normalizeForSearch(word);
  if (!key) return 0;
  return summarizeDropsByItem(getAllDrops()).filter(i => normalizeForSearch(i.name).includes(key)).length;
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
