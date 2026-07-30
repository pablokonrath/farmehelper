import { AppState } from '../state/app-state.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { renderPage } from '../router.js';

export function setDropSourceQuery(value) {
  AppState.dropSourceQuery = value;
  renderPage();
}

// Calculadora "quantos runs eu preciso" — puramente client-side, não persiste (mesmo espírito
// de dropSourceQuery).
export function setDropSourceTargetQty(value) {
  AppState.dropSourceTargetQty = value;
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

// Abaixo disso, a taxa de drop calculada é rasa demais pra confiar (poucos dados) — mostra o
// número, mas com aviso de amostra pequena em vez de passar confiança que não existe.
const MIN_RUNS_FOR_CONFIDENT_RATE = 50;

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
      const agg = byDg[s.dungeonName] || (byDg[s.dungeonName] = { dungeonId: s.dungeonId, dungeonName: s.dungeonName, sessions: 0, qty: 0, lastDate: '' });
      agg.sessions++;
      agg.qty += qty;
      if (s.date > agg.lastDate) agg.lastDate = s.date;
    });
  });
  // Taxa de drop = quantidade caída ÷ runs farmadas — mas só usando sessões com "Runs feitas"
  // preenchido, dos DOIS lados da conta. Contar o drop de uma sessão sem contar as runs dela
  // (por não ter sido preenchido) infla a taxa artificialmente — foi um bug real: uma sessão
  // com drop e runs=0 somava no numerador sem nada no denominador.
  Object.values(byDg).forEach(agg => {
    const dgSessionsWithRuns = AppState.dgSessions.filter(s => s.dungeonName === agg.dungeonName && (s.runs || 0) > 0);
    const totalRuns = dgSessionsWithRuns.reduce((sum, s) => sum + s.runs, 0);
    const qtyWithRuns = dgSessionsWithRuns.reduce((sum, s) => {
      let matched = 0;
      Object.entries(s.items || {}).forEach(([name, qty]) => {
        if (normalizeForSearch(name).includes(normalizedQuery)) matched += qty;
      });
      return sum + matched;
    }, 0);
    agg.totalRuns = totalRuns;
    agg.qtyWithRuns = qtyWithRuns;
    agg.dropRate = totalRuns > 0 ? qtyWithRuns / totalRuns : null;
    agg.lowConfidence = totalRuns > 0 && totalRuns < MIN_RUNS_FOR_CONFIDENT_RATE;
    // Sinaliza quando a taxa é baseada em menos drops do que aparece na coluna "Quantidade" —
    // significa que parte do histórico ficou de fora da conta por falta de runs preenchidos.
    agg.rateExcludesSomeDrops = qtyWithRuns < agg.qty;
  });
  // Ordena pela TAXA (por run), não pela quantidade bruta — uma DG muito farmada pode acumular
  // mais unidades sem ser de fato a que mais dropa por run. DG sem taxa calculável (sem "Runs
  // feitas" preenchido) fica por último, já que não dá pra comparar.
  return Object.values(byDg).sort((a, b) => {
    if (a.dropRate == null && b.dropRate == null) return b.qty - a.qty;
    if (a.dropRate == null) return 1;
    if (b.dropRate == null) return -1;
    return b.dropRate - a.dropRate;
  });
}

// Rendimento esperado do item buscado, por ROTA salva (não por DG isolada) — soma repetições ×
// taxa de drop de cada DG da rota. Complementa findDropSources: aquela responde "qual DG dropa
// mais", esta responde "qual das minhas rotas me dá mais desse item".
export function computeRouteItemYield(query) {
  if (!query || !AppState.rushRoutes.length) return [];
  const rateByDgId = {};
  findDropSources(query).forEach(r => { if (r.dungeonId) rateByDgId[r.dungeonId] = r.dropRate; });

  return AppState.rushRoutes.map(route => {
    let expectedQty = 0;
    let missingDataCount = 0;
    route.items.forEach(it => {
      const rate = rateByDgId[it.dungeonId];
      if (rate != null) expectedQty += rate * it.repetitions;
      else missingDataCount++;
    });
    return { id: route.id, name: route.name, dgCount: route.items.length, missingDataCount, expectedQty };
  }).sort((a, b) => b.expectedQty - a.expectedQty);
}
