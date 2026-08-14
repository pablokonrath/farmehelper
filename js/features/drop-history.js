import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getAllDrops, getItemPrice, getItemPriceOn, isExcludedGearItem, isEventItem, matchesTrackedKeywordFilter } from './drops.js';
import { saveDropSnapshot } from '../state/persistence.js';
import { stripEnhancementSuffix } from '../utils/parsing.js';

// O log do jogo guarda ~30 dias. Sem nada por trás, todo drop mais velho que isso sumia pra
// sempre e a Visão geral mostrava um total silenciosamente incompleto em qualquer período mais
// antigo. Este módulo mantém um AGREGADO por dia+item no banco (ver sql/migrate_drop_snapshots)
// e costura ele com o log ao vivo, pra que "quanto eu farmei" seja verdade em qualquer intervalo.

// Menor data presente no log carregado agora. É a fronteira entre as duas fontes: daqui pra
// frente o log ao vivo manda (é exato e tem os drops de hoje); antes disso, só o snapshot sabe.
export function getLogStartDate() {
  let min = null;
  for (const d of AppState.drops) {
    if (!min || d.date < min) min = d.date;
  }
  return min;
}

// Agrega o log atual em linhas {date, name, qty}. Só o log — drops manuais já são persistidos
// à parte (tabela manual_drops) e entrariam em duplicidade aqui. Equipamento genérico fica de
// fora pelo mesmo motivo do resto do app (não tem valor e só incharia a tabela).
export function buildSnapshotRowsFromLog() {
  const byKey = new Map();
  for (const drop of AppState.drops) {
    if (isExcludedGearItem(drop.name)) continue;
    const name = stripEnhancementSuffix(drop.name);
    const key = drop.date + ' ' + name;
    const row = byKey.get(key);
    if (row) row.qty++;
    else byKey.set(key, { date: drop.date, name, qty: 1 });
  }
  return [...byKey.values()];
}

// Sincroniza o log atual com o banco e atualiza o espelho em memória. Chamada quando o arquivo
// é (re)carregado e, com folga, conforme drops novos chegam — o upsert por (dia, item) faz cada
// chamada ser idempotente, então sincronizar demais só custa rede, nunca corrompe o histórico.
let lastSyncAt = 0;
const SYNC_THROTTLE_MS = 2 * 60 * 1000;

export function syncDropSnapshot({ force = false } = {}) {
  if (!AppState.drops.length) return Promise.resolve();
  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_THROTTLE_MS) return Promise.resolve();
  lastSyncAt = now;

  const rows = buildSnapshotRowsFromLog();
  // Espelha em memória na hora pra a tela já refletir sem esperar o round-trip: o snapshot
  // guardado é sempre "o que o banco tem" + "o que o log tem agora" na mesma estrutura.
  const byKey = new Map(AppState.dropSnapshot.map(r => [r.date + ' ' + r.name, r]));
  for (const row of rows) byKey.set(row.date + ' ' + row.name, { ...row });
  AppState.dropSnapshot = [...byKey.values()];

  return saveDropSnapshot(rows).catch(err => console.error('Falha ao salvar histórico de drops:', err));
}

// Total por item no período, costurando as duas fontes sem contar nada duas vezes:
// - datas dentro da janela do log  -> log ao vivo + drops manuais (exato, inclui hoje)
// - datas anteriores à janela      -> snapshot do banco (única fonte que ainda sabe)
// Retorna também de quantos dias o número veio só do snapshot, pra UI poder ser honesta.
// respeitarFiltrosDaPagina=false: ignora o "De/Até" e o filtro de itens rastreados da Visão geral.
// Cards de janela fixa ("Sua semana", "Sua evolução") precisam disso — o período deles é próprio,
// e aplicar o filtro da página por cima recortaria duas vezes, mostrando menos do que existe.
export function getHistoricalSummary(from, to, { respeitarFiltrosDaPagina = true } = {}) {
  const inRange = date => (!from || date >= from) && (!to || date <= to);
  const logStart = getLogStartDate();

  const qtyByItem = new Map();
  const alzByDate = new Map();
  let dropCount = 0;
  const add = (name, date, qty) => {
    const key = stripEnhancementSuffix(name);
    // Item de evento nao entra em Alz nenhum: e ficha de troca e tem painel proprio.
    if (isEventItem(key)) { dropCount += qty; return; }
    // Preço da ÉPOCA: este total é dinheiro que você ganhou, não uma reavaliação do passado.
    const valor = getItemPriceOn(key, date).price * qty;
    const acc = qtyByItem.get(key) || { qty: 0, total: 0 };
    acc.qty += qty;
    // Acumula o valor item a item na hora, com a data em mãos. Somar depois (qty × preço) daria um
    // total diferente do total por dia logo abaixo, e a tabela de itens não fecharia com o
    // cabeçalho do período — divergência que pareceria bug e minaria a confiança nos dois números.
    acc.total += valor;
    qtyByItem.set(key, acc);
    alzByDate.set(date, (alzByDate.get(date) || 0) + valor);
    dropCount += qty;
  };

  const fonteAoVivo = respeitarFiltrosDaPagina ? getFilteredDrops() : getAllDrops();
  for (const drop of fonteAoVivo) {
    if (inRange(drop.date)) add(drop.name, drop.date, 1);
  }

  const snapshotDates = new Set();
  for (const row of AppState.dropSnapshot) {
    // logStart null = nenhum log carregado agora; nesse caso o snapshot responde por tudo.
    if (logStart && row.date >= logStart) continue;
    if (!inRange(row.date)) continue;
    if (respeitarFiltrosDaPagina && !matchesTrackedKeywordFilter(row.name)) continue;
    snapshotDates.add(row.date);
    add(row.name, row.date, row.qty);
  }

  const items = [...qtyByItem.entries()]
    // price = preço de HOJE (é o que você usaria pra vender agora); total = o que aquilo rendeu na
    // época. São coisas diferentes de propósito, e por isso total nem sempre é qty × price.
    .map(([name, acc]) => ({ name, qty: acc.qty, price: getItemPrice(name), total: acc.total }))
    .sort((a, b) => b.total - a.total);

  return {
    items,
    dropCount,
    totalAlz: items.reduce((sum, i) => sum + i.total, 0),
    totalsByDate: Object.fromEntries(alzByDate),
    snapshotOnlyDays: snapshotDates.size,
  };
}

// Soma o "Total gasto em rush" (crédito + tickets + gemas do carrinho salvo do dia) num
// intervalo de datas ISO, from/to inclusive (omitir = sem limite desse lado). Única fonte dessa
// conta — Visão geral, os blocos de "Sua evolução" e a projeção dela usam esta mesma função, pra
// não ter três cópias da mesma soma que podem divergir se uma mudar e a outra não.
export function getRushSpentInRange(from, to) {
  let total = 0;
  for (const [date, rush] of Object.entries(AppState.rushHistory)) {
    if (from && date < from) continue;
    if (to && date > to) continue;
    total += rush.total || 0;
  }
  return total;
}

// Compara blocos de N dias pra trás: [0] = o bloco mais recente (últimos N dias), [1] = os N
// anteriores, e assim por diante. Só possível por causa do histórico arquivado — antes, qualquer
// janela maior que o log virava zero. Devolve também a média diária, que é o número honesto pra
// comparar blocos (o bloco atual costuma estar pela metade quando você olha).
export function getPeriodTrend(blockDays, blocks = 3) {
  const dayMs = 86400000;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const isoOf = offsetDays => {
    const d = new Date(startOfToday.getTime() - offsetDays * dayMs);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Uma passada só pelas duas fontes, distribuindo cada dia no bloco a que pertence. Antes eram
  // N chamadas a getHistoricalSummary, e cada uma varria o log inteiro — com log pesado isso
  // custava 3 varreduras completas só pra montar este card.
  const limites = [];
  for (let b = 0; b < blocks; b++) {
    limites.push({ from: isoOf(blockDays * (b + 1) - 1), to: isoOf(blockDays * b) });
  }
  const blocoDe = date => limites.findIndex(l => date >= l.from && date <= l.to);

  const alzPorDia = limites.map(() => new Map());
  const dropsPorBloco = limites.map(() => 0);
  const somar = (name, date, qty) => {
    const b = blocoDe(date);
    if (b < 0) return;
    // Preco da epoca aqui tambem — e o que faz a tendencia enxergar QUEDA DE MERCADO. Com precos
    // de hoje os dois blocos comparados mudam juntos e a erosao de preco fica invisivel (e o mesmo
    // motivo pelo qual o alerta de "DG esfriando" nao consegue ver preco, ver computeDgComparison).
    alzPorDia[b].set(date, (alzPorDia[b].get(date) || 0) + getItemPriceOn(stripEnhancementSuffix(name), date).price * qty);
    dropsPorBloco[b] += qty;
  };

  const logStart = getLogStartDate();
  for (const drop of getAllDrops()) somar(drop.name, drop.date, 1);
  for (const row of AppState.dropSnapshot) {
    if (logStart && row.date >= logStart) continue; // já veio do log, não conta duas vezes
    somar(row.name, row.date, row.qty);
  }

  return limites.map((l, b) => {
    const totalAlz = [...alzPorDia[b].values()].reduce((s, v) => s + v, 0);
    const diasComFarme = [...alzPorDia[b].values()].filter(v => v > 0).length;
    // Líquido = drops − gasto em rush do mesmo bloco. Divide pelos mesmos dias FARMADOS do bruto
    // (não um "dias com rush salvo" à parte) — o dia continua sendo de farme mesmo que o rush
    // daquele dia tenha custado mais do que caiu, e é isso que torna o líquido possivelmente negativo.
    const rushSpent = getRushSpentInRange(l.from, l.to);
    const netAlz = totalAlz - rushSpent;
    return {
      from: l.from, to: l.to,
      totalAlz,
      rushSpent,
      netAlz,
      dropCount: dropsPorBloco[b],
      diasComFarme,
      // Média por dia FARMADO (não por dia corrido): comparar um bloco onde você jogou 3 dias
      // com outro onde jogou 20 pelo total puro diria mais sobre presença do que sobre eficiência.
      alzPorDiaFarmado: diasComFarme ? totalAlz / diasComFarme : 0,
      netPorDiaFarmado: diasComFarme ? netAlz / diasComFarme : 0,
    };
  });
}

// Quantos dias do período pedido o app NÃO consegue cobrir com nenhuma das duas fontes — é o
// que permite avisar "esse total está incompleto" em vez de mostrar um número menor em silêncio.
export function countUncoveredDays(from, to) {
  if (!from) return 0;
  const start = new Date(from + 'T00:00:00');
  const end = new Date((to || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  if (!(start <= end)) return 0;

  const covered = new Set(AppState.dropSnapshot.map(r => r.date));
  for (const drop of AppState.drops) covered.add(drop.date);
  for (const drop of AppState.manualDrops) covered.add(drop.date);

  let uncovered = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!covered.has(iso)) uncovered++;
  }
  return uncovered;
}
