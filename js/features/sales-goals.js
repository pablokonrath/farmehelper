import { AppState } from '../state/app-state.js';
import { saveSalesGoals } from '../state/persistence.js';
import { parseAlzInput, formatAlzGamer } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { actWithUndo } from './undo.js';
import { renderPage } from '../router.js';

// Núcleo sem DOM (reaproveitado pelo Modo guiado, que já acumula os dados do passo a passo em vez
// de reler input por id). Devolve false se algum campo obrigatório faltar.
export function createSalesGoal({ name, targetAlz, percentage, deadline }) {
  name = (name || '').trim();
  if (!name || !(targetAlz > 0) || !(percentage > 0)) return false;
  AppState.salesGoals.push({
    id: 'goal' + Date.now(),
    name,
    targetAlz,
    percentage: Math.min(100, percentage),
    // Prazo é opcional e muda a natureza da conta: com prazo, a pergunta é "que % preciso
    // guardar?"; sem prazo, é "que % dá pra sustentar?". São perguntas diferentes.
    deadline: deadline || null,
    withdrawals: [],
    createdAt: Date.now(),
  });
  saveSalesGoals().catch(err => console.error('Falha ao salvar meta:', err));
  return true;
}

// RETIRADA. O cofre era um número derivado (soma da % das vendas) e por isso não sabia mentir —
// mas também não sabia que você tirou dinheiro dele. Depois de usar a reserva, o saldo mostrado
// vira ficção, e ficção em número de dinheiro é o pior tipo de erro: você planeja em cima.
//
// Guarda o MOTIVO junto porque a retirada é informação, não só desfalque: duas retiradas em um
// mês dizem que a taxa está acima do que a sua operação sustenta (ver sugestão abaixo).
export function addGoalWithdrawal(goalId, valorTexto, motivo) {
  const goal = AppState.salesGoals.find(g => g.id === goalId);
  if (!goal) return;
  const valor = parseAlzInput(valorTexto);
  if (!(valor > 0)) return;

  if (!goal.withdrawals) goal.withdrawals = [];
  const mov = { date: todayISODate(), amount: valor, reason: (motivo || '').trim().slice(0, 80) };
  goal.withdrawals.push(mov);
  saveSalesGoals().catch(err => console.error('Falha ao salvar retirada:', err));
  renderPage();

  actWithUndo(`Retirada de ${formatAlzGamer(valor)} registrada em "${goal.name}"`, () => {
    goal.withdrawals = goal.withdrawals.filter(w => w !== mov);
    saveSalesGoals().catch(err => console.error('Falha ao salvar retirada:', err));
    renderPage();
  });
}

export function removeGoalWithdrawal(goalId, index) {
  const goal = AppState.salesGoals.find(g => g.id === goalId);
  if (!goal?.withdrawals?.[index]) return;
  goal.withdrawals.splice(index, 1);
  saveSalesGoals().catch(err => console.error('Falha ao salvar retirada:', err));
  renderPage();
}

export function setGoalDeadline(goalId, date) {
  const goal = AppState.salesGoals.find(g => g.id === goalId);
  if (!goal) return;
  goal.deadline = date || null;
  saveSalesGoals().catch(err => console.error('Falha ao salvar prazo:', err));
  renderPage();
}

export function setGoalPercentage(goalId, value) {
  const goal = AppState.salesGoals.find(g => g.id === goalId);
  if (!goal) return;
  goal.percentage = Math.max(0, Math.min(100, parseFloat(String(value).replace(',', '.')) || 0));
  saveSalesGoals().catch(err => console.error('Falha ao salvar percentual:', err));
  renderPage();
}

export function addSalesGoal() {
  const name = document.getElementById('newGoalName')?.value.trim();
  const targetAlz = parseAlzInput(document.getElementById('newGoalTarget')?.value);
  const percentage = Math.max(0, Math.min(100, parseFloat(document.getElementById('newGoalPct')?.value.replace(',', '.')) || 0));
  if (!createSalesGoal({ name, targetAlz, percentage })) return;

  document.getElementById('newGoalName').value = '';
  document.getElementById('newGoalTarget').value = '';
  document.getElementById('newGoalPct').value = '';
  renderPage();
}

export function deleteSalesGoal(id) {
  const index = AppState.salesGoals.findIndex(g => g.id === id);
  if (index < 0) return;
  const [goal] = AppState.salesGoals.splice(index, 1);
  saveSalesGoals().catch(err => console.error('Falha ao salvar meta:', err));
  renderPage();

  actWithUndo(`Cofre removido: ${goal.name}`, () => {
    AppState.salesGoals.splice(index, 0, goal);
    saveSalesGoals().catch(err => console.error('Falha ao salvar meta:', err));
    renderPage();
  });
}

// Progresso de cada meta: soma da % fixa dela sobre toda venda registrada DEPOIS que a meta foi
// criada (não retroage sobre vendas antigas — a meta só "começa a contar" a partir de quando você
// a criou, mesma ideia do checkpoint usado no craft removido, mas sem checkpoint móvel: aqui é
// fixo na criação, já que a meta não "reinicia" sozinha, só é excluída quando quiser.
//
// Também projeta um ritmo (Alz/dia alocado à meta desde a criação) e, a partir dele, uma
// data estimada de conclusão — sem isso, o cofre só mostrava "quanto falta", nunca "em quanto
// tempo, no ritmo atual" (a pergunta que decide se vale reforçar farm/venda pra bater a meta
// antes de um evento, por exemplo). null quando ainda não completou 1 dia de dado ou já bateu.

// Quanto do que você vende dá pra guardar, e o número muda conforme exista prazo ou não — porque
// a pergunta é outra em cada caso.
//
// COM PRAZO: "quanto PRECISO guardar?" — conta fechada, é o que falta dividido pelo que você deve
// vender até lá. Se der mais de 100%, o app diz que não dá no ritmo atual em vez de sugerir um
// número impossível: meta que exige 140% da venda não é meta apertada, é meta que não vai
// acontecer, e fingir o contrário só adia a descoberta.
//
// SEM PRAZO: "quanto DÁ pra guardar?" — aqui o limite não é a meta, é a operação. Guardar não pode
// comer o Alz que banca o rush de amanhã: sem entrada, não há farme, não há venda, e o cofre para
// junto. A sugestão é a folga entre o que você vende e o que gasta em rush, com uma margem de
// segurança — sobra virando reserva, e não o contrário.
//
// E se você JÁ retirou, a sugestão cai. Retirada é a prova prática de que a taxa estava acima do
// que a operação aguenta: você teve que desfazer a reserva pra tocar o dia. Melhor guardar menos
// e não precisar mexer do que guardar muito e sacar todo mês — o segundo dá a ilusão de reserva
// que o primeiro entrega de verdade.
function suggestGoalPercentage(goal, saldo, vendaDiaria) {
  if (!(vendaDiaria > 0)) return null;
  const falta = Math.max(0, goal.targetAlz - saldo);
  if (!falta) return null;

  // Custo médio de rush por dia nos últimos 30 dias — é o dinheiro que precisa continuar
  // disponível pra operação girar.
  const hoje = new Date();
  const desde = todayISODate(new Date(hoje.getTime() - 30 * 86400000));
  const custoRush = Object.entries(AppState.rushHistory)
    .filter(([date]) => date >= desde)
    .reduce((sum, [, r]) => sum + (r.total || 0), 0) / 30;

  const retiradas = (goal.withdrawals || []).length;

  if (goal.deadline) {
    const diasRestantes = Math.ceil((new Date(goal.deadline) - new Date(todayISODate())) / 86400000);
    if (diasRestantes <= 0) return { tipo: 'prazo-vencido', diasRestantes };
    const pct = Math.ceil((falta / (vendaDiaria * diasRestantes)) * 100);
    return {
      tipo: pct > 100 ? 'inalcancavel' : 'prazo',
      pct: Math.min(100, pct),
      diasRestantes,
      // Quanto você precisaria vender por dia pra a meta caber guardando 100%. É a resposta
      // honesta pro caso impossível: não "guarde mais", e sim "venda mais ou mude o prazo".
      vendaNecessariaPorDia: falta / diasRestantes,
      vendaDiaria,
    };
  }

  // Sem prazo: percentual sustentável. Folga = o que sobra da venda depois do rush.
  const folga = Math.max(0, vendaDiaria - custoRush);
  // 70% da folga, não 100%: dia ruim de venda acontece, e uma reserva que consome toda a sobra
  // vira retirada no primeiro imprevisto — que é exatamente o que se quer evitar.
  let pct = Math.floor((folga * 0.7 / vendaDiaria) * 100);
  // Cada retirada já ocorrida derruba mais um pouco: o dado real venceu a fórmula.
  if (retiradas) pct = Math.floor(pct * Math.max(0.5, 1 - retiradas * 0.15));
  return {
    tipo: pct <= 0 ? 'sem-folga' : 'sustentavel',
    pct: Math.max(0, Math.min(100, pct)),
    custoRush,
    folga,
    retiradas,
    vendaDiaria,
  };
}

export function computeSalesGoalsProgress() {
  const today = todayISODate();
  return AppState.salesGoals.map(goal => {
    const sinceDate = todayISODate(new Date(goal.createdAt));
    const accumulated = AppState.salesLog
      .filter(s => s.date >= sinceDate)
      .reduce((sum, s) => sum + (s.unitPrice * s.qty * goal.percentage) / 100, 0);
    // Saldo é o que ENTROU menos o que SAIU. Sem descontar a retirada, o cofre segue mostrando
    // dinheiro que não está mais lá.
    const withdrawals = goal.withdrawals || [];
    const withdrawn = withdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
    const saldo = Math.max(0, accumulated - withdrawn);
    const complete = saldo >= goal.targetAlz;

    const daysElapsed = Math.max(1, Math.round((new Date(today) - new Date(sinceDate)) / 86400000) + 1);
    // Ritmo pelo que entrou, não pelo saldo: retirada é um evento pontual, e deixá-la afundar o
    // ritmo faria a previsão de conclusão despencar por causa de um dia atípico.
    const dailyPace = accumulated / daysElapsed;
    let etaDays = null;
    let etaDate = null;
    if (!complete && dailyPace > 0) {
      const remaining = goal.targetAlz - saldo;
      etaDays = Math.ceil(remaining / dailyPace);
      const eta = new Date(today);
      eta.setDate(eta.getDate() + etaDays);
      etaDate = todayISODate(eta);
    }

    // Venda média por dia desde que o cofre existe — a base de toda sugestão de %: a reserva sai
    // da venda, então é a venda que define o que é possível.
    const vendaDiaria = AppState.salesLog
      .filter(s => s.date >= sinceDate)
      .reduce((sum, s) => sum + s.unitPrice * s.qty, 0) / daysElapsed;

    return {
      ...goal,
      accumulated,
      withdrawn,
      withdrawals,
      saldo,
      progress: goal.targetAlz > 0 ? Math.min(1, saldo / goal.targetAlz) : 0,
      complete,
      dailyPace,
      etaDays,
      etaDate,
      vendaDiaria,
      sugestao: suggestGoalPercentage(goal, saldo, vendaDiaria),
    };
  });
}

// Soma das % de todas as metas ativas — mais de 100% não faz sentido (não dá pra alocar mais do
// que 100% do que você vende), então a UI usa isso pra avisar.
export function totalAllocatedPercentage() {
  return AppState.salesGoals.reduce((sum, g) => sum + g.percentage, 0);
}

// Quanto das vendas de HOJE já tem destino certo nas metas ativas — não é uma conta nova, só
// aplica a mesma % de cada meta (ver computeSalesGoalsProgress) só nas vendas de hoje, pra dar
// noção imediata (sem precisar comparar "Meta do dia" farmada com o total acumulado de cada meta,
// que são pools diferentes: uma é valor farmado, a outra é venda de fato). null se não vendeu nada
// hoje ainda.
export function computeTodayGoalsAllocation() {
  const today = todayISODate();
  const todayTotal = AppState.salesLog
    .filter(s => s.date === today)
    .reduce((sum, s) => sum + s.unitPrice * s.qty, 0);
  if (!todayTotal) return null;
  const activePct = Math.min(100, AppState.salesGoals
    .filter(g => todayISODate(new Date(g.createdAt)) <= today)
    .reduce((sum, g) => sum + g.percentage, 0));
  const allocated = Math.round(todayTotal * activePct / 100);
  return { todayTotal, allocated, free: todayTotal - allocated, pct: activePct };
}
