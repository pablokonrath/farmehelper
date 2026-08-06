import { AppState, CREDIT_CATEGORIES } from '../state/app-state.js';
import { calculateRushCartCost, getCostPerGem, updateRushMetricsDisplay, computeCartCreditNeeds } from '../features/rush-cart.js';
import { computeResetWorth } from '../features/dg-session.js';
import { computeRouteComparison, appliedRoutesToday } from '../features/rush-routes.js';
import { renderDungeonOptionsGrouped } from '../features/dungeon-difficulty.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR, parseAlzInput, formatDuration, timeBreakdownTooltip } from '../utils/formatting.js';
import { renderDateInputBR } from '../utils/date-input.js';
import { saveRushParams } from '../state/persistence.js';
import { esc } from '../utils/escape.js';
import { renderPage } from '../router.js';

export function setRushCartDate(value) {
  AppState.rushCartDate = value;
}

export function setRushTicketPrice(value) {
  AppState.rushTicketPrice = parseAlzInput(value);
  const input = document.getElementById('tkp');
  if (input) input.value = AppState.rushTicketPrice ? formatNumber(AppState.rushTicketPrice) : '';
  updateRushMetricsDisplay();
  saveRushParams().catch(err => console.error('Falha ao salvar preço do ticket:', err));
}

export function setRushCardCashPrice(value) {
  AppState.rushCardCashPrice = parseAlzInput(value);
  const input = document.getElementById('ccp');
  if (input) input.value = AppState.rushCardCashPrice ? formatNumber(AppState.rushCardCashPrice) : '';

  const costPerGem = formatAlzGamer(getCostPerGem());
  const gemaHint = document.getElementById('gemaHint');
  if (gemaHint) gemaHint.textContent = costPerGem;
  const gemaSuggestion = document.getElementById('gemaSuggestion');
  if (gemaSuggestion) gemaSuggestion.textContent = costPerGem;
  // Recalcula o preço da gema no reset (Card Cash ÷ 1000) ao vivo — pra não ficar com o valor
  // antigo quando o Card Cash muda depois de abrir os campos de reset.
  const gemPriceInput = document.getElementById('dgGemPrice');
  if (gemPriceInput) gemPriceInput.value = formatNumber(getCostPerGem());
  saveRushParams().catch(err => console.error('Falha ao salvar Card Cash:', err));
}

export function toggleDungeonManager() {
  AppState.isDungeonManagerOpen = !AppState.isDungeonManagerOpen;
  renderPage();
}

export function startEditingDungeon(id) {
  AppState.editingDungeonId = id;
  renderPage();
}

export function cancelEditingDungeon() {
  AppState.editingDungeonId = null;
  renderPage();
}

export function renderRushPage() {
  const cost = calculateRushCartCost();
  const editingRoute = AppState.editingRouteId ? AppState.rushRoutes.find(r => r.id === AppState.editingRouteId) : null;
  const appliedRoutes = appliedRoutesToday();
  const routeTimeById = {};
  computeRouteComparison().forEach(r => { routeTimeById[r.id] = r; });
  const creditNeeds = computeCartCreditNeeds();
  // Cruza cada DG resetada no carrinho com "vale a pena resetar?" (mesmo cálculo de Sessões de
  // farme) — se o histórico real diz que não compensa, avisa aqui em vez de só numa página separada.
  const resetWorth = computeResetWorth();
  const resetWorthByName = {};
  if (resetWorth.gemValueSet) resetWorth.rows.forEach(r => { resetWorthByName[r.dungeonName] = r; });

  // Rotas ficam logo após os parâmetros do dia — é o caminho rápido do dia a dia (aplicar e
  // pronto), então não faz sentido estar depois de Créditos/Gerenciar DGs/Adicionar/Métricas.
  const routesCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-route"></i>Minhas rotas</div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Molde reutilizável de DGs + repetições, sem data fixa. Aplicar <strong>soma</strong> as DGs da rota ao carrinho de hoje (com os preços atuais) — dá pra aplicar mais de uma rota no mesmo dia; DG repetida em duas rotas tem as repetições somadas numa linha só. Monte o carrinho abaixo e clique "Salvar como rota" pra criar uma nova. Compare o lucro de cada rota em Sessões de farme.</div>
  ${!AppState.rushRoutes.length ? '<div class="empty">Nenhuma rota criada ainda.</div>' : `
  <table><thead><tr><th>Rota</th><th style="width:320px">DGs</th><th>Tempo estimado</th><th style="width:150px">Ações</th></tr></thead><tbody>
  ${AppState.rushRoutes.map(route => {
    const stats = routeTimeById[route.id];
    return `<tr>
    <td style="font-weight:500">${esc(route.name)}</td>
    <td><div style="display:flex;flex-wrap:wrap;gap:4px">
      ${route.items.map(it => {
        const dg = AppState.dungeonList.find(d => d.id === it.dungeonId);
        return `<span class="badge badge-muted" title="${dg ? esc(dg.name) : 'DG removida'}">${dg ? esc(dg.name) : '(DG removida)'} ×${it.repetitions}</span>`;
      }).join('')}
    </div></td>
    <td>${stats?.estimatedTimeMs
      ? (stats.hasTimeData
        ? `<span title="${esc(timeBreakdownTooltip(stats.timeBreakdown))}">${formatDuration(stats.estimatedTimeMs)}</span>`
        : `<span title="${esc(timeBreakdownTooltip(stats.timeBreakdown) + (stats.timeBreakdown.length ? '\n\n' : '') + 'Falta tempo/run farmado de: ' + stats.missingTimeDataDgNames.join(', ') + ' — soma só das DGs com dado')}">≈${formatDuration(stats.estimatedTimeMs)} <i class="ti ti-alert-triangle" style="color:var(--warn)"></i></span>`)
      : '<span style="color:var(--muted)" title="Nenhuma DG desta rota tem tempo/run farmado ainda">—</span>'}</td>
    <td><div style="display:flex;gap:4px">
      <button class="btn btn-d btn-xs" onclick="applyRushRoute('${route.id}')" title="Soma as DGs desta rota ao carrinho de hoje"><i class="ti ti-player-play"></i></button>
      <button class="btn btn-d btn-xs" onclick="startEditingRushRoute('${route.id}')" title="Editar (adicionar/remover DGs, mudar repetições)"><i class="ti ti-pencil"></i></button>
      <button class="btn btn-d btn-xs" onclick="renameRushRoute('${route.id}')" title="Só renomear"><i class="ti ti-tag"></i></button>
      <button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteRushRoute('${route.id}')" title="Excluir"><i class="ti ti-trash"></i></button>
    </div></td>
  </tr>`;
  }).join('')}
  </tbody></table>`}
</div>`;

  return `
<div class="pg-title"><i class="ti ti-swords" style="color:var(--acc)"></i>DGs de rush diário</div>
<div class="pg-sub">Monte um carrinho de DGs, salve por data e o custo será deduzido do farme daquele dia.</div>
<button class="btn btn-d btn-xs" style="margin-bottom:14px" onclick="openGuidedRush()"><i class="ti ti-bolt" style="color:var(--gold)"></i>Prefere passo a passo? Montar no modo guiado</button>

<!-- PARÂMETROS -->
<div class="card">
  <div class="ctitle"><i class="ti ti-calendar"></i>Parâmetros do dia</div>
  <div class="g3">
    <div><label class="lbl">Data do rush</label>${renderDateInputBR({ value: AppState.rushCartDate, onChange: 'setRushCartDate' })}</div>
    <div><label class="lbl">Valor unitário do ticket (Alz)</label>
      <input class="inp" id="tkp" type="text" inputmode="numeric" value="${AppState.rushTicketPrice ? formatNumber(AppState.rushTicketPrice) : ''}" placeholder="Ex: 1.000.000"
        oninput="maskAlzInputLive(this)" onblur="setRushTicketPrice(this.value)">
      <div class="hint">Preencha exatamente como no jogo, respeitando a unidade de medida (Alz).</div></div>
    <div><label class="lbl">Card Cash (1.000 Cash em Alz)</label>
      <input class="inp" id="ccp" type="text" inputmode="numeric" value="${AppState.rushCardCashPrice ? formatNumber(AppState.rushCardCashPrice) : ''}" placeholder="Ex: 550.000.000"
        oninput="maskAlzInputLive(this)" onblur="setRushCardCashPrice(this.value)">
      <div class="hint">Preencha exatamente como no jogo, respeitando a unidade de medida (Alz).<br>Custo por gema: <strong id="gemaHint">${formatAlzGamer(getCostPerGem())}</strong></div></div>
  </div>
</div>

${routesCard}

<!-- CRÉDITOS DE MACRO (colapsável) -->
<div class="card" style="padding:0;overflow:hidden">
  <div style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleCreditsManager()">
    <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px"><i class="ti ti-clock-hour-4"></i>Créditos de macro</div>
    <i class="ti ti-chevron-${AppState.isCreditsManagerOpen ? 'up' : 'down'}" style="color:var(--muted)"></i>
  </div>
  ${AppState.isCreditsManagerOpen ? `<div style="border-top:1px solid var(--border);padding:14px 16px">
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Cada crédito dá 1h de uso do macro, utilizável em qualquer DG (não é por-DG como tickets/gemas). Limite de compra: 8 por dia. A sugestão abaixo cruza a dificuldade de cada DG do carrinho (Avançada/Intermediária/Iniciante) com o tempo/run real das suas sessões — ${creditNeeds.missingDataCount ? `${creditNeeds.missingDataCount} DG(s) do carrinho ainda sem tempo/run farmado, não entram na conta.` : 'cobre todas as DGs do carrinho de hoje.'}</div>
  <table><thead><tr><th>Categoria</th><th style="width:110px">Qtd. comprada</th><th style="width:150px">Preço de mercado (unidade)</th><th style="width:150px">Custo de fabricar</th><th>Subtotal</th></tr></thead><tbody>
  ${CREDIT_CATEGORIES.map(cat => {
    const { quantity, marketPrice } = AppState.rushCredits[cat.id];
    const craftCost = AppState.rushCreditCraftCosts[cat.id] || 0;
    const subtotal = quantity * (marketPrice + craftCost);
    const needed = creditNeeds[cat.id] || 0;
    return `<tr>
      <td style="font-weight:500">${cat.name}${needed > 0 ? ` <span style="font-size:10px;font-weight:400;color:var(--gold)" title="Baseado no tempo/run real das DGs dessa faixa no carrinho de hoje">≈${needed} sugerido${needed > 1 ? 's' : ''}</span>` : ''}</td>
      <td><input class="inp inp-sm" type="number" min="0" value="${quantity || ''}" placeholder="0" onchange="setRushCreditQuantity('${cat.id}', this.value)"></td>
      <td><input class="inp inp-sm" type="text" inputmode="numeric" value="${marketPrice ? formatNumber(marketPrice) : ''}" placeholder="Ex: 30.000.000"
        oninput="maskAlzInputLive(this)" onblur="setRushCreditMarketPrice('${cat.id}', this.value)"></td>
      <td><input class="inp inp-sm" type="text" inputmode="numeric" value="${craftCost ? formatNumber(craftCost) : ''}" placeholder="Ex: 3.000.000"
        oninput="maskAlzInputLive(this)" onblur="setRushCreditCraftCost('${cat.id}', this.value)"></td>
      <td>${renderAlzValue(subtotal, true)}</td>
    </tr>`;
  }).join('')}
  </tbody></table>
  ${creditNeeds.avancado + creditNeeds.intermediario + creditNeeds.iniciante > 0 ? `<button class="btn btn-d btn-xs" style="margin-top:10px" onclick="applySuggestedCreditQuantities()"><i class="ti ti-refresh"></i>Preencher com a sugestão</button>` : ''}
  </div>` : ''}
</div>

<!-- GERENCIAR DGs (colapsável) -->
<div class="card" style="padding:0;overflow:hidden">
  <div style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleDungeonManager()">
    <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px"><i class="ti ti-table"></i>Gerenciar DGs <span style="font-size:11px;font-weight:400;color:var(--muted)">${AppState.dungeonList.length} DGs cadastradas</span></div>
    <i class="ti ti-chevron-${AppState.isDungeonManagerOpen ? 'up' : 'down'}" style="color:var(--muted)"></i>
  </div>
  ${AppState.isDungeonManagerOpen ? `<div style="border-top:1px solid var(--border);padding:14px 16px">
    <table style="margin-bottom:14px"><thead><tr><th>Nome da DG</th><th>Custo Alz (por run)</th><th>Tickets (por run)</th><th>Gemas de entrada (por run)</th>${AppState.isMasterAdmin ? '<th style="width:100px">Ações</th>' : ''}</tr></thead><tbody>
    ${AppState.dungeonList.map(dg => AppState.isMasterAdmin && AppState.editingDungeonId === dg.id ? `
      <tr style="background:var(--acc-bg)">
        <td><input class="inp inp-sm" id="ed-n-${dg.id}" value="${esc(dg.name)}" style="min-width:160px"></td>
        <td><input class="inp inp-sm" id="ed-a-${dg.id}" type="text" inputmode="numeric" value="${dg.alzCost ? formatNumber(dg.alzCost) : ''}" placeholder="0" style="width:110px" oninput="maskAlzInputLive(this)"></td>
        <td><input class="inp inp-sm" id="ed-tk-${dg.id}" type="number" min="0" value="${dg.ticketsPerRun || 0}" style="width:80px"></td>
        <td><input class="inp inp-sm" id="ed-g-${dg.id}" type="number" min="0" value="${dg.gemsPerRun || 0}" style="width:80px"></td>
        <td><div style="display:flex;gap:4px"><button class="btn btn-p btn-xs" onclick="saveDungeonEdit('${dg.id}')">Salvar</button><button class="btn btn-d btn-xs" onclick="cancelEditingDungeon()">✕</button></div></td>
      </tr>` :
      `<tr>
        <td>${esc(dg.name)}</td>
        <td>${dg.alzCost > 0 ? renderAlzValue(dg.alzCost) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${dg.ticketsPerRun > 0 ? `<span class="badge badge-acc">${dg.ticketsPerRun}× Ticket</span>` : '<span class="badge badge-muted">—</span>'}</td>
        <td>${dg.gemsPerRun > 0 ? `<span class="badge badge-warn">${dg.gemsPerRun}× Gema</span>` : '<span class="badge badge-muted">—</span>'}</td>
        ${AppState.isMasterAdmin ? `<td><div style="display:flex;gap:4px">
          <button class="btn btn-d btn-xs" onclick="startEditingDungeon('${dg.id}')"><i class="ti ti-edit"></i></button>
          <button class="btn btn-xs" style="background:var(--err-bg);color:var(--err);border:none" onclick="deleteDungeon('${dg.id}')"><i class="ti ti-trash"></i></button>
        </div></td>` : ''}
      </tr>`).join('')}
    </tbody></table>
    ${AppState.isMasterAdmin ? `<div style="border-top:1px solid var(--border);padding-top:12px"><div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--txt2)"><i class="ti ti-plus"></i> Nova DG</div>
    <div class="row">
      <div style="flex:1"><input class="inp" id="new-dg-n" placeholder="Nome da DG"></div>
      <div style="width:150px"><input class="inp" id="new-dg-a" type="text" inputmode="numeric" placeholder="Custo Alz (0 se ticket/gema)" oninput="maskAlzInputLive(this)"></div>
      <div style="width:110px"><input class="inp" id="new-dg-tk" type="number" min="0" placeholder="Qtd. tickets"></div>
      <div style="width:110px"><input class="inp" id="new-dg-g" type="number" min="0" placeholder="Qtd. gemas"></div>
      <button class="btn btn-p" onclick="addNewDungeon()"><i class="ti ti-plus"></i>Adicionar</button>
      <button class="btn btn-d" onclick="resetDungeonList()" title="Restaurar padrão"><i class="ti ti-refresh"></i></button>
    </div></div>` : '<div style="font-size:12px;color:var(--muted)">Só admins podem editar essa lista.</div>'}
  </div>` : ''}
</div>

<!-- ADICIONAR DG AO CARRINHO -->
<div class="card">
  <div class="ctitle"><i class="ti ti-plus"></i>Adicionar DG ao rush</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Cada run usa o custo Alz da DG (se houver) + tickets × preço do ticket + gemas de entrada × custo por gema (sugestão: <span id="gemaSuggestion">${formatAlzGamer(getCostPerGem())}</span>, calculado a partir do Card Cash). Reset (opcional) soma gemas por cima disso.</div>
  <div class="g3" style="margin-bottom:10px">
    <div style="grid-column:span 2"><label class="lbl">DG</label>
      <select class="inp" id="dgS">
      ${renderDungeonOptionsGrouped(AppState.dungeonList, d => {
        const parts = [];
        if (d.alzCost > 0) parts.push(formatAlzGamer(d.alzCost) + '/run');
        if (d.ticketsPerRun > 0) parts.push(d.ticketsPerRun + '× ticket');
        if (d.gemsPerRun > 0) parts.push(d.gemsPerRun + '× gema');
        return `${d.name}${parts.length ? ' — ' + parts.join(' + ') : ''}`;
      })}
      </select></div>
    <div><label class="lbl">Repetições</label><input class="inp" id="dgRp" type="number" min="1" value="1" oninput="updateCartPreview()"></div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <input type="checkbox" id="dgReset" style="width:16px;height:16px;accent-color:var(--acc)" onchange="toggleResetDetailFields()">
    <label for="dgReset" style="cursor:pointer;display:flex;align-items:center;gap:5px"><i class="ti ti-sparkles" style="color:var(--warn)"></i>Utilizou Reset de DG (Gemas) nesta DG?</label>
  </div>
  <!-- Detalhe do reset: só visível quando a checkbox acima está marcada -->
  <div id="resetDetailFields" style="display:none;margin-bottom:12px">
    <div class="g3">
      <div><label class="lbl">Quantidade de Gemas do Reset</label>
        <input class="inp" id="dgGemQty" type="number" min="1" value="1" oninput="updateCartPreview()"></div>
      <div><label class="lbl">Valor Unitário da Gema (Alz)</label>
        <input class="inp" id="dgGemPrice" type="text" inputmode="numeric" value="${formatNumber(getCostPerGem())}"
          oninput="maskAlzInputLive(this); updateCartPreview()">
        <div class="hint">Preenchido em Alz, conforme unidade do jogo.</div></div>
      <div><label class="lbl">Custo do Reset (previsão)</label>
        <div id="resetCostPreview" style="background:var(--warn-bg,rgba(234,88,12,.1));border:1px solid var(--warn);border-radius:8px;padding:8px 12px;font-family:var(--mono,monospace)"></div>
        <div class="hint" id="resetCostBreakdown"></div></div>
    </div>
  </div>
  <!-- Preview do custo antes de adicionar -->
  <div id="cartPreview" style="background:var(--surf2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--txt2)">
    Selecione uma DG e o número de repetições para ver o custo estimado.
  </div>
  <button class="btn btn-p" onclick="addDungeonToCart()"><i class="ti ti-plus"></i>Adicionar ao carrinho</button>
</div>

<!-- MÉTRICAS -->
<div class="g6" style="margin-bottom:12px">
  <div class="metric"><div class="metric-lbl">Alz das DGs</div><div class="metric-val" id="m-a" style="color:${getAlzTierColor(cost.alzFromDungeons)}" title="${formatNumber(cost.alzFromDungeons)} Alz">${formatAlzGamer(cost.alzFromDungeons)}</div></div>
  <div class="metric"><div class="metric-lbl">Tickets totais</div><div class="metric-val" id="m-t">${cost.ticketCount}</div></div>
  <div class="metric"><div class="metric-lbl">Custo tickets</div><div class="metric-val" id="m-ct" style="color:${getAlzTierColor(cost.ticketCost)}" title="${formatNumber(cost.ticketCost)} Alz">${formatAlzGamer(cost.ticketCost)}</div></div>
  <div class="metric"><div class="metric-lbl">Gemas totais</div><div class="metric-val" id="m-g">${cost.gemCount}</div></div>
  <div class="metric"><div class="metric-lbl">Custo gemas (entrada + reset)</div><div class="metric-val" id="m-cg" style="color:${getAlzTierColor(cost.gemCost)}" title="${formatNumber(cost.gemCost)} Alz">${formatAlzGamer(cost.gemCost)}</div></div>
  <div class="metric"><div class="metric-lbl">Custo dos créditos</div><div class="metric-val" id="m-cc" style="color:${getAlzTierColor(cost.creditsCost)}" title="${formatNumber(cost.creditsCost)} Alz">${formatAlzGamer(cost.creditsCost)}</div></div>
  <div class="metric hl"><div class="metric-lbl">Custo final geral</div><div class="metric-val" id="m-tot" style="color:${getAlzTierColor(cost.total)}" title="${formatNumber(cost.total)} Alz">${formatAlzGamer(cost.total)}</div></div>
</div>

<!-- CARRINHO -->
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-shopping-cart"></i>Carrinho do dia ${formatDateBR(AppState.rushCartDate)}${appliedRoutes.length ? appliedRoutes.map(r => ` <span style="font-size:11px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:.4px"><i class="ti ti-route"></i> ${esc(r.name)}</span>`).join('') : ''}</div>
  <div style="display:flex;gap:8px">
    ${AppState.rushCart.length ? '<button class="btn btn-d" onclick="clearRushCart()" title="Remove todas as DGs do carrinho"><i class="ti ti-eraser"></i>Limpar carrinho</button>' : ''}
    <button class="btn btn-s" onclick="saveRushForDay()"><i class="ti ti-device-floppy"></i>${AppState.rushHistory[AppState.rushCartDate] ? 'Atualizar rush do dia' : 'Salvar rush do dia'}</button>
  </div></div>
  ${AppState.rushCart.length ? `
  ${editingRoute ? `<div style="font-size:12px;color:var(--gold);background:var(--gold-bg);border:1px solid var(--gold-border);border-radius:6px;padding:7px 12px;margin-bottom:10px"><i class="ti ti-edit"></i> Editando a rota <strong>${esc(editingRoute.name)}</strong> — salvar abaixo sobrescreve ela (não cria outra). <a href="#" onclick="cancelEditingRushRoute();return false" style="color:var(--gold);text-decoration:underline">Cancelar edição</a></div>` : ''}
  <div class="row" style="margin-bottom:12px">
    <div style="flex:1"><input class="inp" id="newRushRouteName" placeholder="Nome da rota (ex: Iniciante, Foco Alz...)" value="${editingRoute ? esc(editingRoute.name) : ''}" onkeydown="if(event.key==='Enter')createRushRouteFromCart()"></div>
    <button class="btn btn-d" onclick="createRushRouteFromCart()" title="${editingRoute ? 'Sobrescreve a rota que está sendo editada' : 'Salva as DGs e repetições atuais como um molde reutilizável, sem data fixa'}"><i class="ti ti-route"></i>${editingRoute ? 'Salvar alterações da rota' : 'Salvar como rota'}</button>
  </div>` : ''}
  ${AppState.rushHistory[AppState.rushCartDate] ? `<div style="font-size:12px;color:var(--acc);background:var(--acc-bg,rgba(34,211,238,.08));border:1px solid var(--acc-border,rgba(34,211,238,.3));border-radius:6px;padding:7px 12px;margin-bottom:10px"><i class="ti ti-info-circle"></i> Este dia (${formatDateBR(AppState.rushCartDate)}) já tem um rush salvo. Ao salvar, ele é <strong>atualizado</strong> com o carrinho atual — não cria outro nem duplica.</div>` : ''}
  ${!AppState.rushCart.length ? '<div class="empty">Nenhuma DG adicionada. Escolha uma DG acima e clique em Adicionar, ou aplique uma rota salva.</div>' : `
  <table><thead><tr><th>DG</th><th>Tipo</th><th>Reps</th><th>Reset</th><th>Custo (breakdown)</th><th style="width:40px"></th></tr></thead><tbody>
  ${AppState.rushCart.map((item, i) => {
    const ticketPrice = +AppState.rushTicketPrice || 0;
    const costPerGem = getCostPerGem();
    const ticketsPerRun = item.ticketsPerRun ?? (item.requiresTicket ? 1 : 0);
    const totalTickets = ticketsPerRun * item.repetitions;
    const alzCost = item.alzCost * item.repetitions;
    const ticketCost = totalTickets * ticketPrice;
    const entryGems = (item.gemsPerRun || 0) * item.repetitions;
    const entryGemCost = entryGems * costPerGem;
    const resetGemQuantity = item.usedReset ? (item.resetGemQuantity ?? item.repetitions) : 0;
    const resetGemUnitPrice = item.usedReset ? (item.resetGemUnitPrice ?? costPerGem) : 0;
    const resetCost = resetGemQuantity * resetGemUnitPrice;
    const total = alzCost + ticketCost + entryGemCost + resetCost;
    const breakdown = [];
    if (alzCost > 0) breakdown.push(`${formatAlzGamer(item.alzCost)} × ${item.repetitions} = ${formatAlzGamer(alzCost)}`);
    if (totalTickets > 0) breakdown.push(`${totalTickets} ticket${totalTickets > 1 ? 's' : ''} × ${formatAlzGamer(ticketPrice)} = ${formatAlzGamer(ticketCost)}`);
    if (entryGems > 0) breakdown.push(`${entryGems} gema${entryGems > 1 ? 's' : ''} de entrada × ${formatAlzGamer(costPerGem)} = ${formatAlzGamer(entryGemCost)}`);
    if (item.usedReset) breakdown.push(`${resetGemQuantity} gema${resetGemQuantity !== 1 ? 's' : ''} de reset × ${formatAlzGamer(resetGemUnitPrice)} = ${formatAlzGamer(resetCost)}`);
    const typeBadges = [];
    if (totalTickets > 0) typeBadges.push(`<span class="badge badge-acc">${totalTickets}× Ticket</span>`);
    if (entryGems > 0) typeBadges.push(`<span class="badge badge-warn">${entryGems}× Gema</span>`);
    if (!typeBadges.length) typeBadges.push('<span class="badge badge-muted">Alz</span>');
    const resetWorthRow = item.usedReset ? resetWorthByName[item.name] : null;
    const resetWarning = resetWorthRow && !resetWorthRow.worth
      ? ` <i class="ti ti-alert-triangle" style="color:var(--err)" title="Pelo seu histórico, resetar essa DG não compensa: líquido de ${formatAlzGamer(resetWorthRow.netAlzPerRun)}/run não cobre o custo do reset. Veja 'Vale a pena resetar?' em Sessões de farme."></i>`
      : '';
    return `<tr>
      <td style="font-weight:500">${esc(item.name)}</td>
      <td>${typeBadges.join(' ')}</td>
      <td>${item.repetitions}×</td>
      <td>${item.usedReset ? '<span class="badge badge-warn">Sim</span>' : '<span class="badge badge-muted">Não</span>'}${resetWarning}</td>
      <td>${renderAlzValue(total, true)}<div style="font-size:10px;color:var(--muted);margin-top:2px">${breakdown.join(' + ')}</div></td>
      <td><button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeDungeonFromCart(${i})"><i class="ti ti-trash"></i></button></td>
    </tr>`;
  }).join('')}
  </tbody></table>`}
  <div id="rMsg" style="display:none;margin-top:10px;padding:7px 12px;background:var(--ok-bg);border:1px solid var(--ok-border);border-radius:6px;color:var(--ok);font-size:12px"></div>
</div>

<!-- RUSHES SALVOS -->
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-history"></i>Rushes salvos</div>
  <span style="font-size:12px;color:var(--muted)">Acumulado: ${renderAlzValue(Object.values(AppState.rushHistory).reduce((s, r) => s + r.total, 0), true)}</span></div>
  ${!Object.keys(AppState.rushHistory).length ? '<div class="empty">Nenhum rush salvo.</div>' : `
  <table><thead><tr><th>Data</th><th>DGs</th><th>Custo total</th><th style="width:70px">Ações</th></tr></thead><tbody>
  ${Object.entries(AppState.rushHistory).sort(([a], [b]) => b.localeCompare(a)).map(([date, rush]) => `<tr>
    <td>${formatDateBR(date)}</td><td>${rush.items?.length || 0} DGs</td>
    <td>${renderAlzValue(rush.total, true)}</td>
    <td><div style="display:flex;gap:4px">
      <button class="btn btn-d btn-xs" onclick="editSavedRush('${date}')" title="Editar (adicionar/remover DGs)"><i class="ti ti-edit"></i></button>
      <button class="btn btn-d btn-xs" onclick="duplicateSavedRush('${date}')" title="Duplicar pra hoje"><i class="ti ti-copy"></i></button>
      <button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteRushForDay('${date}')"><i class="ti ti-trash"></i></button>
    </div></td>
  </tr>`).join('')}
  </tbody></table>`}
</div>`;
}
