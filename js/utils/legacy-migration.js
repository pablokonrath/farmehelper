import { AppState, DEFAULT_ALERT_SETTINGS, DEFAULT_DUNGEONS } from '../state/app-state.js';

// Lógica de leitura do antigo esquema (localStorage-only, antes do backend existir).
// Usado por dois lugares: persistence.js (migração automática no primeiro login num
// navegador que já tinha dados) e export-legacy-data.html (exportação manual, pro caso de
// o usuário estar acessando de uma origem diferente de onde os dados antigos estão —
// localStorage não atravessa origens, então a automática não enxerga nada nesse caso).
export const LEGACY_STORAGE_KEYS = {
  itemPrices: 'droplist.itemPrices',
  rushHistory: 'droplist.rushHistory',
  trackedKeywords: 'droplist.trackedKeywords',
  filterByTrackedKeywords: 'droplist.filterByTrackedKeywords',
  dungeonList: 'droplist.dungeonList',
  manualDrops: 'droplist.manualDrops',
  alertSettings: 'droplist.alertSettings',
  alertHistory: 'droplist.alertHistory',
};

function readLegacyJSON(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasLegacyData() {
  return Object.values(LEGACY_STORAGE_KEYS).some(key => localStorage.getItem(key) !== null);
}

export function manualDropForApi(d) {
  return { date: d.date, time: d.time, category: d.category, name: d.name, batchId: d.batchId };
}

// Monta o "estado completo" no mesmo formato/defaults que loadPersistedState() aplicava
// quando só existia localStorage — garante que a migração pro banco nunca mande listas
// vazias onde deveria ter defaults (ex: dungeonList) nem perca os fallbacks de formatos
// antigos (ex: trackedKeywords salvas como string solta, dungeonList com requiresTicket).
export function buildLegacyStatePayload() {
  const itemPrices = readLegacyJSON(LEGACY_STORAGE_KEYS.itemPrices) || {};
  const rushHistory = readLegacyJSON(LEGACY_STORAGE_KEYS.rushHistory) || {};

  const rawTrackedKeywords = readLegacyJSON(LEGACY_STORAGE_KEYS.trackedKeywords);
  const trackedKeywords = rawTrackedKeywords
    ? rawTrackedKeywords.map(kw => (typeof kw === 'string' ? { word: kw, alertEnabled: false } : { alertEnabled: false, ...kw }))
    : AppState.trackedKeywords;

  const filterByTrackedKeywords = readLegacyJSON(LEGACY_STORAGE_KEYS.filterByTrackedKeywords) ?? false;

  const rawDungeonList = readLegacyJSON(LEGACY_STORAGE_KEYS.dungeonList);
  const dungeonList = rawDungeonList && rawDungeonList.length > 0
    ? rawDungeonList.map(dg => ({
        ...dg,
        ticketsPerRun: dg.ticketsPerRun ?? (dg.requiresTicket ? 1 : 0),
        gemsPerRun: dg.gemsPerRun ?? 0,
      }))
    : DEFAULT_DUNGEONS;

  const manualDrops = (readLegacyJSON(LEGACY_STORAGE_KEYS.manualDrops) || []).map(manualDropForApi);
  const alertSettings = { ...DEFAULT_ALERT_SETTINGS, ...(readLegacyJSON(LEGACY_STORAGE_KEYS.alertSettings) || {}) };
  const alertHistory = readLegacyJSON(LEGACY_STORAGE_KEYS.alertHistory) || [];

  return { itemPrices, rushHistory, trackedKeywords, filterByTrackedKeywords, dungeonList, manualDrops, alertSettings, alertHistory };
}
