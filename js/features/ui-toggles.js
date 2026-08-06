import { AppState } from '../state/app-state.js';
import { renderPage } from '../router.js';

// Estado de UI compartilhado entre páginas (não é de uma feature específica, por isso tem
// arquivo próprio em vez de morar dentro de drops.js ou afins).

// Texto explicativo de card ("Como funciona") — escondido por padrão, some clicando de novo.
// Antes esses parágrafos ficavam sempre visíveis acima de cada card; com uma melhoria por vez
// ao longo do tempo, páginas como Sessões de farme acumularam vários deles e viraram parede de
// texto pra quem só quer ver o número. Fica disponível sob demanda, sem sumir de verdade.
export function toggleInfoBox(id) {
  if (AppState.openInfoBoxes[id]) delete AppState.openInfoBoxes[id];
  else AppState.openInfoBoxes[id] = true;
  renderPage();
}

// Helper de template: `id` precisa ser único na página (ex: 'sessions-history'). `html` é a
// mesma explicação que já existia, sem escapar (é texto do próprio app, não dado de usuário —
// igual a todo outro bloco de info já escrito direto em template literal).
export function infoToggle(id, html) {
  const open = !!AppState.openInfoBoxes[id];
  return `<div style="margin-bottom:12px">
    <button type="button" onclick="toggleInfoBox('${id}')" style="background:transparent;border:none;color:var(--muted);font-size:11px;cursor:pointer;padding:0;display:flex;align-items:center;gap:5px">
      <i class="ti ti-info-circle"></i> ${open ? 'Esconder explicação' : 'Como funciona'}
    </button>
    ${open ? `<div style="font-size:12px;color:var(--muted);margin-top:8px;padding:8px 10px;background:var(--surf2);border:1px solid var(--border);border-radius:6px">${html}</div>` : ''}
  </div>`;
}
