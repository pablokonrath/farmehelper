import { todayISODate } from '../utils/parsing.js';

// Lista oficial de DGs de rush usada pelo jogador (importada do painel de referência em 2026-07-08).
// alzCost = Alz por run, ticketsPerRun = tickets consumidos por run, gemsPerRun = gemas de entrada
// consumidas por run (cobradas ao custo por gema atual, getCostPerGem() em rush-cart.js) — distinto
// das gemas de reset, que são opcionais e configuradas por item ao adicionar ao carrinho.
export const DEFAULT_DUNGEONS = [
  { id: 'd1', name: 'Parte do Mapa', alzCost: 31000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd2', name: 'Estação Ruína', alzCost: 31000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd3', name: 'Selo da Escuridão', alzCost: 500000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd4', name: 'Dragona dos Mortos 1SS', alzCost: 31000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd5', name: 'Dragona dos Mortos 2SS', alzCost: 500000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd6', name: 'Templo Esquecido 1SS', alzCost: 500000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd7', name: 'Ilha Proibida', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd8', name: 'Siena 1SS', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd9', name: 'C1', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd10', name: 'DX Premium da Terra', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 15 },
  { id: 'd11', name: 'DX Premium do Fogo', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 15 },
  { id: 'd12', name: 'DX Premium do Gelo', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 15 },
  { id: 'd13', name: 'DX Premium do Ar', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 15 },
  { id: 'd14', name: 'DX da Terra (Desperto)', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd15', name: 'DX do Fogo (Desperto)', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd16', name: 'DX do Gelo (Desperto)', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd17', name: 'DX do Ar (Desperto)', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd18', name: 'Pandemônio', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd19', name: 'Moinho Sagrado', alzCost: 1500000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd20', name: 'Templo Esquecido 2SS', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd21', name: 'Siena 2SS', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd22', name: 'Posto das Máquinas', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd23', name: 'Torre dos Mortos 3SS', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd24', name: 'Templo Esquecido 2SS (Desperto)', alzCost: 2000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd25', name: 'Vale Tempestuoso (Desperto)', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd26', name: 'Torre dos Mortos 3SS (Parte 2)', alzCost: 1500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd27', name: 'C1D', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd28', name: 'C2D', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd29', name: 'Crista Ilusória', alzCost: 2000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd30', name: 'Arena Acheron', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd31', name: 'Torre Diabólica', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd32', name: 'Torre Diabólica (Parte 2)', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd33', name: 'Keldrasil Sagrado', alzCost: 2000000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd34', name: 'C2', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd35', name: 'Cidade Abandonada', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd36', name: 'Templo Esquecido 3SS', alzCost: 3000000, ticketsPerRun: 3, gemsPerRun: 0 },
  { id: 'd37', name: 'Ilha da Miragem', alzCost: 2000000, ticketsPerRun: 3, gemsPerRun: 0 },
  { id: 'd38', name: 'Solo Flamejante', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd39', name: 'Tumba Ancestral', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd40', name: 'Desfiladeiro Congelado', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd41', name: 'Terminus Machina', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd42', name: 'Celestia', alzCost: 3000000, ticketsPerRun: 3, gemsPerRun: 0 },
];

const DEFAULT_TRACKED_KEYWORD_WORDS = ['Fatal', 'Chocante', 'Dragona', 'Anel', 'Brinco', 'Amuleto', 'Extensor', 'Nucleo', 'Set'];

function buildDefaultTrackedKeywords() {
  return DEFAULT_TRACKED_KEYWORD_WORDS.map(word => ({ word, alertEnabled: false }));
}

export const DEFAULT_ALERT_SETTINGS = {
  enabled: true,
  soundEnabled: true,
  repeatSoundWhileOpen: false,
  volume: 0.7,
  popupDurationSeconds: 5,
  groupingWindowSeconds: 30,
  noDropThresholdMinutes: 1,
  itemSilenceThresholdMinutes: 60,
  // Desligado por padrão de propósito: o watchdog (sem drop nenhum / item sumiu) só deveria
  // rodar quando o usuário está de fato usando um helper/macro — farmar manual tem pausas
  // normais (navegar menu, andar, lutar mob mais forte) que não são "helper travado".
  watchdogEnabled: false,
  // Ligados por padrão — preferência pessoal pra receber (ou não) o pop-up/som de TG e World
  // Boss; o horário em si continua só do admin (ver event-schedule.js).
  tgNotificationsEnabled: true,
  worldbossNotificationsEnabled: true,
  // Canais que entregam TG/World Boss com o navegador fechado (ver cron-check-events.php) —
  // desligados por padrão, exigem ação explícita do usuário (ativar push / vincular Telegram).
  pushEnabled: false,
  telegramChatId: null,
  // Envia o drop rastreado pro Telegram na hora que cai (só com o DropList aberto — quem detecta
  // o drop é a aba lendo o log, ver telegram-relay-drop.php). Opt-in, desligado por padrão.
  telegramDropRelayEnabled: false,
};

// Créditos de macro: item comprado no mercado (preço varia por categoria) + custo fixo de
// fabricação por cima, dá 1h de uso de macro cada, usável em qualquer DG (não é por-DG como
// tickets/gemas). Preço de mercado e quantidade comprada são inputs do dia (não persistem,
// igual rushTicketPrice/rushCardCashPrice); só o custo de fabricar por categoria é salvo.
export const CREDIT_CATEGORIES = [
  { id: 'iniciante', name: 'Iniciante' },
  { id: 'intermediario', name: 'Intermediário' },
  { id: 'avancado', name: 'Avançado' },
];

export const DEFAULT_CREDIT_CRAFT_COSTS = { iniciante: 3000000, intermediario: 0, avancado: 0 };

function buildDefaultRushCredits() {
  const credits = {};
  CREDIT_CATEGORIES.forEach(cat => (credits[cat.id] = { quantity: 0, marketPrice: 0 }));
  return credits;
}

export const AppState = {
  drops: [],
  manualDrops: [],
  isManualDropsOpen: false,
  itemPrices: {},
  editingItemPriceName: null,
  rushHistory: {},
  trackedKeywords: buildDefaultTrackedKeywords(),
  filterByTrackedKeywords: false,
  rankingItems: [],
  currentPage: 'overview',
  dateFrom: '',
  dateTo: '',
  searchQuery: '',
  compareDayA: '',
  compareDayB: '',
  compareItemFilter: '',
  liveFileHandle: null,
  liveFilePollWorker: null,
  lastReadFileSize: 0,
  pendingLineBuffer: '',
  rushCartDate: todayISODate(),
  rushTicketPrice: '',
  rushCardCashPrice: '',
  rushCart: [],
  rushCredits: buildDefaultRushCredits(),
  rushCreditCraftCosts: { ...DEFAULT_CREDIT_CRAFT_COSTS },
  dungeonList: DEFAULT_DUNGEONS.map(dg => ({ ...dg })),
  isDungeonManagerOpen: false,
  editingDungeonId: null,
  aiMessages: [],
  isAiLoading: false,
  aiApiKey: '',
  alertSettings: { ...DEFAULT_ALERT_SETTINGS },
  alertHistory: [],
  alertHistoryFilter: '',
  pendingAlertGroups: {},
  // Relógios do alerta de inatividade (watchdog) — resetados a cada (re)conexão do arquivo
  // ao vivo, ver startLiveFilePolling() em file-source.js.
  lastAnyDropAt: null,
  noDropAlertFired: false,
  lastSeenByKeyword: {},
  staleKeywordAlerted: {},
  isAdmin: false,
  isMasterAdmin: false,
  currentUsername: '',
  currentUserId: null,
  currentGuild: '',
  guilds: [],
  adminUsers: [],
  isAdminUsersLoading: false,
  leaderboardData: null,
  isLeaderboardLoading: false,
  rankingFilterItem: '',
  rankingCompareUsername: '',
  rankingPeriod: 'all',
  itemCategories: [],
  itemCategoryAssignments: {},
  adminActionLog: [],
  isAdminActionLogLoading: false,
  integrityFlags: [],
  isIntegrityFlagsLoading: false,
  wishlistItems: [],
  wishlistMatches: [],
  isWishlistMatchesLoading: false,
  eventSchedule: { tg: [], worldboss: [] },
  alertSounds: {},
  knownItemNames: [],
  telegramLinkCode: null,
  telegramBotLink: null,
};

export function resetTrackedKeywordsToDefault() {
  AppState.trackedKeywords = buildDefaultTrackedKeywords();
}
