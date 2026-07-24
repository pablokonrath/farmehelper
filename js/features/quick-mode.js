import { AppState, CREDIT_CATEGORIES } from '../state/app-state.js';
import { recordSale } from './sales.js';
import { setDailyGoal } from './farm-goal.js';
import { startDgSession, endDgSession, getActiveSessionSummary } from './dg-session.js';
import { addTrackedKeywordByName } from './keywords.js';
import { buildCartItem, saveRushForDay, calculateRushCartCost } from './rush-cart.js';
import { saveRushParams } from '../state/persistence.js';
import { parseAlzInput } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { navigateTo, renderPage } from '../router.js';

// Modo guiado: um assistente passo a passo pra fazer as coisas mais comuns sem caçar nas páginas.
// A ideia é uma pergunta por tela, com botão grande — pensado pra quem é leigo ou tem pressa.

export function openQuickMode() {
  AppState.quickMode = { action: null, step: 0, data: {}, error: '' };
  navigateTo('rapido');
}

export function quickPick(action) {
  AppState.quickMode = { action, step: 1, data: {}, error: '' };
  renderPage();
}

// Abre o Modo guiado já direto no montar rush — atalho vindo da aba "DGs de rush diário".
export function openGuidedRush() {
  AppState.quickMode = { action: 'rush', step: 1, data: {}, error: '' };
  navigateTo('rapido');
}

export function quickBackToMenu() {
  AppState.quickMode = { action: null, step: 0, data: {}, error: '' };
  renderPage();
}

// Volta UMA etapa. Se já está no passo 1, aí sim volta pra lista de ações (não perde o caminho
// no meio de um fluxo de vários passos, como venda ou montar rush).
export function quickBack() {
  const qm = AppState.quickMode;
  qm.error = '';
  if (typeof qm.step === 'number' && qm.step > 1) {
    qm.step -= 1;
  } else {
    qm.action = null;
    qm.step = 0;
  }
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
  } else if (qm.action === 'rastrear') {
    if (qm.step === 1) {
      const item = val('qm-track');
      if (!item) return fail('Digite o item pra rastrear.');
      if (!addTrackedKeywordByName(item, true)) return fail('Você já rastreia esse item.');
      qm.data.itemName = item; qm.step = 'done';
    }
  } else if (qm.action === 'rush') {
    if (qm.step === 1) { // valores base (ticket/cash) — ficam salvos
      AppState.rushTicketPrice = parseAlzInput(val('qm-rush-ticket'));
      AppState.rushCardCashPrice = parseAlzInput(val('qm-rush-cash'));
      saveRushParams();
      qm.step = 2;
    } else if (qm.step === 2) { // DGs adicionadas
      if (!qm.data.cart || !qm.data.cart.length) return fail('Adicione ao menos uma DG.');
      qm.step = 3;
    } else if (qm.step === 3) { // créditos de macro (opcional)
      CREDIT_CATEGORIES.forEach(cat => {
        AppState.rushCredits[cat.id].quantity = Math.max(0, parseInt(val('qm-cred-qty-' + cat.id), 10) || 0);
        AppState.rushCredits[cat.id].marketPrice = parseAlzInput(val('qm-cred-price-' + cat.id));
      });
      qm.step = 4;
    } else if (qm.step === 4) { // panorama -> salvar
      AppState.rushCart = qm.data.cart;
      AppState.rushCartDate = todayISODate();
      saveRushForDay();
      qm.data.savedTotal = calculateRushCartCost().total;
      qm.step = 'done';
    }
  }
  renderPage();
}

// Adiciona a DG escolhida (repetições + gemas de reset opcionais) ao carrinho temporário do Modo
// rápido — sem finalizar. Se "gemas de reset" > 0, marca a DG como resetada com aquele preço.
export function quickRushAdd() {
  const qm = AppState.quickMode;
  qm.error = '';
  const id = (document.getElementById('qm-rush-dg')?.value || '').trim();
  if (!id) { qm.error = 'Escolha a DG.'; renderPage(); return; }
  const gemQty = parseInt(document.getElementById('qm-rush-gemqty')?.value, 10) || 0;
  const reset = gemQty > 0
    ? { used: true, qty: gemQty, price: parseAlzInput(document.getElementById('qm-rush-gemprice')?.value) }
    : null;
  const item = buildCartItem(id, document.getElementById('qm-rush-reps')?.value, reset);
  if (!item) { qm.error = 'DG inválida.'; renderPage(); return; }
  (qm.data.cart || (qm.data.cart = [])).push(item);
  renderPage();
}

export function quickRushRemove(index) {
  const cart = AppState.quickMode.data.cart;
  if (cart) cart.splice(index, 1);
  renderPage();
}
