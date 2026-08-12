import { esc } from '../utils/escape.js';

// Desfazer, no lugar de perguntar "tem certeza?".
//
// O app acumulou mais de dez confirm(). Cada um protege de verdade, e cada um cobra pedágio pra
// sempre de quem já entendeu o risco — inclusive nas ações que são triviais de refazer. Pra tudo
// que é REVERSÍVEL o padrão melhor é o contrário: age na hora e oferece voltar atrás por alguns
// segundos. Confirmação pergunta antes de a pessoa ver o resultado; desfazer deixa ver e voltar.
//
// Confirmação continua onde NÃO há volta: apagar dado global compartilhado (categoria, cadastro
// Itens × DGs), restaurar catálogo padrão, limpar histórico inteiro. Ali a pergunta é o único
// aviso possível — não existe estado anterior guardado pra restaurar.
const TOAST_ID = 'undoToast';
const UNDO_WINDOW_MS = 7000;

let pendingUndo = null;

export function runUndo() {
  if (!pendingUndo) return;
  const { onUndo } = pendingUndo;
  dismissUndoToast();
  onUndo();
}

function dismissUndoToast() {
  if (pendingUndo?.timer) clearTimeout(pendingUndo.timer);
  pendingUndo = null;
  document.getElementById(TOAST_ID)?.remove();
}

// `message` descreve o que ACABOU de acontecer (passado, não pergunta): "Venda removida".
// `onUndo` restaura o estado anterior e persiste — quem chama é responsável por guardar a cópia
// ANTES de remover, já que aqui não existe acesso ao dado.
export function actWithUndo(message, onUndo) {
  // Um desfazer por vez: se outra ação acontece antes de a janela fechar, a anterior já não pode
  // mais ser desfeita de forma previsível (o estado mudou duas vezes) — melhor sumir com a oferta
  // do que restaurar algo por cima de uma alteração mais nova.
  dismissUndoToast();

  const container = document.getElementById('alertToastContainer');
  if (!container) return;

  const el = document.createElement('div');
  el.id = TOAST_ID;
  el.className = 'alert-toast';
  el.innerHTML = `
    <i class="ti ti-trash" style="color:var(--muted);flex-shrink:0;margin-top:1px"></i>
    <div style="flex:1;min-width:0;font-size:13px">${esc(message)}</div>
    <button class="btn btn-d btn-xs" style="flex-shrink:0" onclick="runUndo()"><i class="ti ti-arrow-back-up"></i>Desfazer</button>`;
  container.appendChild(el);

  pendingUndo = { onUndo, timer: setTimeout(dismissUndoToast, UNDO_WINDOW_MS) };
}
