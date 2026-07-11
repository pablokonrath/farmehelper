import { AppState } from '../state/app-state.js';
import { getTodayFarmedAlz } from './drops.js';
import { saveDailyGoal } from '../state/persistence.js';
import { showGoalToast } from './alerts.js';
import { formatAlzGamer } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { renderPage } from '../router.js';

// Guarda a meta diária de Alz. Recebe o valor do input mascarado ("500.000.000") — tira tudo
// que não é dígito. Ao redefinir, recalibra a baseline de comemoração: se a nova meta já está
// batida com o que já caiu hoje, marca como comemorada (não festeja retroativo); senão, libera.
export function setDailyGoal(value) {
  AppState.dailyGoalAlz = parseInt(String(value).replace(/\D/g, ''), 10) || 0;
  saveDailyGoal();
  AppState.goalCelebratedForDate =
    AppState.dailyGoalAlz > 0 && getTodayFarmedAlz() >= AppState.dailyGoalAlz ? todayISODate() : null;
  renderPage();
}

// Chamada no boot (depois de carregar o estado): se a meta já está batida com os drops que já
// existem, marca como comemorada pra não festejar no carregamento — a comemoração só dispara
// quando o valor CRUZA a meta durante a sessão (ver checkFarmGoalReached).
export function initFarmGoalBaseline() {
  if (AppState.dailyGoalAlz > 0 && getTodayFarmedAlz() >= AppState.dailyGoalAlz) {
    AppState.goalCelebratedForDate = todayISODate();
  }
}

// Chamada quando caem drops novos (log ao vivo / manual) — comemora uma única vez no dia em que
// o total de hoje cruza a meta.
export function checkFarmGoalReached() {
  const goal = AppState.dailyGoalAlz;
  if (goal <= 0) return;
  const today = todayISODate();
  if (AppState.goalCelebratedForDate === today) return;
  if (getTodayFarmedAlz() >= goal) {
    AppState.goalCelebratedForDate = today;
    showGoalToast('🎯 Meta de farme batida!', `Você atingiu ${formatAlzGamer(goal)} Alz hoje. Bom farme!`);
  }
}
