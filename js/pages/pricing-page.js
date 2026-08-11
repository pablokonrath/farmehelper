import { AppState } from '../state/app-state.js';
import { saveFilterKeywordsFlag } from '../state/persistence.js';
import { summarizeDropsByItem, getAllDrops } from '../features/drops.js';
import { daysSincePriceUpdate } from '../features/sales.js';
import { renderAlzValue, formatNumber } from '../utils/formatting.js';
import { esc, escAttr } from '../utils/escape.js';
import { renderPage } from '../router.js';

const SUGGESTED_ITEM_NAMES = ['Nucleo de Aprimoramento', 'Set de Nucleo de Aprimoramento', 'Joia Enfraquecida', 'Nucleo Arcano (Alto)', 'Nucleo Arcano (Altissimo)'];

export function toggleFilterByKeywords(checked) {
  AppState.filterByTrackedKeywords = checked;
  saveFilterKeywordsFlag();
  renderPage();
}

// Coluna "Atualizado" da lista de preços: sinaliza (sem bloquear nada) quando um preço não é
// revisto há mais de 2 semanas — o único jeito de "confirmar" é editando (mesmo que pelo mesmo
// valor só muda o número), já que é a mesma ação que qualquer atualização de preço de verdade.
const STALE_PRICE_DAYS = 14;
function priceAgeCell(name) {
  const days = daysSincePriceUpdate(name);
  const stale = days != null && days > STALE_PRICE_DAYS;
  const label = days == null ? '—' : days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
  return `<td style="font-size:12px;color:${stale ? 'var(--warn)' : 'var(--muted)'}">${label}${stale ? ` <i class="ti ti-alert-triangle" title="Sem atualizar há mais de ${STALE_PRICE_DAYS} dias — confira se ainda bate com o mercado"></i>` : ''}</td>`;
}

export function renderPricingPage() {
  const allItems = summarizeDropsByItem(getAllDrops());
  const itemsWithoutPrice = allItems.filter(i => !i.price);
  // Sugestão combina os itens que o próprio usuário já dropou com o catálogo de nomes já
  // precificados antes (known-item-names.php) — autocompleta o nome certo de um item que já
  // foi cadastrado alguma vez, mesmo sem ter dropado de novo agora.
  const suggestionNames = [...new Set([...allItems.map(i => i.name), ...AppState.knownItemNames])].slice(0, 60);

  return `
<div class="pg-title"><i class="ti ti-coins" style="color:var(--acc)"></i>Cálculo de farme</div>
<div class="pg-sub">Cadastre o valor unitário dos itens em Alz — usado pra calcular o valor total do seu farme.</div>
<div class="card card-featured"><div class="ctitle"><i class="ti ti-plus"></i>Adicionar / atualizar item</div>
<div class="row" style="margin-bottom:10px">
  <div style="flex:1"><label class="lbl">Nome do item</label>
    <input class="inp" id="cN" placeholder="ex: Nucleo de Aprimoramento" list="sugg">
    <datalist id="sugg">${suggestionNames.map(name => `<option value="${esc(name)}">`).join('')}</datalist></div>
  <div style="width:165px"><label class="lbl">Valor (Alz)</label><input class="inp" id="cP" type="text" inputmode="numeric" placeholder="0" oninput="maskAlzInputLive(this)"></div>
  <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addItemPrice()"><i class="ti ti-plus"></i>Salvar</button></div>
</div>
<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
  <span style="font-size:12px;color:var(--muted)">Sugestões:</span>
  ${SUGGESTED_ITEM_NAMES.map(name => `<button onclick="document.getElementById('cN').value='${name}'" style="background:var(--acc-bg);color:var(--acc);border:1px solid var(--acc-border);border-radius:20px;padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit">+ ${name}</button>`).join('')}
</div></div>
${itemsWithoutPrice.length ? `<div class="notice"><i class="ti ti-alert-circle" style="flex-shrink:0;margin-top:1px"></i><div><strong>${itemsWithoutPrice.length} itens sem preço</strong> no FarmHub.<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${itemsWithoutPrice.slice(0, 6).map(i => `<span style="cursor:pointer;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:20px;padding:2px 9px;font-size:11px;color:var(--warn)" onclick="document.getElementById('cN').value='${escAttr(i.name)}'">${esc(i.name)} (${i.qty}×)</span>`).join('')}</div></div></div>` : ''}
<div class="card"><div class="ctitle"><i class="ti ti-list"></i>Itens cadastrados <span style="color:var(--muted);font-size:12px;font-weight:400">${Object.keys(AppState.itemPrices).length} itens</span></div>
${!Object.keys(AppState.itemPrices).length ? '<div class="empty">Nenhum item cadastrado ainda.</div>' : `
<table><thead><tr><th>Item</th><th>Valor</th><th>Atualizado</th><th style="width:90px">Ações</th></tr></thead><tbody>
${Object.entries(AppState.itemPrices).sort(([a], [b]) => a.localeCompare(b)).map(([name, price]) => AppState.editingItemPriceName === name ? `<tr style="background:var(--acc-bg)">
  <td>${esc(name)}</td>
  <td><input class="inp inp-sm" id="editItemPriceInput" type="text" inputmode="numeric" value="${price ? formatNumber(price) : ''}" style="width:140px" oninput="maskAlzInputLive(this)"></td>
  ${priceAgeCell(name)}
  <td><div style="display:flex;gap:4px"><button class="btn btn-p btn-xs" onclick="saveItemPriceEdit('${escAttr(name)}')">Salvar</button><button class="btn btn-d btn-xs" onclick="cancelEditingItemPrice()">✕</button></div></td>
</tr>` : `<tr>
  <td>${esc(name)}</td><td>${renderAlzValue(price)}</td>
  ${priceAgeCell(name)}
  <td><div style="display:flex;gap:4px"><button class="btn btn-d btn-xs" aria-label="Editar preço de ${esc(name)}" title="Editar" onclick="startEditingItemPrice('${escAttr(name)}')"><i class="ti ti-edit"></i></button><button class="btn btn-xs" aria-label="Remover preço de ${esc(name)}" title="Remover" style="background:var(--err-bg);color:var(--err);border:none" onclick="deleteItemPrice('${escAttr(name)}')"><i class="ti ti-trash"></i></button></div></td>
</tr>`).join('')}
</tbody></table>`}
</div>
<div class="card"><div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-filter"></i>Itens rastreados</div>
<label class="tgl"><input type="checkbox" aria-label="Filtrar apenas itens rastreados" ${AppState.filterByTrackedKeywords ? 'checked' : ''} onchange="toggleFilterByKeywords(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label></div>
<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Filtrar apenas itens rastreados<br><span style="font-size:11px">Quando ativo, só aparecem drops cujo nome contenha uma das palavras abaixo. Ative o alerta para receber notificação imediata (som + pop-up) quando um drop contendo a palavra aparecer. Configure preferências em <a href="#" onclick="navigateTo('alertas');return false" style="color:var(--acc)">Alertas</a> no menu lateral.</span></div>
${!AppState.trackedKeywords.length ? '<div class="empty" style="padding:14px 0">Nenhuma palavra rastreada ainda.</div>' : `
<table style="margin-bottom:12px"><thead><tr><th>Palavra rastreada</th><th style="width:110px"><i class="ti ti-bell"></i> Alerta</th><th style="width:40px">Ações</th></tr></thead><tbody>
${AppState.trackedKeywords.map(kw => `<tr>
  <td style="font-weight:500">${esc(kw.word)}</td>
  <td><label class="tgl"><input type="checkbox" aria-label="Alerta pra ${esc(kw.word)}" ${kw.alertEnabled ? 'checked' : ''} onchange="toggleKeywordAlert('${escAttr(kw.word)}')"><div class="tgl-track"></div><div class="tgl-thumb"></div></label> <span style="font-size:11px;color:var(--muted)">${kw.alertEnabled ? 'ON' : 'OFF'}</span></td>
  <td><button aria-label="Remover palavra ${esc(kw.word)}" title="Remover" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeTrackedKeyword('${escAttr(kw.word)}')"><i class="ti ti-x"></i></button></td>
</tr>`).join('')}
</tbody></table>`}
<div class="row">
  <div style="flex:1"><label class="lbl">Adicionar palavra</label><input class="inp" id="nKw" placeholder="ex: Fatal"></div>
  <button class="btn btn-p" onclick="addTrackedKeyword()"><i class="ti ti-plus"></i>Adicionar</button>
  <button class="btn btn-d" onclick="resetTrackedKeywords()">Restaurar padrão</button>
</div></div>`;
}
