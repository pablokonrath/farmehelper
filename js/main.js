import { AppState } from './state/app-state.js';
import { loadPersistedState } from './state/persistence.js';
import { updateBalanceSidebar } from './features/drops.js';
import { renderPage, navigateTo } from './router.js';
import { initFileInputListener, connectLiveFile, resumeLiveFileConnection, reconnectLiveFile } from './features/file-source.js';
import { checkSession, submitLogin, submitRegister, setAuthMode, logout } from './features/auth.js';
import { startDropCounterTicker } from './features/drop-counter.js';
import { setDailyGoal, setWeeklyGoal, setMonthlyGoal, initFarmGoalBaseline } from './features/farm-goal.js';
import { startDgSession, endDgSession, startDgSessionTicker, setActiveSessionRuns, bumpActiveSessionRuns, setSessionRuns, setSessionDungeon, setActiveSessionDungeon, setActiveSessionRunMinutes, setSessionNote, copyDaySummary, deleteSession, restoreDeletedSession, purgeDeletedSession, toggleSessionItems, setResetConfig, toggleForgottenSessionRecovery, recoverForgottenSession, recoverDropWindow, applyUnclaimedWindow, seedDailyLimitNotified } from './features/dg-session.js';
import { setSessionsHistoryDate, fillSuggestedRunMinutes } from './pages/sessions-page.js';
import { setSalesDateFrom, setSalesDateTo } from './pages/sales-page.js';
import { addEventTime, removeEventTime, startEventScheduleChecks } from './features/event-schedule.js';
import { uploadAlertSound, removeAlertSound, setAlertSoundVolume, testAlertSound } from './features/alert-sounds.js';
import { generateTelegramLinkCode, unlinkTelegram } from './features/telegram.js';
import { addSale, deleteSale, setPriceHistoryItem, startEditingSale, cancelEditingSale, repeatLastSale, dismissUnsoldInventory, restoreUnsoldInventory, updateSalePriceHint } from './features/sales.js';
import { addSalesGoal, deleteSalesGoal, addGoalWithdrawal, removeGoalWithdrawal, setGoalDeadline, setGoalPercentage } from './features/sales-goals.js';
import { addItemGoal, deleteItemGoal } from './features/item-goals.js';
import { openQuickMode, quickPick, quickBackToMenu, quickBack, quickNext, quickRushAdd, quickRushRemove, openGuidedRush } from './features/quick-mode.js';
import { toggleInfoBox, toggleCard } from './features/ui-toggles.js';
import { runUndo } from './features/undo.js';
import { copyDaySummaryImage, downloadDaySummaryImage } from './features/day-summary-image.js';
import { toggleAutoSessionStart, setSessionIdleCloseMinutes } from './features/session-autostart.js';
import { setEventEnabled, setEventItemName, setEventSince, setEventMultiplier } from './features/event-tracker.js';
import {
  toggleCategoryManager,
  addItemCategory,
  removeItemCategory,
  setItemCategoryAssignment,
  setCategoryAssignSearchQuery,
  bulkAssignCategoryByKeyword,
  togglePersonalCategoryManager,
  addPersonalCategory,
  removePersonalCategory,
  setPersonalCategoryAssignment,
  bulkAssignPersonalCategoryByKeyword,
} from './features/admin.js';

import { setDateFrom, setDateTo, saveCurrentDateFromAsDefault, setOverviewMode, toggleManualDropsManager, setTrendPeriod, setTrendMode, setConsistencyPeriod, toggleDgComparison, toggleRarityDecisions, setDgComparisonMode, setDgComparisonPeriod } from './pages/overview-page.js';
import { toggleFilterByKeywords, setPricingSearchQuery, setPricingSort, togglePricingShowAllMissing } from './pages/pricing-page.js';
import { deleteManualDropBatch } from './features/manual-drops.js';
import { searchDropSource, setDropSourceTargetQty, setDropSourceDungeon, setDropSourceCompare, toggleDropSourceGear, toggleDropSourceGearClass, goFarmDungeon, clearPendingSessionDungeon } from './features/drop-source.js';
import { addItemDungeonSourceItem, removeItemDungeonSourceItem, toggleItemDungeonSourceDg, setRarityMaxPercent, dismissRarity, restoreRarity, confirmRarity, unconfirmRarity } from './features/item-dungeon-sources.js';
import {
  setRushCartDate,
  setRushTicketPrice,
  setRushCardCashPrice,
  setRushMonthlyBudget,
  toggleDungeonManager,
  startEditingDungeon,
  cancelEditingDungeon,
  toggleRushRouteItems,
} from './pages/rush-page.js';

import { addItemPrice, startEditingItemPrice, cancelEditingItemPrice, saveItemPriceEdit, deleteItemPrice } from './features/pricing.js';
import { addTrackedKeyword, removeTrackedKeyword, resetTrackedKeywords, toggleKeywordAlert, addSuggestedKeyword } from './features/keywords.js';
import { saveDungeonEdit, deleteDungeon, addNewDungeon, resetDungeonList } from './features/dungeon-manager.js';
import {
  requestNotificationPermission,
  testNotification,
  markAllAlertsSeen,
  clearAlertHistory,
  setAlertHistoryFilter,
  setAlertsEnabled,
  setAlertSoundEnabled,
  setAlertRepeatSound,
  setAlertVolume,
  setAlertPopupDuration,
  setAlertGroupingWindow,
  unlockAlertAudio,
  setNoDropThresholdMinutes,
  setItemSilenceThresholdMinutes,
  setWatchdogEnabled,
  setTgNotificationsEnabled,
  setWorldbossNotificationsEnabled,
  setTelegramDropRelayEnabled,
  setTelegramWatchdogRelayEnabled,
  setTelegramSessionRelayEnabled,
} from './features/alerts.js';
import {
  addDungeonToCart,
  removeDungeonFromCart,
  updateCartPreview,
  toggleResetDetailFields,
  saveRushForDay,
  deleteRushForDay,
  editSavedRush,
  duplicateSavedRush,
  setRushCreditQuantity,
  setRushCreditMarketPrice,
  setRushCreditItemName,
  clearRushCart,
  toggleCreditsManager,
  applySuggestedCreditQuantities,
  setTicketCraft,
  toggleTicketCraft,
  chargeOnlyDoneRuns,
} from './features/rush-cart.js';
import { createRushRouteFromCart, applyRushRoute, startEditingRushRoute, cancelEditingRushRoute, renameRushRoute, deleteRushRoute, setTimeAvailableHours, applySuggestedRoute, applyGeneratedRoute } from './features/rush-routes.js';
import { exportDropsToCSV, exportSalesToCSV } from './features/export.js';
import { copyAiRouteBriefing } from './features/ai-briefing.js';
import { maskDateInputBR, parseDateInputBR, maskAlzInputLive, maskTimeInputBR } from './utils/formatting.js';

// Abre/fecha a gaveta lateral no celular (o botão hambúrguer, ver index.html/styles.css).
function toggleSidebar() {
  document.getElementById('appWrap')?.classList.toggle('sb-open');
}

// As páginas são geradas via template string com atributos onclick/onchange/oninput
// (em vez de addEventListener), então cada função referenciada neles precisa existir
// no escopo global — módulos ES não expõem isso automaticamente.
Object.assign(window, {
  navigateTo,
  toggleSidebar,
  connectLiveFile,
  reconnectLiveFile,
  setDateFrom,
  setDateTo,
  saveCurrentDateFromAsDefault,
  setOverviewMode,
  toggleManualDropsManager,
  setTrendPeriod,
  setTrendMode,
  setConsistencyPeriod,
  setEventEnabled,
  setEventItemName,
  setEventSince,
  setEventMultiplier,
  deleteManualDropBatch,
  searchDropSource,
  setDropSourceTargetQty,
  setDropSourceDungeon,
  toggleDropSourceGear,
  toggleDropSourceGearClass,
  setDropSourceCompare,
  goFarmDungeon,
  clearPendingSessionDungeon,
  addItemDungeonSourceItem,
  removeItemDungeonSourceItem,
  toggleItemDungeonSourceDg,
  setRarityMaxPercent,
  dismissRarity,
  confirmRarity,
  unconfirmRarity,
  restoreRarity,
  toggleFilterByKeywords,
  setPricingSearchQuery,
  setPricingSort,
  togglePricingShowAllMissing,
  addItemPrice,
  startEditingItemPrice,
  cancelEditingItemPrice,
  saveItemPriceEdit,
  deleteItemPrice,
  addTrackedKeyword,
  removeTrackedKeyword,
  resetTrackedKeywords,
  toggleKeywordAlert,
  addSuggestedKeyword,
  requestNotificationPermission,
  testNotification,
  markAllAlertsSeen,
  clearAlertHistory,
  setAlertHistoryFilter,
  setAlertsEnabled,
  setAlertSoundEnabled,
  setAlertRepeatSound,
  setAlertVolume,
  setAlertPopupDuration,
  setAlertGroupingWindow,
  setNoDropThresholdMinutes,
  setItemSilenceThresholdMinutes,
  setWatchdogEnabled,
  setTgNotificationsEnabled,
  setWorldbossNotificationsEnabled,
  setRushCartDate,
  setRushTicketPrice,
  setRushCardCashPrice,
  setRushMonthlyBudget,
  toggleDungeonManager,
  startEditingDungeon,
  cancelEditingDungeon,
  toggleRushRouteItems,
  saveDungeonEdit,
  deleteDungeon,
  addNewDungeon,
  resetDungeonList,
  updateCartPreview,
  toggleResetDetailFields,
  addDungeonToCart,
  removeDungeonFromCart,
  clearRushCart,
  toggleCreditsManager,
  applySuggestedCreditQuantities,
  setTicketCraft,
  toggleTicketCraft,
  chargeOnlyDoneRuns,
  saveRushForDay,
  deleteRushForDay,
  editSavedRush,
  duplicateSavedRush,
  createRushRouteFromCart,
  applyRushRoute,
  startEditingRushRoute,
  cancelEditingRushRoute,
  renameRushRoute,
  deleteRushRoute,
  setTimeAvailableHours,
  applySuggestedRoute,
  applyGeneratedRoute,
  setRushCreditQuantity,
  setRushCreditMarketPrice,
  setRushCreditItemName,
  exportDropsToCSV,
  copyAiRouteBriefing,
  exportSalesToCSV,
  maskDateInputBR,
  parseDateInputBR,
  maskAlzInputLive,
  maskTimeInputBR,
  addEventTime,
  removeEventTime,
  uploadAlertSound,
  removeAlertSound,
  setAlertSoundVolume,
  testAlertSound,
  submitLogin,
  submitRegister,
  setAuthMode,
  logout,
  toggleCategoryManager,
  addItemCategory,
  removeItemCategory,
  setItemCategoryAssignment,
  setCategoryAssignSearchQuery,
  bulkAssignCategoryByKeyword,
  togglePersonalCategoryManager,
  addPersonalCategory,
  removePersonalCategory,
  setPersonalCategoryAssignment,
  bulkAssignPersonalCategoryByKeyword,
  generateTelegramLinkCode,
  unlinkTelegram,
  setTelegramDropRelayEnabled,
  setTelegramWatchdogRelayEnabled,
  setTelegramSessionRelayEnabled,
  setDailyGoal,
  setWeeklyGoal,
  setMonthlyGoal,
  startDgSession,
  endDgSession,
  setActiveSessionRuns,
  bumpActiveSessionRuns,
  setSessionRuns,
  setSessionDungeon,
  setActiveSessionRunMinutes,
  setActiveSessionDungeon,
  setSessionNote,
  copyDaySummary,
  copyDaySummaryImage,
  downloadDaySummaryImage,
  deleteSession,
  restoreDeletedSession,
  purgeDeletedSession,
  toggleSessionItems,
  setResetConfig,
  toggleForgottenSessionRecovery,
  recoverForgottenSession,
  recoverDropWindow,
  applyUnclaimedWindow,
  setSessionsHistoryDate,
  fillSuggestedRunMinutes,
  toggleDgComparison,
  toggleRarityDecisions,
  setDgComparisonMode,
  setDgComparisonPeriod,
  setSalesDateFrom,
  setSalesDateTo,
  addSale,
  deleteSale,
  startEditingSale,
  cancelEditingSale,
  repeatLastSale,
  dismissUnsoldInventory,
  restoreUnsoldInventory,
  updateSalePriceHint,
  setPriceHistoryItem,
  addSalesGoal,
  deleteSalesGoal,
  addGoalWithdrawal,
  removeGoalWithdrawal,
  setGoalDeadline,
  setGoalPercentage,
  addItemGoal,
  deleteItemGoal,
  openQuickMode,
  quickPick,
  quickBackToMenu,
  quickBack,
  quickNext,
  quickRushAdd,
  quickRushRemove,
  openGuidedRush,
  toggleInfoBox,
  toggleCard,
  toggleAutoSessionStart,
  setSessionIdleCloseMinutes,
  runUndo,
});

// Registra o service worker já no carregamento, pra o app poder ser INSTALADO como PWA de
// verdade (janela própria / WebAPK) em vez de um atalho que abre dentro do navegador.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

// Com o backend por trás, o app inteiro fica atrás de login — verifica a sessão antes de
// montar qualquer coisa. Sem sessão válida, só a tela de login é mostrada.
const authenticated = await checkSession();
if (!authenticated) {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginUsername')?.focus();
} else {
  document.getElementById('appWrap').style.removeProperty('display');
  await loadPersistedState();
  updateBalanceSidebar();
  // Marca as DGs que já estavam completas quando o app abriu, pra não remandar o aviso de
  // "20/20" a cada reload. Tem que vir depois do estado carregar e antes de qualquer ticker.
  seedDailyLimitNotified();
  initFarmGoalBaseline();
  initFileInputListener();
  renderPage();
  resumeLiveFileConnection();
  startEventScheduleChecks();
  startDropCounterTicker();
  startDgSessionTicker();

  // Navegadores só liberam áudio depois de um gesto do usuário na página — destrava o
  // AudioContext do alerta sonoro no primeiro clique, em vez de esperar o primeiro alerta.
  document.addEventListener('click', unlockAlertAudio, { once: true });
}
