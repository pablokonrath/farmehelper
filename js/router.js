import { AppState } from './state/app-state.js';
import { renderOverviewPage } from './pages/overview-page.js';
import { renderPricingPage } from './pages/pricing-page.js';
import { renderRushPage } from './pages/rush-page.js';
import { renderAlertsPage } from './pages/alerts-page.js';
import { renderReportPage } from './pages/report-page.js';
import { renderDropChart, destroyDropChart, renderPriceChart, destroyPriceChart } from './features/drop-chart.js';
import { renderSalesPage } from './pages/sales-page.js';
import { updateCartPreview } from './features/rush-cart.js';
import { renderSessionsPage } from './pages/sessions-page.js';
import { renderQuickPage } from './pages/quick-page.js';
import { renderTutorialPage } from './pages/tutorial-page.js';
import { renderDropSourcePage } from './pages/drop-source-page.js';

export function navigateTo(page) {
  AppState.currentPage = page;
  // Fecha a gaveta lateral no celular ao escolher uma página (no desktop não tem efeito).
  document.getElementById('appWrap')?.classList.remove('sb-open');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('on'));
  const navButton = document.getElementById('nb-' + page);
  if (navButton) navButton.classList.add('on');
  renderPage();
}

export function renderPage() {
  const main = document.getElementById('main');
  destroyDropChart();
  destroyPriceChart();

  if (AppState.currentPage === 'overview') main.innerHTML = renderOverviewPage();
  else if (AppState.currentPage === 'calculo') main.innerHTML = renderPricingPage();
  else if (AppState.currentPage === 'rush') main.innerHTML = renderRushPage();
  else if (AppState.currentPage === 'alertas') main.innerHTML = renderAlertsPage();
  else if (AppState.currentPage === 'sessoes') main.innerHTML = renderSessionsPage();
  else if (AppState.currentPage === 'vendas') main.innerHTML = renderSalesPage();
  else if (AppState.currentPage === 'rapido') main.innerHTML = renderQuickPage();
  else if (AppState.currentPage === 'tutorial') main.innerHTML = renderTutorialPage();
  else if (AppState.currentPage === 'origem') main.innerHTML = renderDropSourcePage();
  else main.innerHTML = renderReportPage();

  afterPageRender();
}

function afterPageRender() {
  if (AppState.currentPage === 'overview') renderDropChart();
  if (AppState.currentPage === 'rush') updateCartPreview();
  if (AppState.currentPage === 'vendas') renderPriceChart();
}
