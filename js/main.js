import { AppState } from './state/app-state.js';
import { loadPersistedState } from './state/persistence.js';
import { updateBalanceSidebar } from './features/drops.js';
import { renderPage, navigateTo } from './router.js';
import { initFileInputListener, connectLiveFile, resumeLiveFileConnection, reconnectLiveFile } from './features/file-source.js';
import { checkSession, submitLogin, logout } from './features/auth.js';
import { startPresenceHeartbeat, toggleOnlinePopover } from './features/presence.js';
import { startDropCounterTicker } from './features/drop-counter.js';
import { startLiveDropPolling } from './features/live-drops.js';
import { setDailyGoal, initFarmGoalBaseline } from './features/farm-goal.js';
import { startDgSession, endDgSession, startDgSessionTicker, setActiveSessionRuns, setSessionRuns, toggleSessionItems, setResetConfig } from './features/dg-session.js';
import { setSessionsHistoryDate } from './pages/sessions-page.js';
import { addEventTime, removeEventTime, startEventScheduleChecks } from './features/event-schedule.js';
import { uploadAlertSound, removeAlertSound, setAlertSoundVolume, testAlertSound } from './features/alert-sounds.js';
import { enablePushNotifications, disablePushNotifications } from './features/push.js';
import { generateTelegramLinkCode, unlinkTelegram } from './features/telegram.js';
import { addSale, deleteSale, setPriceHistoryItem } from './features/sales.js';
import { openQuickMode, quickPick, quickBackToMenu, quickBack, quickNext, quickRushAdd, quickRushRemove, openGuidedRush } from './features/quick-mode.js';
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
import { setGuildPanelPeriod, setGuildPanelGuild } from './features/guild-panel.js';

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

import { addItemPrice, startEditingItemPrice, cancelEditingItemPrice, saveItemPriceEdit, deleteItemPrice } from './features/pricing.js';
import { addTrackedKeyword, removeTrackedKeyword, resetTrackedKeywords, toggleKeywordAlert } from './features/keywords.js';
import { addWishlistItem, removeWishlistItem, markAllWishlistMatchesSeen, clearWishlistMatches, startOffer, cancelOffer, sendWishlistOffer, markOffersSeen, clearOffers, respondToOffer, markSentOffersSeen } from './features/wishlist.js';
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
  setTelegramWishlistRelayEnabled,
  setTelegramWatchdogRelayEnabled,
  showInfoToast,
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
import { maskDateInputBR, parseDateInputBR, maskAlzInputLive, maskTimeInputBR } from './utils/formatting.js';

// Abre/fecha a gaveta lateral no celular (o botão hambúrguer, ver index.html/styles.css).
function toggleSidebar() {
  document.getElementById('appWrap')?.classList.toggle('sb-open');
}

// Copia o nick de um jogador (ex: quem dropou seu desejo no correio) pra você sussurrar no chat
// do jogo, sem redigitar. Mostra um "copiado" rapidinho.
function copyNick(nick) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(nick).then(() => showInfoToast('Nick copiado: ' + nick)).catch(() => {});
  }
}

// As páginas são geradas via template string com atributos onclick/onchange/oninput
// (em vez de addEventListener), então cada função referenciada neles precisa existir
// no escopo global — módulos ES não expõem isso automaticamente.
Object.assign(window, {
  navigateTo,
  toggleSidebar,
  copyNick,
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
  startEditingItemPrice,
  cancelEditingItemPrice,
  saveItemPriceEdit,
  deleteItemPrice,
  addTrackedKeyword,
  removeTrackedKeyword,
  resetTrackedKeywords,
  toggleKeywordAlert,
  addWishlistItem,
  removeWishlistItem,
  markAllWishlistMatchesSeen,
  clearWishlistMatches,
  startOffer,
  cancelOffer,
  sendWishlistOffer,
  markOffersSeen,
  clearOffers,
  respondToOffer,
  markSentOffersSeen,
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
  maskAlzInputLive,
  maskTimeInputBR,
  addEventTime,
  removeEventTime,
  uploadAlertSound,
  removeAlertSound,
  setAlertSoundVolume,
  testAlertSound,
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
  toggleOnlinePopover,
  enablePushNotifications,
  disablePushNotifications,
  generateTelegramLinkCode,
  unlinkTelegram,
  setTelegramDropRelayEnabled,
  setTelegramWishlistRelayEnabled,
  setTelegramWatchdogRelayEnabled,
  setDailyGoal,
  startDgSession,
  endDgSession,
  setActiveSessionRuns,
  setSessionRuns,
  toggleSessionItems,
  setResetConfig,
  setSessionsHistoryDate,
  setGuildPanelPeriod,
  setGuildPanelGuild,
  addSale,
  deleteSale,
  setPriceHistoryItem,
  openQuickMode,
  quickPick,
  quickBackToMenu,
  quickBack,
  quickNext,
  quickRushAdd,
  quickRushRemove,
  openGuidedRush,
});

// Registra o service worker (o MESMO arquivo/escopo que o OneSignal usa) já no carregamento, pra o
// app poder ser INSTALADO como PWA de verdade (janela própria / WebAPK) mesmo antes de ligar o push.
// Sem isso o navegador só cria um atalho que abre dentro dele. Quando o push é ativado, o OneSignal
// reaproveita esta mesma registração (mesmo script, escopo '/'), então não há conflito.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('OneSignalSDKWorker.js').catch(() => {});
}

// Com o backend por trás, o app inteiro fica atrás de login — verifica a sessão antes de
// montar qualquer coisa. Sem sessão válida, só a tela de login é mostrada.
const authenticated = await checkSession();
if (!authenticated) {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginUsername')?.focus();
} else {
  document.getElementById('appWrap').style.removeProperty('display');
  if (AppState.isAdmin) {
    document.getElementById('nb-admin').style.removeProperty('display');
    document.getElementById('nb-lider').style.removeProperty('display');
  }
  await loadPersistedState();
  updateBalanceSidebar();
  initFarmGoalBaseline();
  initFileInputListener();
  // No celular a Visão geral fica vazia (depende do log local, que só existe no PC) — abre direto
  // no Ao vivo, que já funciona sem log. 720px tem que bater com o @media que esconde a Visão
  // geral do menu nesse tamanho de tela (ver styles.css).
  if (window.innerWidth <= 720) navigateTo('live');
  else renderPage();
  resumeLiveFileConnection();
  startPresenceHeartbeat();
  startEventScheduleChecks();
  startDropCounterTicker();
  startDgSessionTicker();
  startLiveDropPolling();

  // Navegadores só liberam áudio depois de um gesto do usuário na página — destrava o
  // AudioContext do alerta sonoro no primeiro clique, em vez de esperar o primeiro alerta.
  document.addEventListener('click', unlockAlertAudio, { once: true });
}
