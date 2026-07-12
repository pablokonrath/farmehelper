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

// Cada save*() manda o AppState.xxx inteiro (replace-all no servidor). Se duas chamadas pro
// MESMO endpoint saem em sequência rápida (ex: usuário clicando vários selects seguidos na
// tabela de categorias do Admin), os PUTs podem chegar ao servidor fora de ordem — o último a
// CHEGAR vence, não o último a SAIR, então uma requisição mais antiga podia sobrescrever uma
// mais nova com dados incompletos. Uma fila por endpoint garante que só um PUT por vez esteja
// em voo pra cada path, na ordem em que foram chamados; como cada chamada serializa o corpo só
// na hora de disparar (não na hora de enfileirar), a requisição sempre carrega o estado mais
// atual do AppState nesse momento, mesmo que tenha ficado esperando na fila.
const pendingPutByPath = new Map();

function put(path, body) {
  const previous = pendingPutByPath.get(path) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }));
  pendingPutByPath.set(path, next);
  return next;
}

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

async function loadGlobalOnlyState() {
  const [rankingItems, itemCategories, itemCategoryAssignments, guilds, eventSchedule, alertSounds, knownItemNames] = await Promise.all([
    get('ranking-items.php'),
    get('item-categories.php'),
    get('item-category-assignments.php'),
    get('guilds.php'),
    get('event-schedule.php'),
    get('alert-sounds.php'),
    get('known-item-names.php'),
  ]);
  AppState.rankingItems = rankingItems;
  AppState.itemCategories = itemCategories;
  AppState.itemCategoryAssignments = itemCategoryAssignments;
  AppState.guilds = guilds;
  AppState.eventSchedule = eventSchedule;
  AppState.alertSounds = alertSounds;
  AppState.knownItemNames = knownItemNames;
}

export async function loadPersistedState() {
  if (!localStorage.getItem(MIGRATION_FLAG_KEY) && hasLegacyData()) {
    const payload = buildLegacyStatePayload();
    await apiFetch('migrate.php', { method: 'POST', body: JSON.stringify(payload) });
    applyStateFromPayload(payload);
    await loadGlobalOnlyState();
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return;
  }
  localStorage.setItem(MIGRATION_FLAG_KEY, '1');

  const [itemPrices, rushHistory, trackedKeywords, appSettings, dungeonList, manualDrops, alertSettings, alertHistory, wishlistItems] = await Promise.all([
    get('item-prices.php'),
    get('rush-history.php'),
    get('tracked-keywords.php'),
    get('app-settings.php'),
    get('dungeon-list.php'),
    get('manual-drops.php'),
    get('alert-settings.php'),
    get('alert-history.php'),
    get('wishlist-items.php'),
  ]);

  AppState.itemPrices = itemPrices;
  AppState.rushHistory = rushHistory;
  AppState.trackedKeywords = trackedKeywords.length ? trackedKeywords : AppState.trackedKeywords;
  AppState.filterByTrackedKeywords = appSettings.filterByTrackedKeywords ?? false;
  AppState.rushCreditCraftCosts = { ...DEFAULT_CREDIT_CRAFT_COSTS, ...(appSettings.rushCreditCraftCosts || {}) };
  AppState.rushTicketPrice = appSettings.rushTicketPrice ?? '';
  AppState.rushCardCashPrice = appSettings.rushCardCashPrice ?? '';
  AppState.dailyGoalAlz = appSettings.dailyGoalAlz ?? 0;
  AppState.salesLog = appSettings.salesLog ?? [];
  AppState.priceHistory = appSettings.priceHistory ?? {};
  AppState.dgSessions = appSettings.dgSessions ?? [];
  AppState.activeDgSession = appSettings.activeDgSession ?? null;
  AppState.resetConfig = { ...AppState.resetConfig, ...(appSettings.resetConfig || {}) };
  AppState.dungeonList = dungeonList.length ? dungeonList : DEFAULT_DUNGEONS;
  AppState.manualDrops = hydrateManualDrops(manualDrops);
  AppState.alertSettings = alertSettings;
  AppState.alertHistory = alertHistory;
  AppState.wishlistItems = wishlistItems;
  await loadGlobalOnlyState();
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

export function saveWishlistItems() {
  return put('wishlist-items.php', AppState.wishlistItems);
}

export function saveFilterKeywordsFlag() {
  return put('app-settings.php', { filterByTrackedKeywords: AppState.filterByTrackedKeywords });
}

export function saveRushCreditCraftCosts() {
  return put('app-settings.php', { rushCreditCraftCosts: AppState.rushCreditCraftCosts });
}

// Preço do ticket e do Card Cash — parâmetros do rush que o jogador digita uma vez e valem pra
// sempre (antes ficavam só na sessão e sumiam ao recarregar).
export function saveRushParams() {
  return put('app-settings.php', {
    rushTicketPrice: AppState.rushTicketPrice,
    rushCardCashPrice: AppState.rushCardCashPrice,
  });
}

export function saveDailyGoal() {
  return put('app-settings.php', { dailyGoalAlz: AppState.dailyGoalAlz });
}

export function saveSalesLog() {
  return put('app-settings.php', { salesLog: AppState.salesLog });
}

export function savePriceHistory() {
  return put('app-settings.php', { priceHistory: AppState.priceHistory });
}

export function saveDgSessions() {
  return put('app-settings.php', { dgSessions: AppState.dgSessions });
}

export function saveActiveDgSession() {
  return put('app-settings.php', { activeDgSession: AppState.activeDgSession });
}

export function saveResetConfig() {
  return put('app-settings.php', { resetConfig: AppState.resetConfig });
}

export function saveDungeonList() {
  return put('dungeon-list.php', AppState.dungeonList);
}

export function saveRankingItems() {
  return put('ranking-items.php', AppState.rankingItems);
}

export function saveItemCategories() {
  return put('item-categories.php', AppState.itemCategories);
}

export function saveItemCategoryAssignments() {
  return put('item-category-assignments.php', AppState.itemCategoryAssignments);
}

export function saveGuilds() {
  return put('guilds.php', AppState.guilds);
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
