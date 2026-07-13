import { AppState } from './state/app-state.js';
import { renderOverviewPage } from './pages/overview-page.js';
import { renderPricingPage } from './pages/pricing-page.js';
import { renderRushPage } from './pages/rush-page.js';
import { renderAlertsPage } from './pages/alerts-page.js';
import { renderReportPage } from './pages/report-page.js';
import { renderAdminPage } from './pages/admin-page.js';
import { renderLeaderboardPage } from './pages/leaderboard-page.js';
import { renderDropChart, destroyDropChart, renderCompareChart, destroyCompareChart, renderPriceChart, destroyPriceChart } from './features/drop-chart.js';
import { renderSalesPage } from './pages/sales-page.js';
import { updateCartPreview } from './features/rush-cart.js';
import { loadLeaderboardData } from './features/leaderboard.js';
import { loadUsers } from './features/admin.js';
import { loadAdminActionLog, loadIntegrityFlags } from './features/admin-log.js';
import { loadWishlistMatches, loadWishlistOffers, loadWishlistSentOffers } from './features/wishlist.js';
import { renderWishlistPage } from './pages/wishlist-page.js';
import { renderSessionsPage } from './pages/sessions-page.js';
import { loadGuildPanelData } from './features/guild-panel.js';
import { renderLeaderPage } from './pages/leader-page.js';
import { renderQuickPage } from './pages/quick-page.js';
import { renderTutorialPage } from './pages/tutorial-page.js';
import { renderLivePage } from './pages/live-page.js';
import { loadLiveDrops } from './features/live-drops.js';

export function navigateTo(page) {
  AppState.currentPage = page;
  // Fecha a gaveta lateral no celular ao escolher uma página (no desktop não tem efeito).
  document.getElementById('appWrap')?.classList.remove('sb-open');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('on'));
  const navButton = document.getElementById('nb-' + page);
  if (navButton) navButton.classList.add('on');

  // Ranking e Admin dependem de dado cross-usuário que não vem do loadPersistedState()
  // normal — essas funções já cuidam do próprio renderPage() (estado de carregando + dado
  // pronto), então não precisam do renderPage() genérico abaixo.
  if (page === 'ranking') loadLeaderboardData();
  else if (page === 'admin') {
    loadUsers();
    // Log de atividade e flags de integridade são só do admin mestre (endpoints master-only).
    if (AppState.isMasterAdmin) {
      loadAdminActionLog();
      loadIntegrityFlags();
    }
  } else if (page === 'wishlist') { loadWishlistMatches(); loadWishlistOffers(); loadWishlistSentOffers(); }
  else if (page === 'lider') loadGuildPanelData();
  // Renderiza já com o buffer que tiver e dispara uma busca imediata (não espera o tick de 10s).
  else if (page === 'live') { renderPage(); loadLiveDrops(); }
  else renderPage();
}

export function renderPage() {
  const main = document.getElementById('main');
  destroyDropChart();
  destroyCompareChart();
  destroyPriceChart();

  if (AppState.currentPage === 'overview') main.innerHTML = renderOverviewPage();
  else if (AppState.currentPage === 'calculo') main.innerHTML = renderPricingPage();
  else if (AppState.currentPage === 'rush') main.innerHTML = renderRushPage();
  else if (AppState.currentPage === 'alertas') main.innerHTML = renderAlertsPage();
  else if (AppState.currentPage === 'admin') main.innerHTML = renderAdminPage();
  else if (AppState.currentPage === 'ranking') main.innerHTML = renderLeaderboardPage();
  else if (AppState.currentPage === 'wishlist') main.innerHTML = renderWishlistPage();
  else if (AppState.currentPage === 'sessoes') main.innerHTML = renderSessionsPage();
  else if (AppState.currentPage === 'lider') main.innerHTML = renderLeaderPage();
  else if (AppState.currentPage === 'vendas') main.innerHTML = renderSalesPage();
  else if (AppState.currentPage === 'rapido') main.innerHTML = renderQuickPage();
  else if (AppState.currentPage === 'tutorial') main.innerHTML = renderTutorialPage();
  else if (AppState.currentPage === 'live') main.innerHTML = renderLivePage();
  else main.innerHTML = renderReportPage();

  afterPageRender();
}

function afterPageRender() {
  if (AppState.currentPage === 'overview') {
    renderDropChart();
    renderCompareChart();
  }
  if (AppState.currentPage === 'rush') updateCartPreview();
  if (AppState.currentPage === 'vendas') renderPriceChart();
}
