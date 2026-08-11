import { AppState } from '../state/app-state.js';
import { stripEnhancementSuffix, normalizeForSearch, todayISODate } from '../utils/parsing.js';
import { formatNumber, formatAlzGamer, getAlzTierColor } from '../utils/formatting.js';

export function getItemPrice(itemName) {
  return AppState.itemPrices[itemName] ?? AppState.itemPrices[stripEnhancementSuffix(itemName)] ?? 0;
}

// Diferente de getItemPrice > 0: um item cadastrado como 0 de propósito (lixo que ainda cai, mas
// não vale nada) TEM preço registrado — só vale 0. getItemPrice sozinho não distingue "decidi que
// é 0" de "nunca decidi nada" (os dois retornam 0), o que fazia o aviso de "itens sem preço" (ver
// pricing-page.js) cobrar pra sempre um item que o jogador já resolveu.
export function hasRegisteredPrice(itemName) {
  return AppState.itemPrices[itemName] !== undefined || AppState.itemPrices[stripEnhancementSuffix(itemName)] !== undefined;
}

export function getItemCategory(itemName) {
  return AppState.itemCategoryAssignments[itemName] ?? AppState.itemCategoryAssignments[stripEnhancementSuffix(itemName)] ?? null;
}

// Itens cujo valor é tabelado pelo próprio jogo (ex: joia trocável em NPC por preço fixo), não
// pelo mercado entre jogadores — diferente de todo resto do itemPrices, que é estimativa própria
// de cada um. Curado à mão (não tem como derivar isso do nome sozinho) — usado só pra SILENCIAR
// o aviso de "preço desatualizado" nesses itens (ver daysSincePriceUpdate em sales.js): o preço
// nunca muda, então "sem revisar há muito tempo" não é sinal de nada errado.
const FIXED_PRICE_ITEMS = new Set(['Joia Enfraquecida'].map(normalizeForSearch));

export function isFixedPriceItem(itemName) {
  return FIXED_PRICE_ITEMS.has(normalizeForSearch(stripEnhancementSuffix(itemName)));
}

// Peças de equipamento genéricas (armadura/arma básica por classe) — caem aos montes em toda
// DG, não têm valor de venda e só incham "o que caiu" em cada sessão. Excluídas de vez, não
// precisam aparecer em lugar nenhum do app (pedido explícito do jogador).
const EXCLUDED_ITEM_KEYWORDS = [
  'greva', 'manopla', 'armadura', 'elmo', 'punho', 'luva', 'quimono', 'traje', 'coturno',
  'sapatilha', 'sapato', 'mascara', 'visor', 'montante', 'espada', 'katana', 'orb', 'cristal',
  'disco', 'chakram',
].map(kw => normalizeForSearch(kw));

// Cache nome -> é equipamento genérico? O log tem dezenas de milhares de drops mas pouquíssimos
// nomes DISTINTOS (o mesmo item cai centenas de vezes), e essa checagem roda por drop em toda
// varredura (getAllDrops é chamado ~5x por render da Visão geral, que re-renderiza a cada lote
// de drops ao vivo). Sem cache, a normalização Unicode do mesmo nome era refeita milhares de
// vezes — medido: 15x mais lento num log de 96 mil drops.
const excludedGearCache = new Map();

export function isExcludedGearItem(name) {
  let cached = excludedGearCache.get(name);
  if (cached === undefined) {
    const normalized = normalizeForSearch(name);
    cached = EXCLUDED_ITEM_KEYWORDS.some(kw => normalized.includes(kw));
    excludedGearCache.set(name, cached);
  }
  return cached;
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
// Predicado por NOME (não pelo objeto de drop) — o histórico agregado (drop-history.js) guarda
// só nome+quantidade, então precisa do mesmo critério sem ter um drop inteiro em mãos.
export function matchesTrackedKeywordFilter(name) {
  if (!AppState.filterByTrackedKeywords || !AppState.trackedKeywords.length) return true;
  const normalized = normalizeForSearch(name);
  return AppState.trackedKeywords.some(kw => normalized.includes(normalizeForSearch(kw.word)));
}

export function applyTrackedKeywordFilter(drops) {
  if (!AppState.filterByTrackedKeywords || !AppState.trackedKeywords.length) return drops;
  return drops.filter(d => matchesTrackedKeywordFilter(d.name));
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
