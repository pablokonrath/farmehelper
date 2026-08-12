import { AppState } from '../state/app-state.js';
import { saveManualDrops } from '../state/persistence.js';
import { updateBalanceSidebar } from './drops.js';
import { actWithUndo } from './undo.js';
import { renderPage } from '../router.js';

// A opção de ADICIONAR um drop manual foi retirada (pedido do jogador, 11/08/2026): misturava
// item que não é farme de verdade (comprado, craftado, recebido de presente/evento) com o log
// oficial, contaminando toda métrica do app que assume "isso é farme" — Meta de farme, Drops/hora,
// watchdog ("sem dropar item rastreado"), "itens caindo agora" da sessão ativa. A ideia de
// registrar item que não vem do log continua fazendo sentido, só que como algo SEPARADO (sem
// entrar em getAllDrops), ainda não implementado.
//
// Lotes que já existiam de antes continuam contando pro total (getAllDrops em drops.js) e ainda
// podem ser removidos — só não dá mais pra criar um novo, por isso só sobrou a função de baixo.

export function deleteManualDropBatch(batchId) {
  const removidos = AppState.manualDrops.filter(d => d.batchId === batchId);
  if (!removidos.length) return;
  AppState.manualDrops = AppState.manualDrops.filter(d => d.batchId !== batchId);
  saveManualDrops();
  updateBalanceSidebar();
  renderPage();

  actWithUndo(`${removidos.length}× ${removidos[0].name} removido`, () => {
    AppState.manualDrops.push(...removidos);
    saveManualDrops();
    updateBalanceSidebar();
    renderPage();
  });
}

export function summarizeManualDropBatches() {
  const batches = {};
  AppState.manualDrops.forEach(d => {
    if (!batches[d.batchId]) batches[d.batchId] = { batchId: d.batchId, name: d.name, date: d.date, qty: 0 };
    batches[d.batchId].qty++;
  });
  return Object.values(batches).sort((a, b) => b.date.localeCompare(a.date));
}
