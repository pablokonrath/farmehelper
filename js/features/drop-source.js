import { AppState } from '../state/app-state.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { getItemPrice, isExcludedGearItem } from './drops.js';
import { dropRateRange, rateConfidence } from '../utils/stats.js';
import { renderPage, navigateTo } from '../router.js';

// Estado só de tela — não persiste de propósito: começar recolhido a cada visita é o certo,
// já que o normal é você vir aqui olhar os drops que importam.
export function toggleDropSourceGear() {
  AppState.dropSourceGearOpen = !AppState.dropSourceGearOpen;
  renderPage();
}

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

// Ferramenta na direção OPOSTA da busca acima ("o que essa DG dropa", ver findDungeonDrops) —
// mesma página, seletor próprio, não persiste.
export function setDropSourceDungeon(value) {
  AppState.dropSourceDungeonId = value;
  renderPage();
}

export function setDropSourceCompare(slot, value) {
  if (slot === 'a') AppState.dropSourceCompareA = value;
  else AppState.dropSourceCompareB = value;
  renderPage();
}

// "Ir farmar aqui": leva pra Sessões de farme com essa DG já pré-selecionada no formulário de
// iniciar sessão — não inicia nada sozinho (o jogador ainda escolhe o tempo por run e confirma),
// só poupa achar de novo, num seletor que pode ter dezenas de DGs, o que já foi achado aqui.
export function goFarmDungeon(dungeonId) {
  AppState.pendingSessionDungeonId = dungeonId;
  navigateTo('sessoes');
}

// Consome a pré-seleção acima — chamado junto do botão "Iniciar" de Sessões de farme, depois que
// ela já cumpriu seu papel (pré-marcar o seletor). Sem renderPage aqui de propósito: startDgSession
// (chamado antes, no mesmo clique) já re-renderiza a página inteira em seguida.
export function clearPendingSessionDungeon() {
  AppState.pendingSessionDungeonId = '';
}

// Núcleo estatístico compartilhado pelas duas direções da busca (item→DGs em findDropSources,
// DG→itens em findDungeonDrops): a partir de quantos drops caíram em quantos runs, devolve a taxa
// pontual + a faixa provável (95%, ver utils/stats.js) + o nível de confiança. Fatorado aqui pra
// não duplicar a mesma conta de Poisson nas duas funções.
function summarizeRate(qtyWithRuns, totalRuns) {
  return {
    dropRate: totalRuns > 0 ? qtyWithRuns / totalRuns : null,
    rateRange: dropRateRange(qtyWithRuns, totalRuns),
    confidence: rateConfidence(qtyWithRuns),
  };
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
// Alimenta a sugestão de nomes da busca. Sem o filtro de equipamento genérico, cada variação de
// sapatilha/luva entra na lista e empurra pra fora os nomes que você realmente procura. Buscar
// por eles continua funcionando se você digitar — o que muda é só o que aparece sugerido.
export function getKnownSessionItemNames() {
  const names = new Set();
  AppState.dgSessions.forEach(s => Object.keys(s.items || {}).forEach(name => {
    if (!isExcludedGearItem(name)) names.add(name);
  }));
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
    Object.assign(agg, summarizeRate(qtyWithRuns, totalRuns));
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

// Direção OPOSTA de findDropSources: em vez de "onde esse item dropa", responde "o que essa DG
// dropa" — todo item já visto nas sessões encerradas dessa DG, ordenado pelo que rende mais Alz
// esperado por run (taxa × preço cadastrado), não só pela quantidade bruta. É o mesmo histórico
// (dgSessions), só agrupado na direção contrária — útil na hora de decidir ONDE farmar, não só
// pra confirmar de onde um item específico já saiu.
export function findDungeonDrops(dungeonId) {
  if (!dungeonId) return null;
  const dg = AppState.dungeonList.find(d => d.id === dungeonId);
  const sessions = AppState.dgSessions.filter(s => s.dungeonId === dungeonId);
  const sessionsWithRuns = sessions.filter(s => (s.runs || 0) > 0);
  const totalRuns = sessionsWithRuns.reduce((sum, s) => sum + s.runs, 0);

  const byItem = {};
  sessions.forEach(s => {
    Object.entries(s.items || {}).forEach(([name, qty]) => {
      const agg = byItem[name] || (byItem[name] = { name, qty: 0, qtyWithRuns: 0, lastDate: '' });
      agg.qty += qty;
      if (s.date > agg.lastDate) agg.lastDate = s.date;
    });
  });
  sessionsWithRuns.forEach(s => {
    Object.entries(s.items || {}).forEach(([name, qty]) => {
      byItem[name].qtyWithRuns += qty;
    });
  });

  const todos = Object.values(byItem).map(agg => {
    const rate = summarizeRate(agg.qtyWithRuns, totalRuns);
    const price = getItemPrice(agg.name);
    return { ...agg, ...rate, price, expectedAlzPerRun: rate.dropRate != null ? rate.dropRate * price : null };
  }).sort((a, b) => (b.expectedAlzPerRun ?? -1) - (a.expectedAlzPerRun ?? -1));

  // Equipamento genérico (sapatilha, luvas, e o resto da lista de exclusão) sai da lista principal
  // e vira UM grupo. Cada variação virava uma linha, e a tabela ficava tão longa que escondia os
  // itens que você está de fato caçando — que é a única razão de abrir essa tela. Some da lista,
  // mas não do app: o grupo abre e mostra tudo, com os mesmos números.
  const items = todos.filter(i => !isExcludedGearItem(i.name));
  const gearItems = todos.filter(i => isExcludedGearItem(i.name));

  // O resumo do grupo é a soma real, não uma média de médias: quantidade somada, taxa recalculada
  // sobre o mesmo total de runs, e Alz/run somado item a item (cada um tem preço próprio, então
  // um "preço do grupo" não significaria nada — a coluna fica vazia de propósito).
  const gear = !gearItems.length ? null : {
    name: 'Equipamentos',
    count: gearItems.length,
    qty: gearItems.reduce((s, i) => s + i.qty, 0),
    ...summarizeRate(gearItems.reduce((s, i) => s + i.qtyWithRuns, 0), totalRuns),
    expectedAlzPerRun: gearItems.reduce((s, i) => s + (i.expectedAlzPerRun || 0), 0) || null,
    items: gearItems,
  };

  return { dungeonName: dg ? dg.name : dungeonId, totalRuns, items, gear };
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
