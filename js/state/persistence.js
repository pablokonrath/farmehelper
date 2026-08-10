import { AppState, DEFAULT_DUNGEONS, CREDIT_CATEGORIES, buildDefaultRushCredits } from './app-state.js';
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
  // Rede de segurança: não grava nada antes do estado ter carregado do servidor. Se o load
  // falhar, um save prematuro sobrescreveria os dados bons (ex: histórico de sessões de DG) com o
  // default vazio do AppState.
  if (!AppState.persistedStateLoaded) return Promise.resolve();
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
  const [itemCategories, itemCategoryAssignments, itemDungeonSources, eventSchedule, alertSounds, knownItemNames] = await Promise.all([
    get('item-categories.php'),
    get('item-category-assignments.php'),
    get('item-dungeon-sources.php'),
    get('event-schedule.php'),
    get('alert-sounds.php'),
    get('known-item-names.php'),
  ]);
  AppState.itemCategories = itemCategories;
  AppState.itemCategoryAssignments = itemCategoryAssignments;
  AppState.itemDungeonSources = itemDungeonSources;
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
    AppState.persistedStateLoaded = true;
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return;
  }
  localStorage.setItem(MIGRATION_FLAG_KEY, '1');

  const [itemPrices, rushHistory, rushRoutes, trackedKeywords, appSettings, dungeonList, manualDrops, alertSettings, alertHistory, dgSessionsRows, dropSnapshot] = await Promise.all([
    get('item-prices.php'),
    get('rush-history.php'),
    get('rush-routes.php'),
    get('tracked-keywords.php'),
    get('app-settings.php'),
    get('dungeon-list.php'),
    get('manual-drops.php'),
    get('alert-settings.php'),
    get('alert-history.php'),
    get('dg-sessions.php'),
    // Tolera a tabela drop_snapshots ainda não existir (migração pendente) — o app inteiro
    // continua funcionando, só sem o histórico de drops além da janela do log.
    get('drop-snapshots.php').catch(() => []),
  ]);

  AppState.itemPrices = itemPrices;
  AppState.rushHistory = rushHistory;
  AppState.rushRoutes = rushRoutes;
  AppState.trackedKeywords = trackedKeywords.length ? trackedKeywords : AppState.trackedKeywords;
  AppState.filterByTrackedKeywords = appSettings.filterByTrackedKeywords ?? false;
  // rushCredits (quantidade + preço) nunca tinha sido salvo de verdade antes — resetava a cada
  // reload, mesmo no mesmo dia. Migração única: se ainda não existe no formato novo mas havia um
  // "custo de fabricar" salvo à parte (rushCreditCraftCosts, campo removido), esse valor vira o
  // ponto de partida do campo único — assim ninguém perde o número que já tinha configurado.
  AppState.rushCredits = buildDefaultRushCredits();
  if (appSettings.rushCredits) {
    CREDIT_CATEGORIES.forEach(cat => {
      if (appSettings.rushCredits[cat.id]) Object.assign(AppState.rushCredits[cat.id], appSettings.rushCredits[cat.id]);
    });
  } else if (appSettings.rushCreditCraftCosts) {
    CREDIT_CATEGORIES.forEach(cat => {
      AppState.rushCredits[cat.id].marketPrice = appSettings.rushCreditCraftCosts[cat.id] || 0;
    });
  }
  AppState.rushCreditItemNames = { ...AppState.rushCreditItemNames, ...(appSettings.rushCreditItemNames || {}) };
  AppState.rushTicketPrice = appSettings.rushTicketPrice ?? '';
  AppState.rushCardCashPrice = appSettings.rushCardCashPrice ?? '';
  AppState.dailyGoalAlz = appSettings.dailyGoalAlz ?? 0;
  AppState.salesLog = appSettings.salesLog ?? [];
  AppState.priceHistory = appSettings.priceHistory ?? {};
  AppState.salesGoals = appSettings.salesGoals ?? [];
  // Sessões de DG vêm da tabela própria agora. Migração transparente: se a tabela ainda está vazia
  // mas há sessões no blob antigo (app_settings.dgSessions), usa o blob e migra pra tabela no fim.
  const legacyDgSessions = appSettings.dgSessions ?? [];
  AppState.dgSessions = dgSessionsRows.length ? dgSessionsRows : legacyDgSessions;
  AppState.activeDgSession = appSettings.activeDgSession ?? null;
  AppState.appliedRouteIds = appSettings.appliedRouteIds ?? [];
  AppState.autoSessionEnabled = appSettings.autoSessionEnabled ?? true;
  // O limiar de raridade já foi guardado como "1 a cada N runs"; virou % (mesma unidade da taxa
  // exibida em Onde dropa). Converte o valor antigo em vez de descartar a configuração.
  AppState.rarityMaxPercent = appSettings.rarityMaxPercent
    ?? (appSettings.rarityOneInRuns ? 100 / appSettings.rarityOneInRuns : AppState.rarityMaxPercent);
  AppState.rarityDismissed = appSettings.rarityDismissed ?? [];
  AppState.resetConfig = { ...AppState.resetConfig, ...(appSettings.resetConfig || {}) };
  AppState.dungeonList = dungeonList.length ? dungeonList : DEFAULT_DUNGEONS;
  AppState.manualDrops = hydrateManualDrops(manualDrops);
  AppState.dropSnapshot = dropSnapshot;
  AppState.alertSettings = alertSettings;
  AppState.alertHistory = alertHistory;
  await loadGlobalOnlyState();
  AppState.persistedStateLoaded = true;
  // Migração única do blob antigo pra tabela: se caímos no fallback, grava agora (a partir daí lê
  // sempre da tabela). persistedStateLoaded já é true, então o put() não é bloqueado.
  if (!dgSessionsRows.length && legacyDgSessions.length) saveDgSessions();
}

export function saveItemPrices() {
  return put('item-prices.php', AppState.itemPrices);
}

export function saveRushHistory() {
  return put('rush-history.php', AppState.rushHistory);
}

export function saveRushRoutes() {
  return put('rush-routes.php', AppState.rushRoutes);
}

export function saveTrackedKeywords() {
  return put('tracked-keywords.php', AppState.trackedKeywords);
}

export function saveFilterKeywordsFlag() {
  return put('app-settings.php', { filterByTrackedKeywords: AppState.filterByTrackedKeywords });
}

export function saveRushCredits() {
  return put('app-settings.php', { rushCredits: AppState.rushCredits });
}

// Upsert por (dia, item) no servidor — NÃO é replace-all como os outros save*(), porque o
// cliente só enxerga a janela do log (~30 dias) e apagar o resto destruiria justamente o
// histórico antigo que essa tabela existe pra guardar. Ver api/drop-snapshots.php.
export function saveDropSnapshot(rows) {
  return put('drop-snapshots.php', rows);
}

export function saveRarityDismissed() {
  return put('app-settings.php', { rarityDismissed: AppState.rarityDismissed });
}

export function saveRarityThreshold() {
  return put('app-settings.php', { rarityMaxPercent: AppState.rarityMaxPercent });
}

export function saveAutoSessionEnabled() {
  return put('app-settings.php', { autoSessionEnabled: AppState.autoSessionEnabled });
}

export function saveRushCreditItemNames() {
  return put('app-settings.php', { rushCreditItemNames: AppState.rushCreditItemNames });
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

export function saveSalesGoals() {
  return put('app-settings.php', { salesGoals: AppState.salesGoals });
}

export function saveSalesLog() {
  return put('app-settings.php', { salesLog: AppState.salesLog });
}

export function savePriceHistory() {
  return put('app-settings.php', { priceHistory: AppState.priceHistory });
}

export function saveDgSessions() {
  return put('dg-sessions.php', AppState.dgSessions);
}

export function saveActiveDgSession() {
  return put('app-settings.php', { activeDgSession: AppState.activeDgSession });
}

export function saveAppliedRoutes() {
  return put('app-settings.php', { appliedRouteIds: AppState.appliedRouteIds });
}

export function saveResetConfig() {
  return put('app-settings.php', { resetConfig: AppState.resetConfig });
}

export function saveDungeonList() {
  return put('dungeon-list.php', AppState.dungeonList);
}

export function saveItemCategories() {
  return put('item-categories.php', AppState.itemCategories);
}

export function saveItemCategoryAssignments() {
  return put('item-category-assignments.php', AppState.itemCategoryAssignments);
}

export function saveItemDungeonSources() {
  return put('item-dungeon-sources.php', AppState.itemDungeonSources);
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
