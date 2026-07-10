import { AppState } from './state/app-state.js';
import { renderOverviewPage } from './pages/overview-page.js';
import { renderPricingPage } from './pages/pricing-page.js';
import { renderRushPage } from './pages/rush-page.js';
import { renderAlertsPage } from './pages/alerts-page.js';
import { renderReportPage } from './pages/report-page.js';
import { renderAdminPage } from './pages/admin-page.js';
import { renderLeaderboardPage } from './pages/leaderboard-page.js';
import { renderDropChart, destroyDropChart, renderCompareChart, destroyCompareChart } from './features/drop-chart.js';
import { updateCartPreview } from './features/rush-cart.js';
import { loadLeaderboardData } from './features/leaderboard.js';
import { loadUsers } from './features/admin.js';

export function navigateTo(page) {
  AppState.currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('on'));
  const navButton = document.getElementById('nb-' + page);
  if (navButton) navButton.classList.add('on');

  // Ranking e Admin dependem de dado cross-usuário que não vem do loadPersistedState()
  // normal — essas duas funções já cuidam do próprio renderPage() (estado de carregando +
  // dado pronto), então não precisam do renderPage() genérico abaixo.
  if (page === 'ranking') loadLeaderboardData();
  else if (page === 'admin') loadUsers();
  else renderPage();
}

export function renderPage() {
  const main = document.getElementById('main');
  destroyDropChart();
  destroyCompareChart();

  if (AppState.currentPage === 'overview') main.innerHTML = renderOverviewPage();
  else if (AppState.currentPage === 'calculo') main.innerHTML = renderPricingPage();
  else if (AppState.currentPage === 'rush') main.innerHTML = renderRushPage();
  else if (AppState.currentPage === 'alertas') main.innerHTML = renderAlertsPage();
  else if (AppState.currentPage === 'admin') main.innerHTML = renderAdminPage();
  else if (AppState.currentPage === 'ranking') main.innerHTML = renderLeaderboardPage();
  else main.innerHTML = renderReportPage();

  afterPageRender();
}

function afterPageRender() {
  if (AppState.currentPage === 'overview') {
    renderDropChart();
    renderCompareChart();
  }
  if (AppState.currentPage === 'rush') updateCartPreview();
}
