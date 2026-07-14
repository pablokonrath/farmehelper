import { AppState } from '../state/app-state.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { renderPage } from '../router.js';

export function setDropSourceQuery(value) {
  AppState.dropSourceQuery = value;
  renderPage();
}

// Busca só quando o jogador confirma (Enter ou botão "Buscar"), não a cada letra digitada —
// com poucas letras o substring bate em item demais e a lista de DGs fica ruim de ler.
export function searchDropSource() {
  const input = document.getElementById('dsQuery');
  if (input) setDropSourceQuery(input.value);
}

// Nomes de item já vistos em alguma sessão de DG encerrada — sugestão pro campo de busca, só com
// itens que de fato têm chance de dar resultado (mesma ideia do "o que você já dropou" usado em
// Vendas/Cálculo de farme).
export function getKnownSessionItemNames() {
  const names = new Set();
  AppState.dgSessions.forEach(s => Object.keys(s.items || {}).forEach(name => names.add(name)));
  return [...names].sort();
}

// Cruza o item buscado com o histórico de sessões de DG já encerradas: em quais DGs ele já caiu,
// quantas vezes, quanto no total, e a última vez visto. Usa dgSessions (já sincronizado do
// servidor), não o log bruto — funciona em qualquer aparelho da conta, igual Sessões de farme.
export function findDropSources(query) {
  if (!query) return [];
  const normalizedQuery = normalizeForSearch(query);
  const byDg = {};
  AppState.dgSessions.forEach(s => {
    Object.entries(s.items || {}).forEach(([name, qty]) => {
      if (!normalizeForSearch(name).includes(normalizedQuery)) return;
      const agg = byDg[s.dungeonName] || (byDg[s.dungeonName] = { dungeonName: s.dungeonName, sessions: 0, qty: 0, lastDate: '' });
      agg.sessions++;
      agg.qty += qty;
      if (s.date > agg.lastDate) agg.lastDate = s.date;
    });
  });
  return Object.values(byDg).sort((a, b) => b.qty - a.qty);
}
