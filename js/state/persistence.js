import { AppState, DEFAULT_DUNGEONS, DEFAULT_CREDIT_CRAFT_COSTS } from './app-state.js';
import { hasLegacyData, buildLegacyStatePayload, manualDropForApi } from '../utils/legacy-migration.js';

// Agora que existe backend (PHP/MySQL na Hostinger), este arquivo é a única ponte entre
// AppState e a persistência — o resto do app continua chamando save*()/loadPersistedState()
// exatamente como antes, sem saber que por trás virou fetch() em vez de localStorage.
const API_BASE = 'api';

const MIGRATION_FLAG_KEY = 'droplist.migratedToBackend';
const MAX_ALERT_HISTORY_ENTRIES = 200;

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}/${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  // Sessão expirou/cookie perdido — volta pra tela de login em vez de quebrar em silêncio.
  if (response.status === 401) {
    window.location.reload();
    throw new Error('Sessão expirada');
  }
  if (!response.ok) throw new Error(`API ${path} respondeu ${response.status}`);
  return response.json();
}

const get = path => apiFetch(path, { method: 'GET' });
const put = (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) });

function hydrateManualDrops(rawDrops) {
  // JSON não preserva Date — reconstrói timestamp a partir de date/time ao carregar.
  return rawDrops.map(d => ({ ...d, timestamp: new Date(d.date + 'T' + d.time) }));
}

function applyStateFromPayload(payload) {
  AppState.itemPrices = payload.itemPrices;
  AppState.rushHistory = payload.rushHistory;
  AppState.trackedKeywords = payload.trackedKeywords;
  AppState.filterByTrackedKeywords = payload.filterByTrackedKeywords;
  AppState.dungeonList = payload.dungeonList;
  AppState.manualDrops = hydrateManualDrops(payload.manualDrops);
  AppState.alertSettings = payload.alertSettings;
  AppState.alertHistory = payload.alertHistory;
}

export async function loadPersistedState() {
  if (!localStorage.getItem(MIGRATION_FLAG_KEY) && hasLegacyData()) {
    const payload = buildLegacyStatePayload();
    await apiFetch('migrate.php', { method: 'POST', body: JSON.stringify(payload) });
    applyStateFromPayload(payload);
    AppState.rankingItems = await get('ranking-items.php');
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return;
  }
  localStorage.setItem(MIGRATION_FLAG_KEY, '1');

  const [itemPrices, rushHistory, trackedKeywords, appSettings, dungeonList, manualDrops, alertSettings, alertHistory, rankingItems] = await Promise.all([
    get('item-prices.php'),
    get('rush-history.php'),
    get('tracked-keywords.php'),
    get('app-settings.php'),
    get('dungeon-list.php'),
    get('manual-drops.php'),
    get('alert-settings.php'),
    get('alert-history.php'),
    get('ranking-items.php'),
  ]);

  AppState.itemPrices = itemPrices;
  AppState.rushHistory = rushHistory;
  AppState.trackedKeywords = trackedKeywords.length ? trackedKeywords : AppState.trackedKeywords;
  AppState.filterByTrackedKeywords = appSettings.filterByTrackedKeywords ?? false;
  AppState.rushCreditCraftCosts = { ...DEFAULT_CREDIT_CRAFT_COSTS, ...(appSettings.rushCreditCraftCosts || {}) };
  AppState.dungeonList = dungeonList.length ? dungeonList : DEFAULT_DUNGEONS;
  AppState.manualDrops = hydrateManualDrops(manualDrops);
  AppState.alertSettings = alertSettings;
  AppState.alertHistory = alertHistory;
  AppState.rankingItems = rankingItems;
}

export function saveItemPrices() {
  return put('item-prices.php', AppState.itemPrices);
}

export function saveRushHistory() {
  return put('rush-history.php', AppState.rushHistory);
}

export function saveTrackedKeywords() {
  return put('tracked-keywords.php', AppState.trackedKeywords);
}

export function saveFilterKeywordsFlag() {
  return put('app-settings.php', { filterByTrackedKeywords: AppState.filterByTrackedKeywords });
}

export function saveRushCreditCraftCosts() {
  return put('app-settings.php', { rushCreditCraftCosts: AppState.rushCreditCraftCosts });
}

export function saveDungeonList() {
  return put('dungeon-list.php', AppState.dungeonList);
}

export function saveRankingItems() {
  return put('ranking-items.php', AppState.rankingItems);
}

export function saveManualDrops() {
  return put('manual-drops.php', AppState.manualDrops.map(manualDropForApi));
}

export function saveAlertSettings() {
  return put('alert-settings.php', AppState.alertSettings);
}

export function saveAlertHistory() {
  if (AppState.alertHistory.length > MAX_ALERT_HISTORY_ENTRIES) {
    AppState.alertHistory = AppState.alertHistory.slice(-MAX_ALERT_HISTORY_ENTRIES);
  }
  return put('alert-history.php', AppState.alertHistory);
}
