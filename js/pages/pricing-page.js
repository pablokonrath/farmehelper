import { AppState } from '../state/app-state.js';
import { saveFilterKeywordsFlag } from '../state/persistence.js';
import { summarizeDropsByItem, getAllDrops } from '../features/drops.js';
import { renderAlzValue, formatNumber } from '../utils/formatting.js';
import { renderPage } from '../router.js';

const SUGGESTED_ITEM_NAMES = ['Nucleo de Aprimoramento', 'Set de Nucleo de Aprimoramento', 'Joia Enfraquecida', 'Nucleo Arcano (Alto)', 'Nucleo Arcano (Altissimo)'];

export function toggleFilterByKeywords(checked) {
  AppState.filterByTrackedKeywords = checked;
  saveFilterKeywordsFlag();
  renderPage();
}

export function renderPricingPage() {
  const allItems = summarizeDropsByItem(getAllDrops());
  const itemsWithoutPrice = allItems.filter(i => !i.price);
  // Sugestão combina os itens que o próprio usuário já dropou com o catálogo de nomes
  // conhecidos da guild inteira (known-item-names.php) — dá pra autocompletar o nome certo de
  // um item que outro jogador já cadastrou, mesmo sem nunca ter dropado ele ainda.
  const suggestionNames = [...new Set([...allItems.map(i => i.name), ...AppState.knownItemNames])].slice(0, 60);

  return `
<div class="pg-title">Cálculo de farme</div>
<div class="pg-sub">Cadastre o valor unitário dos itens em Alz — usado pra calcular o valor total do seu farme. O nome do item é compartilhado com a guild (facilita achar o nome certo), mas o preço é só seu: cada um vende pelo valor que quiser.</div>
<div class="card"><div class="ctitle"><i class="ti ti-plus"></i>Adicionar / atualizar item</div>
<div class="row" style="margin-bottom:10px">
  <div style="flex:1"><label class="lbl">Nome do item</label>
    <input class="inp" id="cN" placeholder="ex: Nucleo de Aprimoramento" list="sugg">
    <datalist id="sugg">${suggestionNames.map(name => `<option value="${name}">`).join('')}</datalist></div>
  <div style="width:165px"><label class="lbl">Valor (Alz)</label><input class="inp" id="cP" type="text" inputmode="numeric" placeholder="0" oninput="maskAlzInputLive(this)"></div>
  <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addItemPrice()"><i class="ti ti-plus"></i>Salvar</button></div>
</div>
<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
  <span style="font-size:12px;color:var(--muted)">Sugestões:</span>
  ${SUGGESTED_ITEM_NAMES.map(name => `<button onclick="document.getElementById('cN').value='${name}'" style="background:var(--acc-bg);color:var(--acc);border:1px solid var(--acc-border);border-radius:20px;padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit">+ ${name}</button>`).join('')}
</div></div>
${itemsWithoutPrice.length ? `<div class="notice"><i class="ti ti-alert-circle" style="flex-shrink:0;margin-top:1px"></i><div><strong>${itemsWithoutPrice.length} itens sem preço</strong> no FarmHub.<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${itemsWithoutPrice.slice(0, 6).map(i => `<span style="cursor:pointer;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:20px;padding:2px 9px;font-size:11px;color:var(--warn)" onclick="document.getElementById('cN').value='${i.name}'">${i.name} (${i.qty}×)</span>`).join('')}</div></div></div>` : ''}
<div class="card"><div class="ctitle"><i class="ti ti-list"></i>Itens cadastrados <span style="color:var(--muted);font-size:12px;font-weight:400">${Object.keys(AppState.itemPrices).length} itens</span></div>
${!Object.keys(AppState.itemPrices).length ? '<div class="empty">Nenhum item cadastrado ainda.</div>' : `
<table><thead><tr><th>Item</th><th>Valor</th><th style="width:90px">Ações</th></tr></thead><tbody>
${Object.entries(AppState.itemPrices).sort(([a], [b]) => a.localeCompare(b)).map(([name, price]) => AppState.editingItemPriceName === name ? `<tr style="background:var(--acc-bg)">
  <td>${name}</td>
  <td><input class="inp inp-sm" id="editItemPriceInput" type="text" inputmode="numeric" value="${price ? formatNumber(price) : ''}" style="width:140px" oninput="maskAlzInputLive(this)"></td>
  <td><div style="display:flex;gap:4px"><button class="btn btn-p btn-xs" onclick="saveItemPriceEdit('${name}')">Salvar</button><button class="btn btn-d btn-xs" onclick="cancelEditingItemPrice()">✕</button></div></td>
</tr>` : `<tr>
  <td>${name}</td><td>${renderAlzValue(price)}</td>
  <td><div style="display:flex;gap:4px"><button class="btn btn-d btn-xs" onclick="startEditingItemPrice('${name}')"><i class="ti ti-edit"></i></button><button class="btn btn-xs" style="background:var(--err-bg);color:var(--err);border:none" onclick="deleteItemPrice('${name}')"><i class="ti ti-trash"></i></button></div></td>
</tr>`).join('')}
</tbody></table>`}
</div>
<div class="card"><div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-filter"></i>Itens rastreados</div>
<label class="tgl"><input type="checkbox" ${AppState.filterByTrackedKeywords ? 'checked' : ''} onchange="toggleFilterByKeywords(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label></div>
<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Filtrar apenas itens rastreados<br><span style="font-size:11px">Quando ativo, só aparecem drops cujo nome contenha uma das palavras abaixo. Ative o alerta para receber notificação imediata (som + pop-up) quando um drop contendo a palavra aparecer. Configure preferências em <a href="#" onclick="navigateTo('alertas');return false" style="color:var(--acc)">Alertas</a> no menu lateral.</span></div>
${!AppState.trackedKeywords.length ? '<div class="empty" style="padding:14px 0">Nenhuma palavra rastreada ainda.</div>' : `
<table style="margin-bottom:12px"><thead><tr><th>Palavra rastreada</th><th style="width:110px"><i class="ti ti-bell"></i> Alerta</th><th style="width:40px">Ações</th></tr></thead><tbody>
${AppState.trackedKeywords.map(kw => `<tr>
  <td style="font-weight:500">${kw.word}</td>
  <td><label class="tgl"><input type="checkbox" ${kw.alertEnabled ? 'checked' : ''} onchange="toggleKeywordAlert('${kw.word}')"><div class="tgl-track"></div><div class="tgl-thumb"></div></label> <span style="font-size:11px;color:var(--muted)">${kw.alertEnabled ? 'ON' : 'OFF'}</span></td>
  <td><button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeTrackedKeyword('${kw.word}')"><i class="ti ti-x"></i></button></td>
</tr>`).join('')}
</tbody></table>`}
<div class="row">
  <div style="flex:1"><label class="lbl">Adicionar palavra</label><input class="inp" id="nKw" placeholder="ex: Fatal"></div>
  <button class="btn btn-p" onclick="addTrackedKeyword()"><i class="ti ti-plus"></i>Adicionar</button>
  <button class="btn btn-d" onclick="resetTrackedKeywords()">Restaurar padrão</button>
</div></div>`;
}
