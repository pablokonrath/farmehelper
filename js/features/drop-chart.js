import { getFilteredDrops, getItemPrice } from './drops.js';
import { buildDayComparison } from './day-compare.js';
import { formatAlzGamer, formatDateBR, getChartBarColor } from '../utils/formatting.js';

let dropChartInstance = null;
let compareChartInstance = null;

export function destroyDropChart() {
  if (dropChartInstance) {
    dropChartInstance.destroy();
    dropChartInstance = null;
  }
}

export function destroyCompareChart() {
  if (compareChartInstance) {
    compareChartInstance.destroy();
    compareChartInstance = null;
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

export function renderCompareChart() {
  const canvas = document.getElementById('cc');
  if (!canvas) return;

  const comparison = buildDayComparison();
  const data = [comparison.totalA, comparison.totalB];
  const labels = [comparison.dayA ? formatDateBR(comparison.dayA) : '—', comparison.dayB ? formatDateBR(comparison.dayB) : '—'];

  compareChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: comparison.itemFilter ? 'Valor farmado de "' + comparison.itemFilter + '" (Alz)' : 'Farme (Alz)',
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
        x: { grid: { display: false }, ticks: { color: '#9aa5c9', font: { size: 12, family: "'Chakra Petch', monospace" } } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9aa5c9', font: { size: 11, family: "'Chakra Petch', monospace" }, callback: v => formatAlzGamer(v) } },
      },
    },
  });
}
