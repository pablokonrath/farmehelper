import { AppState, resetTrackedKeywordsToDefault } from '../state/app-state.js';
import { saveTrackedKeywords } from '../state/persistence.js';
import { renderPage } from '../router.js';

export function addTrackedKeyword() {
  const word = document.getElementById('nKw').value.trim();
  if (!word || AppState.trackedKeywords.some(kw => kw.word === word)) return;
  AppState.trackedKeywords.push({ word, alertEnabled: false });
  saveTrackedKeywords();
  renderPage();
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
