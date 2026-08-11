import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getItemPrice } from './drops.js';
import { getSalePriceHistory } from './sales.js';
import { formatAlzGamer, formatDateBR, getChartBarColor } from '../utils/formatting.js';

let dropChartInstance = null;
let priceChartInstance = null;

export function destroyPriceChart() {
  if (priceChartInstance) {
    priceChartInstance.destroy();
    priceChartInstance = null;
  }
}

// Linha do preço de VENDA de um item ao longo do tempo (ver getSalePriceHistory) — o que você
// realmente vendeu por dia, não o preço cadastrado como meta. Renderizada na página de Vendas.
export function renderPriceChart() {
  const canvas = document.getElementById('ph');
  if (!canvas) return;
  const hist = getSalePriceHistory(AppState.priceHistoryItem);
  if (hist.length < 1) return;

  priceChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: hist.map(h => formatDateBR(h.date)),
      datasets: [{
        label: 'Preço (Alz)',
        data: hist.map(h => h.price),
        borderColor: '#d9a441',
        backgroundColor: 'rgba(217,164,65,0.15)',
        fill: true,
        tension: 0.25,
        pointRadius: 3,
        pointBackgroundColor: '#d9a441',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => formatAlzGamer(c.parsed.y) } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#c2ac82', font: { size: 11, family: "'Chakra Petch', monospace" } } },
        y: { grid: { color: 'rgba(240,228,200,0.06)' }, ticks: { color: '#c2ac82', font: { size: 11, family: "'Chakra Petch', monospace" }, callback: v => formatAlzGamer(v) } },
      },
    },
  });
}

export function destroyDropChart() {
  if (dropChartInstance) {
    dropChartInstance.destroy();
    dropChartInstance = null;
  }
}

let salesChartInstance = null;
export function destroySalesChart() {
  if (salesChartInstance) {
    salesChartInstance.destroy();
    salesChartInstance = null;
  }
}

// Total REALIZADO (soma do que efetivamente entrou de venda) por dia — diferente do histórico de
// preço por item acima, que é só a variação do preço unitário, não o volume/ritmo de venda.
// Respeita o filtro De/Até da página de Vendas, igual aos KPIs e à lista.
export function renderSalesChart() {
  const canvas = document.getElementById('sc');
  if (!canvas) return;

  const { salesDateFrom: from, salesDateTo: to } = AppState;
  const totalsByDate = {};
  AppState.salesLog.forEach(s => {
    if (from && s.date < from) return;
    if (to && s.date > to) return;
    totalsByDate[s.date] = (totalsByDate[s.date] || 0) + s.unitPrice * s.qty;
  });

  const labels = Object.keys(totalsByDate).sort();
  if (labels.length < 2) return;
  const data = labels.map(date => totalsByDate[date]);

  salesChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels.map(formatDateBR),
      datasets: [{
        label: 'Vendas (Alz)',
        data,
        backgroundColor: data.map(v => getChartBarColor(v, 0.35)),
        borderColor: data.map(v => getChartBarColor(v, 1)),
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => formatAlzGamer(c.parsed.y) } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#c2ac82', font: { size: 11, family: "'Chakra Petch', monospace" } } },
        y: { grid: { color: 'rgba(240,228,200,0.06)' }, ticks: { color: '#c2ac82', font: { size: 11, family: "'Chakra Petch', monospace" }, callback: v => formatAlzGamer(v) } },
      },
    },
  });
}

export function renderDropChart() {
  const canvas = document.getElementById('fc');
  if (!canvas) return;

  const drops = getFilteredDrops();
  const totalsByDate = {};
  drops.forEach(drop => {
    totalsByDate[drop.date] = (totalsByDate[drop.date] || 0) + getItemPrice(drop.name);
  });

  const labels = Object.keys(totalsByDate).sort();
  const data = labels.map(date => totalsByDate[date]);

  dropChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels.map(formatDateBR),
      datasets: [{
        label: 'Farme (Alz)',
        data,
        backgroundColor: data.map(v => getChartBarColor(v, 0.35)),
        borderColor: data.map(v => getChartBarColor(v, 1)),
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => formatAlzGamer(c.parsed.y) } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#c2ac82', font: { size: 11, family: "'Chakra Petch', monospace" } } },
        y: { grid: { color: 'rgba(240,228,200,0.06)' }, ticks: { color: '#c2ac82', font: { size: 11, family: "'Chakra Petch', monospace" }, callback: v => formatAlzGamer(v) } },
      },
    },
  });
}

