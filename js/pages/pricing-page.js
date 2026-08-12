import { AppState } from '../state/app-state.js';
import { saveFilterKeywordsFlag } from '../state/persistence.js';
import { summarizeDropsByItem, getAllDrops, isFixedPriceItem, hasRegisteredPrice, getItemCategory } from '../features/drops.js';
import { daysSincePriceUpdate, STALE_PRICE_DAYS, getSalePriceHistory, getPriceOrigin } from '../features/sales.js';
import { renderAlzValue, formatNumber, formatDateBR } from '../utils/formatting.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { esc, escAttr } from '../utils/escape.js';
import { renderPage } from '../router.js';

const SUGGESTED_ITEM_NAMES = ['Nucleo de Aprimoramento', 'Set de Nucleo de Aprimoramento', 'Joia Enfraquecida', 'Nucleo Arcano (Alto)', 'Nucleo Arcano (Altissimo)'];

export function toggleFilterByKeywords(checked) {
  AppState.filterByTrackedKeywords = checked;
  saveFilterKeywordsFlag();
  renderPage();
}

export function setPricingSearchQuery(value) {
  AppState.pricingSearchQuery = value;
  renderPage();
}

// Direção padrão ao trocar de coluna — pensada pro primeiro clique já mostrar o que mais importa
// SEM precisar de um segundo clique pra inverter: nome em ordem alfabética, valor do maior pro
// menor (os itens que mais pesam no farme primeiro), atualizado do mais velho pro mais novo (fila
// de revisão de verdade — o que precisa de atenção sobe pro topo).
const DEFAULT_SORT_DIR = { name: 'asc', price: 'desc', updated: 'desc' };

export function setPricingSort(field) {
  if (AppState.pricingSortBy === field) {
    AppState.pricingSortDir = AppState.pricingSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    AppState.pricingSortBy = field;
    AppState.pricingSortDir = DEFAULT_SORT_DIR[field] || 'asc';
  }
  renderPage();
}

export function togglePricingShowAllMissing() {
  AppState.pricingShowAllMissing = !AppState.pricingShowAllMissing;
  renderPage();
}

// "Há quanto tempo desatualizado" como número comparável pra ordenar a coluna "Atualizado": item
// nunca revisado (sem histórico) é o MAIS urgente possível (Infinity), item de preço fixo do jogo
// nunca é urgente (fica sempre por último quando ordenado do mais urgente pro menos).
function pricingUrgency(name) {
  if (isFixedPriceItem(name)) return -1;
  const days = daysSincePriceUpdate(name);
  return days == null ? Infinity : days;
}

// Coluna "Atualizado" da lista de preços: sinaliza (sem bloquear nada) quando um preço não é
// revisto há mais de 2 semanas — o único jeito de "confirmar" é editando (mesmo que pelo mesmo
// valor só muda o número), já que é a mesma ação que qualquer atualização de preço de verdade.
//
// Itens de preço fixo (ex: Joia Enfraquecida, tabelada pelo próprio jogo) nunca acionam esse
// aviso — não é o jogador que revisa esse preço contra o mercado, então "sem revisar há muito
// tempo" não significa nada de errado, significa só que o preço nunca precisou mudar.
function priceAgeCell(name) {
  if (isFixedPriceItem(name)) {
    return `<td style="font-size:12px;color:var(--muted)"><i class="ti ti-lock"></i> Fixo (jogo)</td>`;
  }
  const days = daysSincePriceUpdate(name);
  const stale = days != null && days > STALE_PRICE_DAYS;
  const label = days == null ? '—' : days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
  return `<td style="font-size:12px;color:${stale ? 'var(--warn)' : 'var(--muted)'}">${label}${stale ? ` <i class="ti ti-alert-triangle" title="Sem atualizar há mais de ${STALE_PRICE_DAYS} dias — confira se ainda bate com o mercado"></i>` : ''}</td>`;
}

// Seta indicando a coluna/direção ativa — só na coluna clicada, o resto fica neutro.
function sortArrow(field) {
  if (AppState.pricingSortBy !== field) return '';
  return AppState.pricingSortDir === 'asc' ? ' ▲' : ' ▼';
}

function sortableHeader(field, label, extraStyle = '') {
  return `<th style="cursor:pointer;user-select:none${extraStyle ? ';' + extraStyle : ''}" onclick="setPricingSort('${field}')" title="Ordenar por ${label}">${label}${sortArrow(field)}</th>`;
}

export function renderPricingPage() {
  const allItems = summarizeDropsByItem(getAllDrops());
  const itemsWithoutPrice = allItems.filter(i => !hasRegisteredPrice(i.name));
  // Sugestão combina os itens que o próprio usuário já dropou com o catálogo de nomes já
  // precificados antes (known-item-names.php) — autocompleta o nome certo de um item que já
  // foi cadastrado alguma vez, mesmo sem ter dropado de novo agora.
  const suggestionNames = [...new Set([...allItems.map(i => i.name), ...AppState.knownItemNames])].slice(0, 60);

  const priceEntries = Object.entries(AppState.itemPrices);
  const totalItems = priceEntries.length;
  const staleCount = priceEntries.filter(([name]) => !isFixedPriceItem(name) && (daysSincePriceUpdate(name) ?? 0) > STALE_PRICE_DAYS).length;

  const kpis = `
<div class="g3" style="margin-bottom:12px">
  <div class="kpi"><div class="kpi-lbl">Itens cadastrados</div><div class="kpi-val" style="font-size:22px">${totalItems}</div><div class="kpi-sub">com valor unitário definido</div></div>
  <div class="kpi"><div class="kpi-lbl">Sem preço</div><div class="kpi-val" style="font-size:22px;color:${itemsWithoutPrice.length ? 'var(--warn)' : 'var(--ok)'}">${itemsWithoutPrice.length}</div><div class="kpi-sub">${itemsWithoutPrice.length ? 'precisam de valor' : 'tudo coberto'}</div></div>
  <div class="kpi"><div class="kpi-lbl">Desatualizados</div><div class="kpi-val" style="font-size:22px;color:${staleCount ? 'var(--warn)' : 'var(--ok)'}">${staleCount}</div><div class="kpi-sub">sem revisar há +${STALE_PRICE_DAYS}d</div></div>
</div>`;

  const missingShown = AppState.pricingShowAllMissing ? itemsWithoutPrice : itemsWithoutPrice.slice(0, 6);
  const missingNotice = !itemsWithoutPrice.length ? '' : `<div class="notice"><i class="ti ti-alert-circle" style="flex-shrink:0;margin-top:1px"></i><div><strong>${itemsWithoutPrice.length} itens sem preço</strong> no FarmHub.<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${missingShown.map(i => `<span style="cursor:pointer;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:20px;padding:2px 9px;font-size:11px;color:var(--warn)" onclick="document.getElementById('cN').value='${escAttr(i.name)}';document.getElementById('cP')?.focus()">${esc(i.name)} (${i.qty}×)</span>`).join('')}${itemsWithoutPrice.length > 6 ? `<button onclick="togglePricingShowAllMissing()" style="background:transparent;border:none;color:var(--warn);text-decoration:underline;font-size:11px;cursor:pointer;padding:2px 4px">${AppState.pricingShowAllMissing ? 'Ver menos' : `Ver todos (${itemsWithoutPrice.length})`}</button>` : ''}</div></div></div>`;

  // Busca (por nome, sem acento/maiúscula) + ordenação (nome/valor/atualizado, clique no cabeçalho
  // inverte a direção) — sem isso, uma lista de dezenas de itens só dava pra vasculhar rolando a
  // página inteira em ordem alfabética fixa.
  const searchKey = normalizeForSearch(AppState.pricingSearchQuery.trim());
  const filteredEntries = priceEntries.filter(([name]) => !searchKey || normalizeForSearch(name).includes(searchKey));
  const dir = AppState.pricingSortDir === 'desc' ? -1 : 1;
  filteredEntries.sort(([nameA, priceA], [nameB, priceB]) => {
    if (AppState.pricingSortBy === 'price') return (priceA - priceB) * dir;
    if (AppState.pricingSortBy === 'updated') return (pricingUrgency(nameA) - pricingUrgency(nameB)) * dir;
    return nameA.localeCompare(nameB) * dir;
  });

  return `
<div class="pg-title"><i class="ti ti-coins" style="color:var(--acc)"></i>Cálculo de farme</div>
<div class="pg-sub">Cadastre o valor unitário dos itens em Alz — usado pra calcular o valor total do seu farme.</div>
${kpis}
<div class="card card-featured"><div class="ctitle"><i class="ti ti-plus"></i>Adicionar / atualizar item</div>
<div class="row" style="margin-bottom:10px">
  <div style="flex:1"><label class="lbl">Nome do item</label>
    <input class="inp" id="cN" placeholder="ex: Nucleo de Aprimoramento" list="sugg" onkeydown="if(event.key==='Enter')addItemPrice()">
    <datalist id="sugg">${suggestionNames.map(name => `<option value="${esc(name)}">`).join('')}</datalist></div>
  <div style="width:165px"><label class="lbl">Valor (Alz)</label><input class="inp" id="cP" type="text" inputmode="numeric" placeholder="0" oninput="maskAlzInputLive(this)" onkeydown="if(event.key==='Enter')addItemPrice()"></div>
  <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addItemPrice()"><i class="ti ti-plus"></i>Salvar</button></div>
</div>
<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
  <span style="font-size:12px;color:var(--muted)">Sugestões:</span>
  ${SUGGESTED_ITEM_NAMES.map(name => `<button onclick="document.getElementById('cN').value='${name}'" style="background:var(--acc-bg);color:var(--acc);border:1px solid var(--acc-border);border-radius:20px;padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit">+ ${name}</button>`).join('')}
</div></div>
${missingNotice}
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-list"></i>Itens cadastrados <span style="color:var(--muted);font-size:12px;font-weight:400">${totalItems} itens${searchKey ? `, ${filteredEntries.length} exibido(s)` : ''}</span></div>
    ${totalItems > 5 ? `<input class="inp inp-sm" style="width:200px" placeholder="Buscar item..." value="${esc(AppState.pricingSearchQuery)}" oninput="setPricingSearchQuery(this.value)">` : ''}
  </div>
${!totalItems ? '<div class="empty">Nenhum item cadastrado ainda.</div>' : !filteredEntries.length ? '<div class="empty">Nenhum item cadastrado bate com essa busca.</div>' : `
<table><thead><tr>${sortableHeader('name', 'Item')}${sortableHeader('price', 'Valor')}${sortableHeader('updated', 'Atualizado')}<th style="width:90px">Ações</th></tr></thead><tbody>
${filteredEntries.map(([name, price]) => {
  const category = getItemCategory(name);
  const categoryBadge = category ? ` <span class="badge badge-muted" style="font-size:10px;font-weight:400">${esc(category)}</span>` : '';
  // Preço confirmado por venda real vale mais que estimativa digitada — sem o selo, os dois
  // números pareciam ter o mesmo peso na hora de decidir em qual confiar.
  const origem = getPriceOrigin(name);
  const originBadge = origem.origem === 'venda'
    ? ` <i class="ti ti-circle-check" style="color:var(--ok);font-size:12px" title="${esc(origem.rotulo)}"></i>`
    : ` <i class="ti ti-pencil" style="color:var(--muted);font-size:11px" title="${esc(origem.rotulo)}"></i>`;
  if (AppState.editingItemPriceName === name) {
    const lastSale = getSalePriceHistory(name).slice(-1)[0];
    return `<tr style="background:var(--acc-bg)">
  <td>${esc(name)}${originBadge}${categoryBadge}</td>
  <td><input class="inp inp-sm" id="editItemPriceInput" type="text" inputmode="numeric" value="${price ? formatNumber(price) : ''}" style="width:140px" oninput="maskAlzInputLive(this)" onkeydown="if(event.key==='Enter')saveItemPriceEdit('${escAttr(name)}')">
    ${lastSale ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">Última venda: ${renderAlzValue(lastSale.price)} em ${formatDateBR(lastSale.date)}</div>` : ''}</td>
  ${priceAgeCell(name)}
  <td><div style="display:flex;gap:4px"><button class="btn btn-p btn-xs" onclick="saveItemPriceEdit('${escAttr(name)}')">Salvar</button><button class="btn btn-d btn-xs" onclick="cancelEditingItemPrice()">✕</button></div></td>
</tr>`;
  }
  return `<tr>
  <td>${esc(name)}${originBadge}${categoryBadge}</td><td>${renderAlzValue(price)}</td>
  ${priceAgeCell(name)}
  <td><div style="display:flex;gap:4px"><button class="btn btn-d btn-xs" aria-label="Editar preço de ${esc(name)}" title="Editar" onclick="startEditingItemPrice('${escAttr(name)}')"><i class="ti ti-edit"></i></button><button class="btn btn-xs" aria-label="Remover preço de ${esc(name)}" title="Remover" style="background:var(--err-bg);color:var(--err);border:none" onclick="deleteItemPrice('${escAttr(name)}')"><i class="ti ti-trash"></i></button></div></td>
</tr>`;
}).join('')}
</tbody></table>`}
</div>
<div class="card"><div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-filter"></i>Filtro: só itens rastreados</div>
<label class="tgl"><input type="checkbox" aria-label="Filtrar apenas itens rastreados" ${AppState.filterByTrackedKeywords ? 'checked' : ''} onchange="toggleFilterByKeywords(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label></div>
<div style="font-size:12px;color:var(--muted)">Quando ativo, só aparecem nesta página os itens cujo nome contenha uma das suas palavras rastreadas — não mexe em nenhum outro filtro do app. Gerencie as palavras rastreadas e os alertas em <a href="#" onclick="navigateTo('alertas');return false" style="color:var(--acc)">Alertas</a>.</div>
</div>`;
}
