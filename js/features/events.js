import { AppState } from '../state/app-state.js';
import { saveEvents } from '../state/persistence.js';
import { normalizeForSearch, todayISODate } from '../utils/parsing.js';
import { parseAlzInput } from '../utils/formatting.js';
import { actWithUndo } from './undo.js';
import { renderPage } from '../router.js';

// HISTÓRICO de eventos, em vez de um evento só.
//
// Antes existia um eventConfig único, sobrescrito toda vez que um evento novo começava — o
// anterior simplesmente sumia. Isso impedia a única pergunta que importa depois que o evento
// acaba: "em qual eu farmei melhor?". Sem os anteriores guardados, não há com o que comparar.
//
// A data de FIM nasce nula, e isso não é descuido: o servidor costuma anunciar o término só
// depois que o evento já começou. Enquanto ela for nula o evento está em andamento, e todo número
// dele é PARCIAL — comparar um evento de 12 dias correndo com um de 30 já fechado pelo total não
// compara nada. Por isso a comparação principal é normalizada (por run e por hora), e o total só
// aparece rotulado como parcial.

export function getEvents() {
  return AppState.events || [];
}

export function getActiveEvent() {
  const hoje = todayISODate();
  return getEvents().find(e => !e.fim || e.fim >= hoje) || null;
}

export function createEvent({ nome, itemName, inicio }) {
  nome = (nome || '').trim();
  itemName = (itemName || '').trim();
  if (!nome || !itemName) return false;
  if (!AppState.events) AppState.events = [];
  // Fechar o anterior na véspera do novo evita dois eventos "em andamento" ao mesmo tempo, que
  // faria as contagens se sobreporem e cada uma reivindicar os mesmos drops.
  const anterior = getActiveEvent();
  const dataInicio = inicio || todayISODate();
  if (anterior && !anterior.fim) {
    const vespera = new Date(dataInicio);
    vespera.setDate(vespera.getDate() - 1);
    anterior.fim = todayISODate(vespera);
  }
  AppState.events.push({
    id: 'ev' + Date.now(),
    nome,
    itemName,
    inicio: dataInicio,
    fim: null,
    // Herda os multiplicadores do evento anterior como ponto de partida: evento novo costuma
    // repetir a mesma tabela de DGs, e recomeçar do zero toda vez é trabalho repetido.
    multipliers: anterior ? { ...anterior.multipliers } : {},
    resgates: [],
  });
  saveEvents().catch(err => console.error('Falha ao salvar evento:', err));
  renderPage();
  return true;
}

export function setEventField(id, campo, valor) {
  const ev = getEvents().find(e => e.id === id);
  if (!ev) return;
  if (campo === 'nome' || campo === 'itemName') ev[campo] = (valor || '').trim();
  else if (campo === 'inicio' || campo === 'fim') ev[campo] = valor || null;
  saveEvents().catch(err => console.error('Falha ao salvar evento:', err));
  renderPage();
}

export function setEventDgMultiplier(id, dungeonId, valor) {
  const ev = getEvents().find(e => e.id === id);
  if (!ev) return;
  const mult = Math.max(0, parseInt(valor, 10) || 0);
  if (mult > 0) ev.multipliers[dungeonId] = mult;
  else delete ev.multipliers[dungeonId];
  saveEvents().catch(err => console.error('Falha ao salvar evento:', err));
  renderPage();
}

export function deleteEvent(id) {
  const idx = getEvents().findIndex(e => e.id === id);
  if (idx < 0) return;
  const [ev] = AppState.events.splice(idx, 1);
  saveEvents().catch(err => console.error('Falha ao salvar evento:', err));
  renderPage();
  actWithUndo(`Evento removido: ${ev.nome}`, () => {
    AppState.events.splice(idx, 0, ev);
    saveEvents().catch(err => console.error('Falha ao salvar evento:', err));
    renderPage();
  });
}

// RESGATE: o que você trocou pelas fichas. É o que transforma "juntei 4.800 fragmentos" em
// "o evento me rendeu X" — a contagem sozinha não responde se valeu a pena.
//
// Guarda o custo EM FICHAS junto do valor, porque é isso que torna a troca avaliável: 200kk por
// 500 fichas e 200kk por 2.000 fichas são decisões muito diferentes, e sem o custo as duas ficam
// idênticas no registro.
export function addEventRedemption(id, { recompensa, quantidade, valorTexto, custoFichas }) {
  const ev = getEvents().find(e => e.id === id);
  if (!ev) return;
  const valor = parseAlzInput(valorTexto);
  const qtd = Math.max(1, parseInt(quantidade, 10) || 1);
  recompensa = (recompensa || '').trim();
  if (!recompensa || !(valor > 0)) return;

  if (!ev.resgates) ev.resgates = [];
  const mov = {
    data: todayISODate(),
    recompensa,
    quantidade: qtd,
    valorUnitario: valor / qtd,
    custoFichas: Math.max(0, parseInt(custoFichas, 10) || 0),
  };
  ev.resgates.push(mov);
  saveEvents().catch(err => console.error('Falha ao salvar resgate:', err));
  renderPage();
}

export function removeEventRedemption(id, index) {
  const ev = getEvents().find(e => e.id === id);
  if (!ev?.resgates?.[index]) return;
  ev.resgates.splice(index, 1);
  saveEvents().catch(err => console.error('Falha ao salvar resgate:', err));
  renderPage();
}

// Números de um evento, sempre restritos à janela dele. Tudo por run e por hora além do total,
// porque é isso que permite comparar eventos de durações diferentes — e um deles quase sempre
// está pela metade.
export function computeEventStats(ev) {
  const alvo = normalizeForSearch(ev.itemName || '');
  const hoje = todayISODate();
  const fim = ev.fim || hoje;
  const emAndamento = !ev.fim;

  const sessoes = AppState.dgSessions.filter(s => s.date >= ev.inicio && s.date <= fim);

  let fichasBrutas = 0;
  let fichas = 0;
  let foraDeMultiplicador = 0;
  let runs = 0;
  let activeMs = 0;
  const porDg = new Map();

  for (const s of sessoes) {
    runs += s.runs || 0;
    activeMs += s.activeDurationMs ?? s.durationMs ?? 0;
    for (const [nome, qty] of Object.entries(s.items || {})) {
      if (!alvo || !normalizeForSearch(nome).includes(alvo)) continue;
      const mult = ev.multipliers?.[s.dungeonId] || 0;
      fichasBrutas += qty;
      if (!mult) { foraDeMultiplicador += qty; continue; }
      fichas += qty * mult;
      const linha = porDg.get(s.dungeonId) || { dungeonId: s.dungeonId, dungeonName: s.dungeonName, bruto: 0, mult, contado: 0, runs: 0 };
      linha.bruto += qty;
      linha.contado += qty * mult;
      porDg.set(s.dungeonId, linha);
    }
  }
  // Runs por DG numa passada à parte: a de cima só entra em sessão que teve o item, e a run
  // conta mesmo quando não caiu ficha nenhuma — senão a taxa por run ficaria inflada.
  for (const s of sessoes) {
    const linha = porDg.get(s.dungeonId);
    if (linha) linha.runs += s.runs || 0;
  }

  const resgates = ev.resgates || [];
  const valorResgatado = resgates.reduce((sum, r) => sum + r.valorUnitario * r.quantidade, 0);
  const fichasGastas = resgates.reduce((sum, r) => sum + (r.custoFichas || 0), 0);

  const dias = Math.max(1, Math.round((new Date(fim) - new Date(ev.inicio)) / 86400000) + 1);
  const horas = activeMs / 3600000;

  return {
    ...ev,
    emAndamento,
    dias,
    runs,
    horas,
    fichas,
    fichasBrutas,
    foraDeMultiplicador,
    fichasDisponiveis: fichas - fichasGastas,
    porDg: [...porDg.values()].sort((a, b) => b.contado - a.contado),
    resgates,
    valorResgatado,
    fichasGastas,
    // As três réguas de comparação. Por hora é a mais justa entre eventos (não depende de quanto
    // você jogou), por run mede a mecânica em si, por dia mostra o ritmo que você conseguiu manter.
    fichasPorRun: runs > 0 ? fichas / runs : null,
    fichasPorHora: horas > 0.1 ? fichas / horas : null,
    fichasPorDia: fichas / dias,
    // Quanto o evento pagou por hora farmada — é o número que dá pra comparar direto com o
    // Alz/hora do farme normal e responder "valeu a pena priorizar isso?".
    alzPorHora: horas > 0.1 && valorResgatado > 0 ? valorResgatado / horas : null,
    // Quanto vale cada ficha, pelo que você de fato trocou. Só existe depois de resgatar algo.
    alzPorFicha: fichasGastas > 0 ? valorResgatado / fichasGastas : null,
  };
}

export function computeAllEventStats() {
  return getEvents()
    .map(computeEventStats)
    .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
}
