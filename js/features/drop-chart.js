import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getItemPrice } from './drops.js';
import { formatAlzGamer, formatDateBR, getChartBarColor } from '../utils/formatting.js';

let dropChartInstance = null;
let priceChartInstance = null;

export function destroyPriceChart() {
  if (priceChartInstance) {
    priceChartInstance.destroy();
    priceChartInstance = null;
  }
}

// Linha do preço de um item ao longo do tempo (histórico versionado, ver recordPriceChange) —
// ajuda a decidir a hora de vender. Renderizada na página de Vendas.
export function renderPriceChart() {
  const canvas = document.getElementById('ph');
  if (!canvas) return;
  const hist = AppState.priceHistory[AppState.priceHistoryItem] || [];
  if (hist.length < 1) return;

  priceChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: hist.map(h => formatDateBR(h.date)),
      datasets: [{
        label: 'Preço (Alz)',
        data: hist.map(h => h.price),
        borderColor: '#ffb020',
        backgroundColor: 'rgba(255,176,32,0.15)',
        fill: true,
        tension: 0.25,
        pointRadius: 3,
        pointBackgroundColor: '#ffb020',
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
        x: { grid: { display: false }, ticks: { color: '#9aa5c9', font: { size: 11, family: "'Chakra Petch', monospace" } } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9aa5c9', font: { size: 11, family: "'Chakra Petch', monospace" }, callback: v => formatAlzGamer(v) } },
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
        x: { grid: { display: false }, ticks: { color: '#9aa5c9', font: { size: 11, family: "'Chakra Petch', monospace" } } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9aa5c9', font: { size: 11, family: "'Chakra Petch', monospace" }, callback: v => formatAlzGamer(v) } },
      },
    },
  });
}

