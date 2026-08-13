import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getItemPrice, getItemCategory, getAllCategoryNames, summarizeDropsByItem } from '../features/drops.js';
import { getHistoricalSummary } from '../features/drop-history.js';
import { renderAlzValue, formatAlzGamer } from '../utils/formatting.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { esc, escAttr } from '../utils/escape.js';

const NO_CATEGORY_LABEL = 'Sem categoria';

// Atalho pro admin mestre gerenciar categorias sem sair do Relatório — mesma lista global e
// mesmas funções de antes (a página Admin em si foi removida), só colapsável e ao lado do que
// ela organiza.
function renderCategoryManagerCard() {
  if (!AppState.isMasterAdmin) return '';
  const searchKey = normalizeForSearch(AppState.categoryAssignSearchQuery.trim());
  const knownNames = [...AppState.knownItemNames].sort((a, b) => a.localeCompare(b));
  const filteredNames = searchKey ? knownNames.filter(name => normalizeForSearch(name).includes(searchKey)) : knownNames;

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
    ${!AppState.itemCategories.length ? '' : `
    <div style="padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px;margin-bottom:16px">
      <label class="lbl" style="margin-bottom:6px">Atribuir em massa por palavra-chave</label>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Categoriza de uma vez todo item cadastrado cujo nome contém a palavra — em vez de escolher item por item na tabela abaixo.</div>
      <div class="row">
        <select class="inp" id="bulkCatSelect" style="width:180px">
          ${AppState.itemCategories.map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('')}
        </select>
        <input class="inp" id="bulkCatKeyword" placeholder="ex: Nucleo" style="flex:1" onkeydown="if(event.key==='Enter')bulkAssignCategoryByKeyword(document.getElementById('bulkCatSelect').value, this.value)">
        <button class="btn btn-d btn-xs" onclick="bulkAssignCategoryByKeyword(document.getElementById('bulkCatSelect').value, document.getElementById('bulkCatKeyword').value)"><i class="ti ti-wand"></i>Aplicar em massa</button>
      </div>
    </div>`}
    ${!knownNames.length ? '' : `
    <div class="row" style="margin-bottom:8px;align-items:center">
      <div style="font-size:12px;color:var(--muted);flex:1">Atribuir categoria item a item:</div>
      ${knownNames.length > 8 ? `<input class="inp inp-sm" style="width:200px" placeholder="Buscar item..." value="${esc(AppState.categoryAssignSearchQuery)}" oninput="setCategoryAssignSearchQuery(this.value)">` : ''}
    </div>
    ${!filteredNames.length ? '<div class="empty" style="padding:10px 0">Nenhum item bate com essa busca.</div>' : `
    <table><thead><tr><th>Item</th><th style="width:180px">Categoria</th></tr></thead><tbody>
    ${filteredNames.map(name => `<tr>
      <td>${esc(name)}</td>
      <td><select class="inp inp-sm" onchange="setItemCategoryAssignment('${escAttr(name)}', this.value)">
        <option value="">Sem categoria</option>
        ${AppState.itemCategories.map(cat => `<option value="${esc(cat)}"${AppState.itemCategoryAssignments[name] === cat ? ' selected' : ''}>${esc(cat)}</option>`).join('')}
      </select></td>
    </tr>`).join('')}
    </tbody></table>`}`}
  </div>` : ''}
</div>`;
}

// Minhas categorias — o espelho pessoal do card de admin acima, disponível pra QUALQUER conta.
// Categorizar é preferência de organização de cada um; antes dependia do admin mestre, o que
// tornava o Relatório praticamente inútil pra qualquer outro jogador.
function renderPersonalCategoryCard() {
  const searchKey = normalizeForSearch(AppState.categoryAssignSearchQuery.trim());
  const knownNames = [...AppState.knownItemNames].sort((a, b) => a.localeCompare(b));
  const filteredNames = searchKey ? knownNames.filter(name => normalizeForSearch(name).includes(searchKey)) : knownNames;
  const todas = getAllCategoryNames();

  return `
<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
  <div style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="togglePersonalCategoryManager()">
    <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px"><i class="ti ti-user-cog"></i>Minhas categorias <span style="font-size:11px;font-weight:400;color:var(--muted)">${AppState.personalCategories.length} sua(s)${AppState.itemCategories.length ? ` + ${AppState.itemCategories.length} global(is)` : ''}</span></div>
    <i class="ti ti-chevron-${AppState.isPersonalCategoryManagerOpen ? 'up' : 'down'}" style="color:var(--muted)"></i>
  </div>
  ${AppState.isPersonalCategoryManagerOpen ? `<div style="border-top:1px solid var(--border);padding:14px 16px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Categorias suas, que ninguém mais vê. A sua escolha vale <strong>por cima</strong> da categoria global do mesmo item — deixe "Seguir a global" pra voltar ao padrão.</div>
    ${!AppState.personalCategories.length ? '' : `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
    ${AppState.personalCategories.map(name => `<span class="badge badge-acc" style="display:flex;align-items:center;gap:6px">${esc(name)}<button aria-label="Remover categoria ${esc(name)}" style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0;display:flex" onclick="removePersonalCategory('${escAttr(name)}')"><i class="ti ti-x"></i></button></span>`).join('')}
    </div>`}
    <div class="row" style="margin-bottom:16px">
      <div style="flex:1"><label class="lbl">Nova categoria minha</label><input class="inp" id="newPersonalCategory" placeholder="ex: Insumos de craft" onkeydown="if(event.key==='Enter')addPersonalCategory()"></div>
      <button class="btn btn-p" onclick="addPersonalCategory()"><i class="ti ti-plus"></i>Adicionar</button>
    </div>
    ${!todas.length ? '<div class="empty" style="padding:14px 0">Crie uma categoria acima pra começar a organizar.</div>' : `
    <div style="padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px;margin-bottom:16px">
      <label class="lbl" style="margin-bottom:6px">Atribuir em massa por palavra-chave</label>
      <div class="row">
        <select class="inp" id="bulkPersonalCatSelect" style="width:180px">
          ${todas.map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('')}
        </select>
        <input class="inp" id="bulkPersonalCatKeyword" placeholder="ex: Nucleo" style="flex:1" onkeydown="if(event.key==='Enter')bulkAssignPersonalCategoryByKeyword(document.getElementById('bulkPersonalCatSelect').value, this.value)">
        <button class="btn btn-d btn-xs" onclick="bulkAssignPersonalCategoryByKeyword(document.getElementById('bulkPersonalCatSelect').value, document.getElementById('bulkPersonalCatKeyword').value)"><i class="ti ti-wand"></i>Aplicar</button>
      </div>
    </div>
    ${!knownNames.length ? '' : `
    <div class="row" style="margin-bottom:8px;align-items:center">
      <div style="font-size:12px;color:var(--muted);flex:1">Atribuir item a item:</div>
      ${knownNames.length > 8 ? `<input class="inp inp-sm" style="width:200px" placeholder="Buscar item..." value="${esc(AppState.categoryAssignSearchQuery)}" oninput="setCategoryAssignSearchQuery(this.value)">` : ''}
    </div>
    ${!filteredNames.length ? '<div class="empty" style="padding:10px 0">Nenhum item bate com essa busca.</div>' : `
    <table><thead><tr><th>Item</th><th style="width:200px">Minha categoria</th></tr></thead><tbody>
    ${filteredNames.map(name => {
      const global = AppState.itemCategoryAssignments[name];
      return `<tr>
      <td>${esc(name)}${global ? ` <span class="badge badge-muted" style="font-size:10px;font-weight:400" title="Categoria global deste item">${esc(global)}</span>` : ''}</td>
      <td><select class="inp inp-sm" onchange="setPersonalCategoryAssignment('${escAttr(name)}', this.value)">
        <option value="">${global ? 'Seguir a global' : 'Sem categoria'}</option>
        ${todas.map(cat => `<option value="${esc(cat)}"${AppState.personalCategoryAssignments[name] === cat ? ' selected' : ''}>${esc(cat)}</option>`).join('')}
      </select></td>
    </tr>`;
    }).join('')}
    </tbody></table>`}`}`}
  </div>` : ''}
</div>`;
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// offsetMonths=0 é o mês corrente (do dia 1 até hoje); -1 é o mês civil anterior completo (do
// dia 1 ao último dia). "Civil" de propósito — diferente do bloco rolante de N dias que "Sua
// evolução" (Visão geral) já faz; aqui é o calendário mesmo, o corte que "relatório mensal" evoca.
function monthRange(offsetMonths) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const to = offsetMonths === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
  return { from: isoDate(from), to: isoDate(to) };
}

const MONTH_LABEL_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
function monthLabel(offsetMonths) {
  const now = new Date();
  return MONTH_LABEL_FMT.format(new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1));
}

// Mês corrente × mês civil anterior, por CATEGORIA — o ângulo que só esta página pode dar (Sua
// evolução, na Visão geral, já compara período a período, mas só no agregado, sem quebrar por
// categoria). Sempre olha tudo (ignora o filtro De/Até e "só rastreados" desta página, igual Sua
// evolução ignora o dela) — comparar dois meses inteiros perderia sentido recortado por um filtro
// pensado pra outro período.
function computeCategoryPeriodComparison() {
  const current = monthRange(0);
  const previous = monthRange(-1);
  const sumByCategory = (from, to) => {
    const { items } = getHistoricalSummary(from, to, { respeitarFiltrosDaPagina: false });
    const byCat = {};
    items.forEach(it => {
      const cat = getItemCategory(it.name) || NO_CATEGORY_LABEL;
      byCat[cat] = (byCat[cat] || 0) + it.total;
    });
    return byCat;
  };
  const curr = sumByCategory(current.from, current.to);
  const prev = sumByCategory(previous.from, previous.to);
  const rows = [...new Set([...Object.keys(curr), ...Object.keys(prev)])]
    .map(category => {
      const currentTotal = curr[category] || 0;
      const previousTotal = prev[category] || 0;
      const diff = currentTotal - previousTotal;
      const diffPct = previousTotal > 0 ? (diff / previousTotal) * 100 : null; // null = sem base (novo)
      return { category, currentTotal, previousTotal, diff, diffPct };
    })
    .sort((a, b) => b.currentTotal - a.currentTotal);
  return { rows, hasAny: rows.some(r => r.currentTotal > 0 || r.previousTotal > 0) };
}

function renderCategoryComparisonCard() {
  const { rows, hasAny } = computeCategoryPeriodComparison();
  if (!hasAny) return '';
  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-calendar-stats"></i>${monthLabel(0)} vs ${monthLabel(-1)}, por categoria</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Mês civil inteiro (não o bloco de dias de "Sua evolução" na Visão geral) — sempre olha tudo, ignora o filtro De/Até e "só rastreados" desta página, pra comparar os dois meses por igual. "Novo" = não farmou nada dessa categoria no mês passado, sem base pra calcular variação.</div>
  <table><thead><tr><th>Categoria</th><th>${monthLabel(0)}</th><th>${monthLabel(-1)}</th><th>Variação</th></tr></thead><tbody>
  ${rows.map(r => `<tr>
    <td style="font-weight:500">${esc(r.category)}</td>
    <td>${r.currentTotal ? renderAlzValue(r.currentTotal) : '<span style="color:var(--muted)">—</span>'}</td>
    <td style="color:var(--muted)">${r.previousTotal ? renderAlzValue(r.previousTotal) : '<span style="color:var(--muted)">—</span>'}</td>
    <td style="font-weight:600">${r.diffPct == null
      ? '<span class="badge badge-acc">Novo</span>'
      : `<span style="color:${r.diff >= 0 ? 'var(--ok)' : 'var(--err)'}">${r.diff >= 0 ? '+' : ''}${formatAlzGamer(r.diff)} (${r.diffPct >= 0 ? '+' : ''}${r.diffPct.toFixed(0)}%)</span>`}
    </td>
  </tr>`).join('')}
  </tbody></table>
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

  // Quantos itens DISTINTOS (não drops) ainda não têm categoria no período — mede o quanto falta
  // categorizar pra esta página valer a pena; sem isso, não tinha nenhum sinal de quão incompleto
  // (ou completo) o cadastro estava.
  const uncategorizedCount = summarizeDropsByItem(dropsByCategory[NO_CATEGORY_LABEL] || []).length;
  const uncategorizedNotice = !uncategorizedCount ? '' : `
<div class="notice"><i class="ti ti-alert-circle" style="flex-shrink:0;margin-top:1px"></i><div><strong>${uncategorizedCount} ${uncategorizedCount > 1 ? 'itens distintos' : 'item distinto'}</strong> sem categoria neste período.${AppState.isMasterAdmin ? ' Categorize abaixo em "Gerenciar categorias" (busca e atribuição em massa disponíveis).' : ' Fale com o admin mestre pra categorizar.'}</div></div>`;

  return `
<div class="pg-title"><i class="ti ti-notebook" style="color:var(--acc)"></i>Relatório</div>
<div class="pg-sub">Drops agrupados por categoria (gerencie logo abaixo), com base nos filtros da visão geral.</div>
<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
  <span style="font-size:13px;color:var(--txt2)">${drops.length.toLocaleString('pt-BR')} drops</span>
  <button class="btn btn-d btn-xs" onclick="exportDropsToCSV()" style="margin-left:auto"><i class="ti ti-download"></i>Exportar CSV</button>
  <button class="btn btn-d btn-xs" onclick="copyAiRouteBriefing()" title="Copia seu histórico de DGs num texto pronto pra colar numa IA e pedir rotas — inclui as regras do jogo, o tamanho de cada amostra e a proibição de inventar número"><i class="ti ti-sparkles"></i>Copiar pra IA</button>
</div>
<div class="notice" style="margin-bottom:12px"><i class="ti ti-info-circle" style="flex-shrink:0;margin-top:1px"></i><div><strong>"Copiar pra IA"</strong> monta um texto com seus números reais (Alz/run líquido, tempo/run, custo de entrada, runs que faltam hoje) e já vem com o pedido pronto: rotas para 30min, 1h, 2h, 3h e 4h. Cole numa IA e ela responde comparando os cenários. Para <strong>um</strong> tempo específico, o próprio FarmHub já monta e aplica no carrinho — é o "Quanto tempo você tem hoje?" em Sessões de farme.</div></div>
${renderCategoryComparisonCard()}
${renderPersonalCategoryCard()}
${renderCategoryManagerCard()}
${uncategorizedNotice}
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
