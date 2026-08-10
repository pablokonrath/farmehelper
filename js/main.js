import { AppState } from './state/app-state.js';
import { loadPersistedState } from './state/persistence.js';
import { updateBalanceSidebar } from './features/drops.js';
import { renderPage, navigateTo } from './router.js';
import { initFileInputListener, connectLiveFile, resumeLiveFileConnection, reconnectLiveFile } from './features/file-source.js';
import { checkSession, submitLogin, submitRegister, setAuthMode, logout } from './features/auth.js';
import { startDropCounterTicker } from './features/drop-counter.js';
import { setDailyGoal, initFarmGoalBaseline } from './features/farm-goal.js';
import { startDgSession, endDgSession, startDgSessionTicker, setActiveSessionRuns, setSessionRuns, setSessionDungeon, deleteSession, toggleSessionItems, setResetConfig, toggleForgottenSessionRecovery, recoverForgottenSession } from './features/dg-session.js';
import { setSessionsHistoryDate } from './pages/sessions-page.js';
import { addEventTime, removeEventTime, startEventScheduleChecks } from './features/event-schedule.js';
import { uploadAlertSound, removeAlertSound, setAlertSoundVolume, testAlertSound } from './features/alert-sounds.js';
import { generateTelegramLinkCode, unlinkTelegram } from './features/telegram.js';
import { addSale, deleteSale, setPriceHistoryItem } from './features/sales.js';
import { addSalesGoal, deleteSalesGoal } from './features/sales-goals.js';
import { openQuickMode, quickPick, quickBackToMenu, quickBack, quickNext, quickRushAdd, quickRushRemove, openGuidedRush } from './features/quick-mode.js';
import { toggleInfoBox, toggleCard } from './features/ui-toggles.js';
import { toggleAutoSessionStart } from './features/session-autostart.js';
import { setEventEnabled, setEventItemName, setEventSince, setEventMultiplier } from './features/event-tracker.js';
import {
  toggleCategoryManager,
  addItemCategory,
  removeItemCategory,
  setItemCategoryAssignment,
} from './features/admin.js';

import { setDateFrom, setDateTo, toggleManualDropsManager, setTrendPeriod } from './pages/overview-page.js';
import { toggleFilterByKeywords } from './pages/pricing-page.js';
import { addManualDrop, deleteManualDropBatch } from './features/manual-drops.js';
import { searchDropSource, setDropSourceTargetQty } from './features/drop-source.js';
import { addItemDungeonSourceItem, removeItemDungeonSourceItem, toggleItemDungeonSourceDg, setRarityMaxPercent, dismissRarity, restoreRarity } from './features/item-dungeon-sources.js';
import {
  setRushCartDate,
  setRushTicketPrice,
  setRushCardCashPrice,
  toggleDungeonManager,
  startEditingDungeon,
  cancelEditingDungeon,
} from './pages/rush-page.js';

import { addItemPrice, startEditingItemPrice, cancelEditingItemPrice, saveItemPriceEdit, deleteItemPrice } from './features/pricing.js';
import { addTrackedKeyword, removeTrackedKeyword, resetTrackedKeywords, toggleKeywordAlert } from './features/keywords.js';
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
} from './features/rush-cart.js';
import { createRushRouteFromCart, applyRushRoute, startEditingRushRoute, cancelEditingRushRoute, renameRushRoute, deleteRushRoute, setTimeAvailableHours, applySuggestedRoute } from './features/rush-routes.js';
import { exportDropsToCSV } from './features/export.js';
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
  toggleManualDropsManager,
  setTrendPeriod,
  setEventEnabled,
  setEventItemName,
  setEventSince,
  setEventMultiplier,
  addManualDrop,
  deleteManualDropBatch,
  searchDropSource,
  setDropSourceTargetQty,
  addItemDungeonSourceItem,
  removeItemDungeonSourceItem,
  toggleItemDungeonSourceDg,
  setRarityMaxPercent,
  dismissRarity,
  restoreRarity,
  toggleFilterByKeywords,
  addItemPrice,
  startEditingItemPrice,
  cancelEditingItemPrice,
  saveItemPriceEdit,
  deleteItemPrice,
  addTrackedKeyword,
  removeTrackedKeyword,
  resetTrackedKeywords,
  toggleKeywordAlert,
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
  toggleDungeonManager,
  startEditingDungeon,
  cancelEditingDungeon,
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
  setRushCreditQuantity,
  setRushCreditMarketPrice,
  setRushCreditItemName,
  exportDropsToCSV,
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
  generateTelegramLinkCode,
  unlinkTelegram,
  setTelegramDropRelayEnabled,
  setTelegramWatchdogRelayEnabled,
  setDailyGoal,
  startDgSession,
  endDgSession,
  setActiveSessionRuns,
  setSessionRuns,
  setSessionDungeon,
  deleteSession,
  toggleSessionItems,
  setResetConfig,
  toggleForgottenSessionRecovery,
  recoverForgottenSession,
  setSessionsHistoryDate,
  addSale,
  deleteSale,
  setPriceHistoryItem,
  addSalesGoal,
  deleteSalesGoal,
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
