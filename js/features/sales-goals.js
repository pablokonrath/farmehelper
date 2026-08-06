import { AppState } from '../state/app-state.js';
import { saveSalesGoals } from '../state/persistence.js';
import { parseAlzInput } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { renderPage } from '../router.js';

// Núcleo sem DOM (reaproveitado pelo Modo guiado, que já acumula os dados do passo a passo em vez
// de reler input por id). Devolve false se algum campo obrigatório faltar.
export function createSalesGoal({ name, targetAlz, percentage }) {
  name = (name || '').trim();
  if (!name || !(targetAlz > 0) || !(percentage > 0)) return false;
  AppState.salesGoals.push({ id: 'goal' + Date.now(), name, targetAlz, percentage: Math.min(100, percentage), createdAt: Date.now() });
  saveSalesGoals().catch(err => console.error('Falha ao salvar meta:', err));
  return true;
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
  const goal = AppState.salesGoals.find(g => g.id === id);
  if (!goal || !confirm(`Excluir a meta "${goal.name}"?`)) return;
  AppState.salesGoals = AppState.salesGoals.filter(g => g.id !== id);
  saveSalesGoals().catch(err => console.error('Falha ao salvar meta:', err));
  renderPage();
}

// Progresso de cada meta: soma da % fixa dela sobre toda venda registrada DEPOIS que a meta foi
// criada (não retroage sobre vendas antigas — a meta só "começa a contar" a partir de quando você
// a criou, mesma ideia do checkpoint usado no craft removido, mas sem checkpoint móvel: aqui é
// fixo na criação, já que a meta não "reinicia" sozinha, só é excluída quando quiser.
export function computeSalesGoalsProgress() {
  return AppState.salesGoals.map(goal => {
    const sinceDate = todayISODate(new Date(goal.createdAt));
    const accumulated = AppState.salesLog
      .filter(s => s.date >= sinceDate)
      .reduce((sum, s) => sum + (s.unitPrice * s.qty * goal.percentage) / 100, 0);
    return {
      ...goal,
      accumulated,
      progress: goal.targetAlz > 0 ? Math.min(1, accumulated / goal.targetAlz) : 0,
      complete: accumulated >= goal.targetAlz,
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
