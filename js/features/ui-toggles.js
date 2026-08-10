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

// Card inteiro colapsável. Diferente do infoToggle (que esconde só a explicação), esse guarda o
// conteúdo todo — usado em cards de consulta/motivação que não precisam estar abertos o tempo
// todo e que, somados, empurravam o resto da página pra baixo no celular.
export function toggleCard(id) {
  if (AppState.openCards[id]) delete AppState.openCards[id];
  else AppState.openCards[id] = true;
  renderPage();
}

// `resumo` é o que fica VISÍVEL no cabeçalho mesmo fechado — é o que separa "colapsado" de
// "escondido": você continua vendo o número que importa e só abre pra ver o detalhe.
export function collapsibleCard({ id, icon, iconColor, title, resumo = '', body, defaultOpen = false }) {
  const open = AppState.openCards[id] ?? defaultOpen;
  return `
<div class="card" style="padding:0;overflow:hidden">
  <div style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:10px" onclick="toggleCard('${id}')">
    <i class="ti ${icon}"${iconColor ? ` style="color:${iconColor}"` : ''}></i>
    <span style="font-family:var(--font-display);font-size:var(--fs-md);font-weight:700;letter-spacing:.6px;text-transform:uppercase">${title}</span>
    ${resumo ? `<span style="margin-left:auto;display:flex;align-items:center;gap:10px">${resumo}</span>` : '<span style="margin-left:auto"></span>'}
    <i class="ti ti-chevron-${open ? 'up' : 'down'}" style="color:var(--muted)"></i>
  </div>
  ${open ? `<div style="border-top:1px solid var(--border);padding:14px 16px">${body}</div>` : ''}
</div>`;
}
