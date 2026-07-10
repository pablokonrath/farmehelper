import { AppState } from './state/app-state.js';
import { loadPersistedState } from './state/persistence.js';
import { updateBalanceSidebar } from './features/drops.js';
import { renderPage, navigateTo } from './router.js';
import { initFileInputListener, connectLiveFile, resumeLiveFileConnection, reconnectLiveFile } from './features/file-source.js';
import { checkSession, submitLogin, logout } from './features/auth.js';
import {
  createUser,
  addRankingItem,
  removeRankingItem,
  toggleRankingItemFeatured,
  addItemCategory,
  removeItemCategory,
  setItemCategoryAssignment,
  toggleUserAdmin,
  setUserGuild,
  addGuild,
  removeGuild,
  deleteUser,
  prefillEditLoginUsername,
  saveEditedLogin,
} from './features/admin.js';
import { setRankingFilterItem, setRankingCompareUsername, setRankingPeriod } from './features/leaderboard.js';

import { setSearchQuery, setDateFrom, setDateTo, toggleManualDropsManager } from './pages/overview-page.js';
import { toggleFilterByKeywords } from './pages/pricing-page.js';
import { addManualDrop, deleteManualDropBatch } from './features/manual-drops.js';
import { setCompareDayA, setCompareDayB, setCompareItemFilter } from './features/day-compare.js';
import {
  setRushCartDate,
  setRushTicketPrice,
  setRushCardCashPrice,
  toggleDungeonManager,
  startEditingDungeon,
  cancelEditingDungeon,
} from './pages/rush-page.js';

import { addItemPrice, editItemPrice, deleteItemPrice } from './features/pricing.js';
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
  setRushCreditCraftCost,
} from './features/rush-cart.js';
import { exportDropsToCSV } from './features/export.js';
import { maskDateInputBR, parseDateInputBR } from './utils/formatting.js';

// As páginas são geradas via template string com atributos onclick/onchange/oninput
// (em vez de addEventListener), então cada função referenciada neles precisa existir
// no escopo global — módulos ES não expõem isso automaticamente.
Object.assign(window, {
  navigateTo,
  connectLiveFile,
  reconnectLiveFile,
  setSearchQuery,
  setDateFrom,
  setDateTo,
  toggleManualDropsManager,
  addManualDrop,
  deleteManualDropBatch,
  setCompareDayA,
  setCompareDayB,
  setCompareItemFilter,
  toggleFilterByKeywords,
  addItemPrice,
  editItemPrice,
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
  saveRushForDay,
  deleteRushForDay,
  editSavedRush,
  duplicateSavedRush,
  setRushCreditQuantity,
  setRushCreditMarketPrice,
  setRushCreditCraftCost,
  exportDropsToCSV,
  maskDateInputBR,
  parseDateInputBR,
  submitLogin,
  logout,
  createUser,
  addRankingItem,
  removeRankingItem,
  toggleRankingItemFeatured,
  addItemCategory,
  removeItemCategory,
  setItemCategoryAssignment,
  setRankingFilterItem,
  setRankingCompareUsername,
  setRankingPeriod,
  toggleUserAdmin,
  setUserGuild,
  addGuild,
  removeGuild,
  deleteUser,
  prefillEditLoginUsername,
  saveEditedLogin,
});

// Com o backend por trás, o app inteiro fica atrás de login — verifica a sessão antes de
// montar qualquer coisa. Sem sessão válida, só a tela de login é mostrada.
const authenticated = await checkSession();
if (!authenticated) {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginUsername')?.focus();
} else {
  document.getElementById('appWrap').style.removeProperty('display');
  if (AppState.isAdmin) document.getElementById('nb-admin').style.removeProperty('display');
  await loadPersistedState();
  updateBalanceSidebar();
  initFileInputListener();
  renderPage();
  resumeLiveFileConnection();

  // Navegadores só liberam áudio depois de um gesto do usuário na página — destrava o
  // AudioContext do alerta sonoro no primeiro clique, em vez de esperar o primeiro alerta.
  document.addEventListener('click', unlockAlertAudio, { once: true });
}
