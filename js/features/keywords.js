import { AppState, resetTrackedKeywordsToDefault } from '../state/app-state.js';
import { saveTrackedKeywords } from '../state/persistence.js';
import { renderPage } from '../router.js';

// Adiciona uma palavra rastreada por nome (sem tocar no DOM nem re-renderizar). Devolve false se
// vazio ou duplicado. alertEnabled controla se já entra com o alerta ligado — a página adiciona
// desligado (o usuário liga o sininho depois); o Modo guiado adiciona já ligado.
export function addTrackedKeywordByName(word, alertEnabled = false) {
  word = (word || '').trim();
  if (!word || AppState.trackedKeywords.some(kw => kw.word === word)) return false;
  AppState.trackedKeywords.push({ word, alertEnabled });
  saveTrackedKeywords();
  return true;
}

export function addTrackedKeyword() {
  if (addTrackedKeywordByName(document.getElementById('nKw').value)) renderPage();
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
