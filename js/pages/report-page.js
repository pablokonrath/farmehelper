import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getItemPrice, getItemCategory, summarizeDropsByItem } from '../features/drops.js';
import { renderAlzValue } from '../utils/formatting.js';
import { esc, escAttr } from '../utils/escape.js';

const NO_CATEGORY_LABEL = 'Sem categoria';

// Atalho pro admin mestre gerenciar categorias sem sair do Relatório — mesma lista global e
// mesmas funções de antes (a página Admin em si foi removida), só colapsável e ao lado do que
// ela organiza.
function renderCategoryManagerCard() {
  if (!AppState.isMasterAdmin) return '';
  return `
<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
  <div style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleCategoryManager()">
    <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px"><i class="ti ti-category"></i>Gerenciar categorias <span style="font-size:11px;font-weight:400;color:var(--muted)">${AppState.itemCategories.length} categoria(s)</span></div>
    <i class="ti ti-chevron-${AppState.isCategoryManagerOpen ? 'up' : 'down'}" style="color:var(--muted)"></i>
  </div>
  ${AppState.isCategoryManagerOpen ? `<div style="border-top:1px solid var(--border);padding:14px 16px">
    ${!AppState.itemCategories.length ? '<div class="empty" style="padding:14px 0">Nenhuma categoria criada ainda.</div>' : `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
    ${AppState.itemCategories.map(name => `<span class="badge badge-acc" style="display:flex;align-items:center;gap:6px">${esc(name)}<button aria-label="Remover categoria ${esc(name)}" style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0;display:flex" onclick="removeItemCategory('${escAttr(name)}')"><i class="ti ti-x"></i></button></span>`).join('')}
    </div>`}
    <div class="row" style="margin-bottom:16px">
      <div style="flex:1"><label class="lbl">Nova categoria</label><input class="inp" id="newItemCategory" placeholder="ex: Sets"></div>
      <button class="btn btn-p" onclick="addItemCategory()"><i class="ti ti-plus"></i>Adicionar</button>
    </div>
    ${!AppState.knownItemNames.length ? '' : `
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Atribuir categoria aos itens já cadastrados:</div>
    <table><thead><tr><th>Item</th><th style="width:180px">Categoria</th></tr></thead><tbody>
    ${[...AppState.knownItemNames].sort((a, b) => a.localeCompare(b)).map(name => `<tr>
      <td>${esc(name)}</td>
      <td><select class="inp inp-sm" onchange="setItemCategoryAssignment('${escAttr(name)}', this.value)">
        <option value="">Sem categoria</option>
        ${AppState.itemCategories.map(cat => `<option value="${esc(cat)}"${AppState.itemCategoryAssignments[name] === cat ? ' selected' : ''}>${esc(cat)}</option>`).join('')}
      </select></td>
    </tr>`).join('')}
    </tbody></table>`}
  </div>` : ''}
</div>`;
}

export function renderReportPage() {
  const drops = getFilteredDrops();

  const dropsByCategory = {};
  drops.forEach(d => {
    const category = getItemCategory(d.name) || NO_CATEGORY_LABEL;
    (dropsByCategory[category] ??= []).push(d);
  });

  // "Sem categoria" sempre por último — o resto em ordem alfabética.
  const categories = Object.keys(dropsByCategory).sort((a, b) => {
    if (a === NO_CATEGORY_LABEL) return 1;
    if (b === NO_CATEGORY_LABEL) return -1;
    return a.localeCompare(b);
  });

  return `
<div class="pg-title"><i class="ti ti-notebook" style="color:var(--acc)"></i>Relatório</div>
<div class="pg-sub">Drops agrupados por categoria (gerencie logo abaixo), com base nos filtros da visão geral.</div>
<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
  <span style="font-size:13px;color:var(--txt2)">${drops.length.toLocaleString('pt-BR')} drops</span>
  <button class="btn btn-d btn-xs" onclick="exportDropsToCSV()" style="margin-left:auto"><i class="ti ti-download"></i>Exportar CSV</button>
</div>
${renderCategoryManagerCard()}
${!categories.length ? '<div class="empty" style="padding:60px">Nenhum dado carregado.</div>' :
categories.map(category => {
  const categoryDrops = dropsByCategory[category];
  const totalInCategory = categoryDrops.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  const rows = summarizeDropsByItem(categoryDrops);
  return `<div class="card"><div class="sh" style="margin-bottom:8px">
<div style="font-weight:600">${esc(category)} <span style="color:var(--muted);font-size:12px;font-weight:400">${categoryDrops.length} drops</span></div>
${totalInCategory ? renderAlzValue(totalInCategory, true) : ''}
</div><table><thead><tr><th>Item</th><th>Qtd total</th><th>Valor total</th></tr></thead><tbody>
${rows.map(r => `<tr>
  <td style="font-size:12px">${esc(r.name)}</td>
  <td>${r.qty}×</td>
  <td>${r.total ? renderAlzValue(r.total) : '<span style="color:var(--muted)">—</span>'}</td>
</tr>`).join('')}
</tbody></table></div>`;
}).join('')}`;
}
