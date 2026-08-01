import { AppState } from '../state/app-state.js';
import { computeCraftProgress } from '../features/craft.js';
import { getKnownSessionItemNames } from '../features/drop-source.js';
import { formatDateTimeBR } from '../utils/formatting.js';
import { esc } from '../utils/escape.js';

export function renderCraftPage() {
  const progress = computeCraftProgress();
  const progressById = {};
  progress.forEach(p => { progressById[p.id] = p; });
  const suggestions = getKnownSessionItemNames();

  const recipesCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-hammer"></i>Minhas receitas</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Conta os materiais que caíram nas suas sessões de DG desde o último aviso de "pronto pra craftar" daquela receita — não é estoque de verdade, só um contador que reinicia sozinho quando bate a meta.</div>
  ${!AppState.craftRecipes.length ? '<div class="empty">Nenhuma receita cadastrada ainda.</div>' : AppState.craftRecipes.map(recipe => {
    const p = progressById[recipe.id];
    return `<div style="padding:14px;background:var(--surf2);border:1px solid ${p?.ready ? 'var(--ok-border)' : 'var(--border)'};border-radius:8px;margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px">${esc(recipe.itemName)}
          ${p?.ready ? '<span class="badge badge-ok"><i class="ti ti-check"></i> Pronto pra craftar</span>' : ''}
        </div>
        <button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteCraftRecipe('${recipe.id}')" title="Excluir receita"><i class="ti ti-trash"></i></button>
      </div>
      ${!recipe.materials.length ? '<div class="empty" style="padding:8px 0">Nenhum material cadastrado ainda — adicione abaixo.</div>' : `
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
        ${p.materials.map((m, i) => {
          const pct = Math.min(100, Math.round((m.have / m.needed) * 100));
          return `<div style="display:flex;align-items:center;gap:10px">
            <div style="width:170px;font-size:13px">${esc(m.itemName)}</div>
            <div style="flex:1;height:8px;background:var(--surf);border-radius:4px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${m.ready ? 'var(--ok)' : 'var(--acc)'}"></div></div>
            <div style="width:70px;text-align:right;font-size:12px;font-weight:600;color:${m.ready ? 'var(--ok)' : 'var(--txt)'};font-variant-numeric:tabular-nums">${m.have}/${m.needed}</div>
            <button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:13px" onclick="removeCraftMaterial('${recipe.id}', ${i})" title="Remover material"><i class="ti ti-x"></i></button>
          </div>`;
        }).join('')}
      </div>`}
      <div class="row" style="align-items:flex-end">
        <div style="flex:1"><label class="lbl">Material</label><input class="inp" id="craftMatName-${recipe.id}" placeholder="Nome do item" list="craftMatSugg"></div>
        <div style="width:100px"><label class="lbl">Qtd. necessária</label><input class="inp" id="craftMatQty-${recipe.id}" type="number" min="1" value="1"></div>
        <button class="btn btn-d" onclick="addCraftMaterial('${recipe.id}')"><i class="ti ti-plus"></i>Adicionar</button>
      </div>
    </div>`;
  }).join('')}
  <datalist id="craftMatSugg">${suggestions.map(name => `<option value="${esc(name)}">`).join('')}</datalist>
  <div class="row" style="margin-top:4px">
    <div style="flex:1"><input class="inp" id="newCraftRecipeName" placeholder="Nome do item que vai craftar (ex: Espada Élfica +10)" onkeydown="if(event.key==='Enter')addCraftRecipe()"></div>
    <button class="btn btn-p" onclick="addCraftRecipe()"><i class="ti ti-plus"></i>Nova receita</button>
  </div>
</div>`;

  const historyCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-history"></i>Histórico de craft</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Toda vez que uma receita bate a meta, fica registrado aqui — com a quantidade reunida de cada material naquele momento.</div>
  ${!AppState.craftAlertHistory.length ? '<div class="empty">Nenhum craft completo ainda.</div>' : `
  <table><thead><tr><th>Quando</th><th>Item</th><th>Materiais reunidos</th></tr></thead><tbody>
  ${[...AppState.craftAlertHistory].reverse().map(entry => `<tr>
    <td style="white-space:nowrap">${formatDateTimeBR(entry.timestamp)}</td>
    <td style="font-weight:500">${esc(entry.recipeName)}</td>
    <td style="font-size:12px;color:var(--muted)">${entry.materials.map(m => `${esc(m.itemName)} ×${m.quantity}`).join(', ')}</td>
  </tr>`).join('')}
  </tbody></table>`}
</div>`;

  return `
<div class="pg-title"><i class="ti ti-hammer" style="color:var(--acc)"></i>Craft</div>
<div class="pg-sub">Cadastre o que precisa pra craftar um item e o sistema acompanha quanto já caiu de cada material nas suas sessões de DG, avisando quando bater a meta.</div>
${recipesCard}
${historyCard}`;
}
