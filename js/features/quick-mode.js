import { AppState } from '../state/app-state.js';
import { recordSale } from './sales.js';
import { setDailyGoal } from './farm-goal.js';
import { startDgSession, endDgSession, getActiveSessionSummary } from './dg-session.js';
import { parseAlzInput } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { navigateTo, renderPage } from '../router.js';

// Modo rápido: um assistente passo a passo pra fazer as coisas mais comuns sem caçar nas páginas.
// A ideia é uma pergunta por tela, com botão grande — pensado pra quem é leigo ou tem pressa.

export function openQuickMode() {
  AppState.quickMode = { action: null, step: 0, data: {}, error: '' };
  navigateTo('rapido');
}

export function quickPick(action) {
  AppState.quickMode = { action, step: 1, data: {}, error: '' };
  renderPage();
}

export function quickBackToMenu() {
  AppState.quickMode = { action: null, step: 0, data: {}, error: '' };
  renderPage();
}

// Botão "Próximo/Confirmar" de qualquer passo — decide o que fazer pela ação + passo atuais.
export function quickNext() {
  const qm = AppState.quickMode;
  qm.error = '';
  const val = id => (document.getElementById(id)?.value || '').trim();
  const fail = msg => { qm.error = msg; renderPage(); };

  if (qm.action === 'venda') {
    if (qm.step === 1) {
      const item = val('qm-item');
      if (!item) return fail('Escolha ou digite o item.');
      qm.data.itemName = item; qm.step = 2;
    } else if (qm.step === 2) {
      qm.data.qty = Math.max(1, parseInt(val('qm-qty'), 10) || 1); qm.step = 3;
    } else if (qm.step === 3) {
      const price = parseAlzInput(val('qm-price'));
      if (!(price > 0)) return fail('Informe por quanto vendeu (Alz).');
      qm.data.unitPrice = price; qm.step = 4;
    } else if (qm.step === 4) {
      recordSale({ itemName: qm.data.itemName, qty: qm.data.qty, unitPrice: qm.data.unitPrice, date: todayISODate() });
      qm.step = 'done';
    }
  } else if (qm.action === 'meta') {
    if (qm.step === 1) {
      const raw = val('qm-goal');
      if (!(parseInt(raw.replace(/\D/g, ''), 10) > 0)) return fail('Informe a meta de Alz.');
      setDailyGoal(raw);
      qm.data.goalAlz = AppState.dailyGoalAlz;
      qm.step = 'done';
    }
  } else if (qm.action === 'sessao') {
    if (qm.step === 1) {
      const active = getActiveSessionSummary();
      if (active) {
        qm.data.endedName = active.dungeonName;
        qm.data.endedAlz = active.totalAlz;
        endDgSession();
        qm.step = 'done-end';
      } else {
        const id = val('qm-dg');
        if (!id) return fail('Escolha a DG.');
        const dg = AppState.dungeonList.find(d => d.id === id);
        qm.data.dungeonName = dg ? dg.name : '';
        startDgSession(id);
        qm.step = 'done-start';
      }
    }
  }
  renderPage();
}
