import { AppState } from '../state/app-state.js';
import { stripEnhancementSuffix, normalizeForSearch, todayISODate } from '../utils/parsing.js';
import { formatNumber, formatAlzGamer, getAlzTierColor } from '../utils/formatting.js';

export function getItemPrice(itemName) {
  return AppState.itemPrices[itemName] ?? AppState.itemPrices[stripEnhancementSuffix(itemName)] ?? 0;
}

export function getItemCategory(itemName) {
  return AppState.itemCategoryAssignments[itemName] ?? AppState.itemCategoryAssignments[stripEnhancementSuffix(itemName)] ?? null;
}

// Peças de equipamento genéricas (armadura/arma básica por classe) — caem aos montes em toda
// DG, não têm valor de venda e só incham "o que caiu" em cada sessão. Excluídas de vez, não
// precisam aparecer em lugar nenhum do app (pedido explícito do jogador).
const EXCLUDED_ITEM_KEYWORDS = [
  'greva', 'manopla', 'armadura', 'elmo', 'punho', 'luva', 'quimono', 'traje', 'coturno',
  'sapatilha', 'mascara', 'visor', 'montante', 'espada', 'katana', 'orb', 'cristal', 'disco',
  'chakram',
].map(kw => normalizeForSearch(kw));

export function isExcludedGearItem(name) {
  const normalized = normalizeForSearch(name);
  return EXCLUDED_ITEM_KEYWORDS.some(kw => normalized.includes(kw));
}

// Drops vêm do log do jogo (AppState.drops, recarregado por inteiro a cada upload/conexão
// de arquivo) + itens adicionados manualmente (AppState.manualDrops, persistidos à parte
// porque um novo upload de arquivo substitui AppState.drops inteiro). Ponto único de filtro
// de equipamento genérico — filtrar aqui já cobre todo mundo que consome getAllDrops()
// (sessões de DG, Onde dropa, Cálculo de farme, Vendas, Visão geral).
export function getAllDrops() {
  return [...AppState.drops, ...AppState.manualDrops].filter(d => !isExcludedGearItem(d.name));
}

// Aplica o filtro "Filtrar apenas itens rastreados" (Cálculo de farme) quando ativo — usado
// tanto pela lista principal de drops quanto pelo comparador de dias, pra manter os dois
// consistentes com a mesma lista de palavras rastreadas.
export function applyTrackedKeywordFilter(drops) {
  if (!AppState.filterByTrackedKeywords || !AppState.trackedKeywords.length) return drops;
  const keywords = AppState.trackedKeywords.map(kw => normalizeForSearch(kw.word));
  return drops.filter(d => keywords.some(k => normalizeForSearch(d.name).includes(k)));
}

export function getFilteredDrops() {
  let drops = getAllDrops();
  if (AppState.dateFrom) drops = drops.filter(d => d.date >= AppState.dateFrom);
  if (AppState.dateTo) drops = drops.filter(d => d.date <= AppState.dateTo);
  return applyTrackedKeywordFilter(drops);
}

export function summarizeDropsByItem(drops) {
  const itemsByName = {};
  drops.forEach(drop => {
    const key = stripEnhancementSuffix(drop.name);
    const price = getItemPrice(drop.name);
    if (!itemsByName[key]) itemsByName[key] = { name: key, qty: 0, price, total: 0 };
    itemsByName[key].qty++;
    itemsByName[key].total += price;
  });
  return Object.values(itemsByName).sort((a, b) => b.total - a.total);
}

// Valor total farmado HOJE (drops do log + manuais), a mesma base do "Total de farme" do
// sidebar — usada também pela meta de farme (farm-goal.js) pra medir o progresso do dia.
export function getTodayFarmedAlz() {
  const today = todayISODate();
  return getAllDrops()
    .filter(drop => drop.date === today)
    .reduce((sum, drop) => sum + getItemPrice(drop.name), 0);
}

// Rendimento (Alz/hora) da janela de farme de hoje, calculado a partir dos horários reais dos
// drops do LOG (não os manuais, que entram todos como 00:00 e distorceriam a janela). Retorna
// null quando não há base suficiente (menos de 2 drops ou janela menor que 1 min).
export function getTodayFarmRate() {
  const today = todayISODate();
  const logDrops = AppState.drops.filter(d => d.date === today && d.timestamp && !isExcludedGearItem(d.name));
  if (logDrops.length < 2) return null;
  const times = logDrops.map(d => d.timestamp.getTime());
  const activeMs = Math.max(...times) - Math.min(...times);
  if (activeMs < 60000) return null;
  const totalAlz = logDrops.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  return { alzPerHour: totalAlz / (activeMs / 3600000), activeMs };
}

// O sidebar mostra só o balanço de hoje, não o histórico inteiro — reflete o que o jogador
// farmou/gastou na sessão do dia, que é o número que importa pra decidir se compensa continuar.
export function updateBalanceSidebar() {
  const today = todayISODate();
  const totalFarmed = getTodayFarmedAlz();
  const totalRushSpent = AppState.rushHistory[today]?.total || 0;
  const net = totalFarmed - totalRushSpent;

  const farmedEl = document.getElementById('bF');
  const netEl = document.getElementById('bL');
  const rushEl = document.getElementById('bR');

  if (farmedEl) {
    farmedEl.textContent = formatAlzGamer(totalFarmed);
    farmedEl.title = formatNumber(totalFarmed) + ' Alz';
    farmedEl.style.color = getAlzTierColor(totalFarmed);
  }
  if (rushEl) {
    rushEl.textContent = formatAlzGamer(totalRushSpent);
    rushEl.title = formatNumber(totalRushSpent) + ' Alz';
  }
  if (netEl) {
    netEl.textContent = formatAlzGamer(net);
    netEl.title = formatNumber(net) + ' Alz';
    netEl.style.color = getAlzTierColor(net);
  }
}
