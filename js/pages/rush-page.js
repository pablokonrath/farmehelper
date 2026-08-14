import { AppState, CREDIT_CATEGORIES, CREDIT_TIER_COSTS, CREDIT_DAILY_LIMIT } from '../state/app-state.js';
import { calculateRushCartCost, getCostPerGem, getTicketCraftCost, setTicketCraft, toggleTicketCraft, updateRushMetricsDisplay, computeCartCreditNeeds, getCreditItemPrice, getCreditUnitCost, isOverDailyCreditLimit, computeRushVsDone } from '../features/rush-cart.js';
import { computeResetWorth, computeDgComparison, sessionRealizedAlz, DAILY_RUN_LIMIT } from '../features/dg-session.js';
import { computeRouteComparison, appliedRoutesToday, suggestRouteForTime, buildGeneratedRoute } from '../features/rush-routes.js';
import { renderDungeonOptionsGrouped } from '../features/dungeon-difficulty.js';
import { infoToggle } from '../features/ui-toggles.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR, parseAlzInput, formatDuration, timeBreakdownTooltip } from '../utils/formatting.js';
import { renderDateInputBR } from '../utils/date-input.js';
import { saveRushParams, saveRushMonthlyBudget } from '../state/persistence.js';
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

export function setRushMonthlyBudget(value) {
  AppState.rushMonthlyBudgetAlz = parseAlzInput(value);
  saveRushMonthlyBudget().catch(err => console.error('Falha ao salvar teto mensal de rush:', err));
  renderPage();
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

// Mostra/esconde a lista de DGs de UMA rota — cada rota abre/fecha por conta própria (mesmo
// padrão de "Ver itens" no histórico de sessões), pra não precisar colapsar a seção inteira só
// pra não ver a lista de badges de rota nenhuma.
export function toggleRushRouteItems(routeId) {
  if (AppState.expandedRushRoutes[routeId]) delete AppState.expandedRushRoutes[routeId];
  else AppState.expandedRushRoutes[routeId] = true;
  renderPage();
}

// Resultado real de cada dia que tem rush salvo: o Alz farmado naquele dia (todas as sessões,
// valorizado pelos preços de hoje — mesma base de "Qual DG rende mais", pra dias diferentes serem
// comparáveis entre si) menos o custo do rush. Só entra dia que tem sessão registrada: rush salvo
// sem nenhuma sessão não permite dizer que rendeu zero, só que não dá pra saber.
function computeRushOutcomes() {
  const alzByDate = {};
  AppState.dgSessions.forEach(s => {
    // Realizado (preço da época): o custo subtraído logo abaixo é o rush salvo daquele dia, que é
    // histórico congelado. Receita a preços de hoje contra custo da época dava um "resultado" que
    // não foi o de nenhum dia — mudava sozinho quando o mercado mexia.
    alzByDate[s.date] = (alzByDate[s.date] || 0) + sessionRealizedAlz(s);
  });
  const out = {};
  Object.entries(AppState.rushHistory).forEach(([date, rush]) => {
    if (alzByDate[date] === undefined) return;
    out[date] = { realized: alzByDate[date], result: alzByDate[date] - (rush.total || 0) };
  });
  return out;
}

export function renderRushPage() {
  const cost = calculateRushCartCost();
  const editingRoute = AppState.editingRouteId ? AppState.rushRoutes.find(r => r.id === AppState.editingRouteId) : null;
  const appliedRoutes = appliedRoutesToday();
  // Uma varredura só do histórico (nunca purgado), reusada por tudo que precisa dela nesta
  // renderização — rota, sugestão de crédito e "vale resetar" cada uma recalculava por conta
  // própria, então cada clique nesta página (adicionar DG, mudar quantidade de crédito) disparava
  // 3 varreduras redundantes do mesmo AppState.dgSessions.
  const dgStats = computeDgComparison();
  // Já vem ordenada por Lucro/hora (mesmo critério de "Qual rota rende mais" em Sessões de
  // farme) — a primeira com profitPerHour conhecido é a melhor rota salva, usada no resumo do
  // card colapsado e pra destacar a linha na tabela.
  const routeComparisonSorted = computeRouteComparison(dgStats);
  const routeTimeById = {};
  routeComparisonSorted.forEach(r => { routeTimeById[r.id] = r; });
  const melhorRota = routeComparisonSorted.find(r => r.profitPerHour != null);
  const creditNeeds = computeCartCreditNeeds(AppState.rushCart, dgStats);
  // Cruza cada DG resetada no carrinho com "vale a pena resetar?" (mesmo cálculo de Sessões de
  // farme) — se o histórico real diz que não compensa, avisa aqui em vez de só numa página separada.
  const resetWorth = computeResetWorth(dgStats);
  const resetWorthByName = {};
  if (resetWorth.gemValueSet) resetWorth.rows.forEach(r => { resetWorthByName[r.dungeonName] = r; });
  const dgStatsByName = {};
  dgStats.forEach(d => { dgStatsByName[d.dungeonName] = d; });
  // Melhor Alz/HORA do histórico (não Alz/run — crédito compra TEMPO, usável em qualquer DG, então
  // a régua de comparação certa é quanto essa hora rende na sua melhor entrada). Usado no aviso de
  // "vale a pena comprar esse crédito?" abaixo.
  const bestAlzPerHour = dgStats.reduce((max, d) => (d.alzPerHour != null && d.alzPerHour > max ? d.alzPerHour : max), 0);
  // Métricas hoje só mostravam CUSTO — nunca quanto o plano deveria RENDER, que é a metade que
  // decide se o dia fecha no positivo. Mesma conta que "Qual rota rende mais" já faz por rota
  // (Alz/run histórico × repetições), só que somada pro carrinho inteiro, misturado ou não.
  let expectedReturn = 0;
  let missingReturnCount = 0;
  AppState.rushCart.forEach(item => {
    const stat = dgStatsByName[item.name];
    if (stat?.alzPerRun != null) expectedReturn += stat.alzPerRun * item.repetitions;
    else missingReturnCount++;
  });
  const expectedProfit = expectedReturn - cost.total;

  // Carrinho x rush já gravado pra esta data. Compara pelo TOTAL, não item a item: é o total que
  // vira o "gasto em rush" do dia, e é ele que o jogador vê não bater. Carrinho vazio sem nada
  // salvo não é divergência, é só uma página em branco.
  const rushSalvoDoDia = AppState.rushHistory[AppState.rushCartDate];
  const cartUnsaved = AppState.rushCart.length > 0 && Math.round(cost.total) !== Math.round(rushSalvoDoDia?.total || 0);

  // Runs planejadas x runs de fato feitas no dia salvo. Quem compra as entradas conforme usa não
  // gastou nas runs que não fez — elas viram custo fantasma, inflando o gasto do dia e afundando
  // o líquido. Só aparece quando sobrou run e o carrinho já está salvo (sem registro salvo não há
  // o que reconciliar).
  const rushVsDone = computeRushVsDone(AppState.rushCartDate);
  const podeReconciliar = !cartUnsaved && rushVsDone && rushVsDone.naoFeitas > 0 && rushVsDone.diferenca > 0;

  // Gasto acumulado do MÊS CIVIL corrente contra o teto que o jogador definiu (0 = sem teto).
  const agora = new Date();
  const prefixoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const gastoNoMes = Object.entries(AppState.rushHistory)
    .filter(([date]) => date.startsWith(prefixoMes))
    .reduce((sum, [, r]) => sum + (r.total || 0), 0);
  const tetoMes = +AppState.rushMonthlyBudgetAlz || 0;
  const budget = {
    spent: gastoNoMes,
    limit: tetoMes,
    pct: tetoMes > 0 ? Math.round((gastoNoMes / tetoMes) * 100) : 0,
    monthLabel: agora.toLocaleDateString('pt-BR', { month: 'long' }),
  };

  // "Quanto tempo você tem hoje?" mora aqui, e não em Sessões de farme, porque o que ela faz é
  // MONTAR O CARRINHO — a ferramenta desta página. Em Sessões ela ficava a duas telas de distância
  // do lugar onde a decisão dela vira ação, e Sessões é sobre o farme que já aconteceu.
  const timeAvailableHours = Number(AppState.timeAvailableHours) || 0;
  const timeSuggestion = timeAvailableHours > 0 ? suggestRouteForTime(timeAvailableHours, dgStats) : null;
  // A montagem do zero é calculada SEMPRE, não só quando nenhuma rota salva cabe. Antes ela ficava
  // escondida de quem tem rotas salvas — o card sempre mostrava uma delas e a opção de montar na
  // hora nunca chegava à tela. Agora as duas aparecem juntas, com o lucro de cada uma à vista.
  const generatedRoute = timeAvailableHours > 0 && timeSuggestion?.type !== 'generated'
    ? buildGeneratedRoute(timeAvailableHours * 3600000, dgStats)
    : null;


  // Por que o lucro da rota está incompleto — separado pelos dois motivos possíveis, que pedem
  // ações opostas e são indistinguíveis de fora. "Sem sessão" significa que aquela DG nunca
  // apareceu no seu histórico (ou apareceu sob outro nome); "sem runs" significa que o farme
  // existe mas ninguém preencheu "Runs feitas" — e sem runs não dá pra dividir Alz por entrada.
  const missingAlzWarning = (faltando) => {
    if (!faltando?.length) return '';
    const semSessao = faltando.filter(f => f.motivo === 'sem-sessao').map(f => f.nome);
    const semRuns = faltando.filter(f => f.motivo === 'sem-runs').map(f => f.nome);
    const partes = [];
    if (semRuns.length) partes.push(`<strong>${semRuns.map(esc).join(', ')}</strong> — ${semRuns.length === 1 ? 'tem sessão' : 'têm sessões'} no histórico, mas nenhuma com "Runs feitas" preenchido. Sem runs não dá pra saber quanto rende por entrada. Preencha numa sessão dessa DG no histórico abaixo e o número se corrige sozinho.`);
    if (semSessao.length) partes.push(`<strong>${semSessao.map(esc).join(', ')}</strong> — ${semSessao.length === 1 ? 'não aparece' : 'não aparecem'} em nenhuma sessão sua ainda. Farme uma vez com as runs preenchidas pra ${semSessao.length === 1 ? 'ela entrar' : 'elas entrarem'} na conta.`);
    return `<div style="margin-top:8px;padding:8px 10px;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:6px;font-size:11px;color:var(--warn)">
      <i class="ti ti-alert-triangle"></i> <strong>Esse lucro está incompleto — o real é maior.</strong> ${faltando.length === 1 ? 'Uma DG da rota rende' : `${faltando.length} DGs da rota rendem`} <strong>zero</strong> na conta por falta de dado, mas ${faltando.length === 1 ? 'seu custo de entrada é cobrado' : 'seus custos de entrada são cobrados'} normalmente.
      ${partes.map(p => `<div style="margin-top:6px">${p}</div>`).join('')}
    </div>`;
  };

  // A alternativa montada na hora, mostrada embaixo da rota salva. Só aparece quando de fato tem
  // conteúdo — e diz de cara se rende mais ou menos que a salva, porque comparar dois números de
  // Alz de cabeça, em kk, é exatamente o tipo de conta que a tela deveria poupar.
  const generatedRouteBlock = (gerada, lucroDaSalva, salvaTemDadoFaltando) => {
    if (!gerada || gerada.type === 'none' || !gerada.items.length) return '';
    const diferenca = gerada.profit - lucroDaSalva;
    const melhor = diferenca > 0;
    // Comparar com uma rota cujo lucro está subestimado (DG sem Alz/run entra como zero) daria uma
    // vantagem falsa pra montada na hora — ela ganharia por dado faltando, não por ser melhor.
    const comparacao = salvaTemDadoFaltando
      ? '<span style="color:var(--muted)">(não dá pra comparar: o lucro da rota acima está incompleto)</span>'
      : `<span style="color:${melhor ? 'var(--ok)' : 'var(--muted)'}">(${melhor ? `${formatAlzGamer(diferenca)} a mais` : diferenca === 0 ? 'igual' : `${formatAlzGamer(-diferenca)} a menos`} que a rota acima)</span>`;
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px"><i class="ti ti-wand"></i> Ou <strong style="color:var(--txt)">montar na hora</strong>, sem usar rota salva — escolhendo as DGs que melhor preenchem ${formatDuration(gerada.estimatedTimeMs)}:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        ${gerada.items.map(it => `<span class="badge badge-muted">${esc(it.dungeonName)} × ${it.repetitions}${it.usedReset ? ` <i class="ti ti-sparkles" title="Passa dos ${DAILY_RUN_LIMIT} runs/dia — precisa resetar"></i>` : ''}</span>`).join('')}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div style="font-size:12px;color:var(--muted)">Bruto: <strong style="color:var(--txt)">${formatAlzGamer(gerada.expectedAlz)}</strong> · Custo: <strong style="color:var(--err)">−${formatAlzGamer(gerada.cost)}</strong> · Lucro: <strong style="color:${gerada.profit >= 0 ? 'var(--ok)' : 'var(--err)'}">${gerada.profit >= 0 ? '+' : ''}${formatAlzGamer(gerada.profit)}</strong> ${comparacao}</div>
        <button class="btn btn-d btn-xs" onclick="applyGeneratedRoute()"><i class="ti ti-player-play"></i>Aplicar esta</button>
      </div>
    </div>`;
  };

  const timeSuggestionCard = `
<div class="card card-featured">
  <div class="ctitle"><i class="ti ti-clock" style="color:var(--gold)"></i>Quanto tempo você tem hoje?</div>
  ${infoToggle('rush-time-suggestion', `Sugere a rota salva de melhor Lucro/hora que cabe no tempo (tempo/run vem da média real das suas sessões) e completa a sobra com DGs avulsas pelas de melhor Alz/hora, sem deixar tempo disponível sem uso. Se nenhuma rota salva couber, monta um encaixe novo do zero, respeitando o limite de ${DAILY_RUN_LIMIT} runs/dia por DG.`)}
  <div class="row" style="margin-bottom:14px;align-items:flex-end">
    <div style="width:140px"><label class="lbl">Horas disponíveis</label><input class="inp" id="timeAvailableHoursInput" type="number" min="0" step="0.5" placeholder="ex: 3" value="${AppState.timeAvailableHours || ''}" onchange="setTimeAvailableHours(this.value)"></div>
  </div>
  ${!timeAvailableHours ? '' : !timeSuggestion || timeSuggestion.type === 'none'
    ? '<div class="empty">Ainda não há DG com runs e tempo suficientes farmados pra sugerir algo pro seu tempo.</div>'
    : timeSuggestion.type === 'saved' || timeSuggestion.type === 'saved+extra'
      ? `<div style="padding:12px;background:var(--surf2);border:1px solid var(--gold-border);border-radius:8px">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Rota salva que cabe no seu tempo:</div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="font-weight:700;font-size:15px;color:var(--gold)">${esc(timeSuggestion.name)}${timeSuggestion.needsReset ? ` <i class="ti ti-sparkles" style="color:var(--warn);font-size:13px" title="Inclui reset por gemas em alguma DG"></i>` : ''}</div>
            <button class="btn btn-p btn-xs" onclick="applySuggestedRoute()"><i class="ti ti-player-play"></i>Aplicar no carrinho</button>
          </div>
          ${timeSuggestion.type === 'saved+extra' ? `<div style="font-size:11px;color:var(--muted);margin-top:8px">A rota sozinha não usa todo seu tempo — completado com avulsas:</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
            ${timeSuggestion.extraItems.map(it => `<span class="badge badge-acc">${esc(it.dungeonName)} × ${it.repetitions}${it.usedReset ? ' <i class="ti ti-sparkles" title="Passa dos ' + DAILY_RUN_LIMIT + ' runs/dia — precisa resetar"></i>' : ''}</span>`).join('')}
          </div>` : ''}
          <div style="font-size:12px;color:var(--muted);margin-top:8px">Tempo estimado: <strong style="color:var(--txt)" title="${esc(timeBreakdownTooltip(timeSuggestion.timeBreakdown))}">${formatDuration(timeSuggestion.estimatedTimeMs)}</strong> · Bruto: <strong style="color:var(--txt)">${formatAlzGamer(timeSuggestion.expectedAlz)}</strong> · Custo: <strong style="color:var(--err)">−${formatAlzGamer(timeSuggestion.cost)}</strong> · Lucro: <strong style="color:${timeSuggestion.profit >= 0 ? 'var(--ok)' : 'var(--err)'}">${timeSuggestion.profit >= 0 ? '+' : ''}${formatAlzGamer(timeSuggestion.profit)}</strong></div>
          ${missingAlzWarning(timeSuggestion.missingAlzDataDgNames)}
          ${generatedRouteBlock(generatedRoute, timeSuggestion.profit, timeSuggestion.missingAlzDataDgNames?.length)}
        </div>`
      : `<div style="padding:12px;background:var(--surf2);border:1px solid var(--gold-border);border-radius:8px">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Nenhuma rota salva coube no tempo — encaixe novo montado pelas DGs de melhor Alz/hora:</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
            ${timeSuggestion.items.map(it => `<span class="badge badge-acc">${esc(it.dungeonName)} × ${it.repetitions}${it.usedReset ? ' <i class="ti ti-sparkles" title="Passa dos ' + DAILY_RUN_LIMIT + ' runs/dia — precisa resetar"></i>' : ''}</span>`).join('')}
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="font-size:12px;color:var(--muted)">Tempo estimado: <strong style="color:var(--txt)">${formatDuration(timeSuggestion.estimatedTimeMs)}</strong> · Lucro esperado: <strong style="color:${timeSuggestion.profit >= 0 ? 'var(--ok)' : 'var(--err)'}">${timeSuggestion.profit >= 0 ? '+' : ''}${formatAlzGamer(timeSuggestion.profit)}</strong></div>
            <button class="btn btn-p btn-xs" onclick="applySuggestedRoute()"><i class="ti ti-player-play"></i>Aplicar no carrinho</button>
          </div>
        </div>`}
</div>`;

  // Quem fabrica os próprios tickets não paga o preço de mercado por eles — paga em item farmado.
  // Sem isso, toda DG que consome ticket (e tem DG de 2 e 3 por run) aparecia com um custo que
  // você nunca teve, afundando o líquido dela e distorcendo a comparação entre DGs.
  //
  // Guarda a RECEITA, não o preço: o custo por ticket é recalculado do preço atual do item em
  // Cálculo de farme, então quando o mercado mexe no item, o ticket acompanha sozinho.
  const craft = getTicketCraftCost();
  const tc = AppState.ticketCraft || {};
  // Receita preenchida, mesmo que desligada hoje — é o que decide se o botão de ligar/desligar
  // aparece. Sem isso ele sumiria justamente quando está desligado, deixando você sem como voltar.
  const temReceita = !!tc.itemName && tc.itemQty > 0 && tc.ticketsProduced > 0;
  const craftDesligada = temReceita && tc.enabled === false;
  const itensComPreco = [...new Set([...Object.keys(AppState.itemPrices), ...Object.keys(AppState.referenceItemPrices || {})])].sort();
  const ticketCraftBlock = `
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
    <div style="font-size:12px;font-weight:600;margin-bottom:8px"><i class="ti ti-tools"></i> Eu fabrico meus tickets</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px">É a <strong>receita de um lote</strong>, não o que você gastou hoje: preencha uma vez e não mexe mais, mesmo fazendo três lotes num dia ou nenhum no outro. O custo do ticket sai da proporção entre os dois campos e acompanha sozinho o preço do item em Cálculo de farme.<br>O item continua contando como farme (ele caiu, tem valor) e sai como custo aqui — por isso <strong>não</strong> se desconta ele do farme do dia também, senão o mesmo item seria contado duas vezes.</div>
    <div class="row" style="align-items:flex-end;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><label class="lbl">Item consumido</label>
        <input class="inp inp-sm" id="tcItem" list="tcItens" placeholder="Ex: Set de Aprimoramento Altíssimo" value="${esc(tc.itemName || '')}">
        <datalist id="tcItens">${itensComPreco.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div style="width:150px"><label class="lbl">Gasta por lote</label>
        <input class="inp inp-sm" id="tcQty" type="number" min="0" step="1" placeholder="16" value="${tc.itemQty || ''}" title="Quantas unidades do item um lote consome — não o total que você já gastou"></div>
      <div style="width:160px"><label class="lbl">Tickets por lote</label>
        <input class="inp inp-sm" id="tcOut" type="number" min="0" step="1" placeholder="30" value="${tc.ticketsProduced || ''}" title="Quantos tickets saem de um lote. Se varia (ex: 30 a 35), use o MENOR — o custo por ticket fica um pouco maior e o lucro estimado não vira promessa otimista."></div>
      <div><label class="lbl">&nbsp;</label>
        <button class="btn btn-p btn-sm" onclick="setTicketCraft(document.getElementById('tcItem').value, document.getElementById('tcQty').value, document.getElementById('tcOut').value)"><i class="ti ti-check"></i>Salvar receita</button></div>
      ${!temReceita ? '' : `<div><label class="lbl">&nbsp;</label><button class="btn btn-d btn-sm" onclick="toggleTicketCraft()" title="${craft ? 'Passa a usar o preço de mercado. A receita fica guardada — dá pra voltar num clique.' : 'Volta a usar o custo de fabricação da receita guardada.'}"><i class="ti ti-${craft ? 'shopping-cart' : 'tools'}"></i>${craft ? 'Comprei hoje, usar preço de mercado' : 'Voltar a fabricar'}</button></div>`}
    </div>
    ${craftDesligada ? `<div style="font-size:11px;color:var(--muted);margin-top:8px"><i class="ti ti-shopping-cart"></i> Usando o <strong>preço de mercado</strong> hoje. Sua receita (${tc.itemQty} × ${esc(tc.itemName)} → ${tc.ticketsProduced} tickets) está guardada — é só clicar em "Voltar a fabricar".</div>`
      : !craft ? (tc.itemName ? `<div style="font-size:11px;color:var(--warn);margin-top:8px"><i class="ti ti-alert-triangle"></i> <strong>${esc(tc.itemName)}</strong> ainda não tem preço cadastrado em Cálculo de farme — sem ele não dá pra calcular o custo do ticket, e o preço de mercado continua valendo.</div>` : '')
      : `<div style="font-size:11px;color:var(--ok);margin-top:8px"><i class="ti ti-calculator"></i> ${craft.itemQty} × ${esc(craft.itemName)} (${formatAlzGamer(craft.precoItem)} cada) ÷ ${craft.ticketsProduced} tickets = <strong>${formatAlzGamer(craft.unit)} por ticket</strong>. Esse é o valor usado em todas as contas — custo de DG, rota, crédito de macro e "vale a pena resetar".</div>`}
  </div>`;

  const paramsCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-calendar"></i>Parâmetros do dia</div>
  <div class="g3">
    <div><label class="lbl">Data do rush</label>${renderDateInputBR({ value: AppState.rushCartDate, onChange: 'setRushCartDate' })}</div>
    <div><label class="lbl">Valor unitário do ticket (Alz)</label>
      <input class="inp" id="tkp" type="text" inputmode="numeric" value="${AppState.rushTicketPrice ? formatNumber(AppState.rushTicketPrice) : ''}" placeholder="Ex: 1.000.000"
        oninput="maskAlzInputLive(this)" onblur="setRushTicketPrice(this.value)" ${craft ? 'disabled style="opacity:.5"' : ''}>
      <div class="hint">${craft
        ? `<span style="color:var(--ok)"><i class="ti ti-tools"></i> Usando o custo de fabricação: <strong>${formatAlzGamer(craft.unit)}</strong> por ticket.</span> O preço de mercado fica de fora enquanto você fabrica.`
        : 'Preencha exatamente como no jogo, respeitando a unidade de medida (Alz).'}</div></div>
    <div><label class="lbl">Card Cash (1.000 Cash em Alz)</label>
      <input class="inp" id="ccp" type="text" inputmode="numeric" value="${AppState.rushCardCashPrice ? formatNumber(AppState.rushCardCashPrice) : ''}" placeholder="Ex: 550.000.000"
        oninput="maskAlzInputLive(this)" onblur="setRushCardCashPrice(this.value)">
      <div class="hint">Preencha exatamente como no jogo, respeitando a unidade de medida (Alz).<br>Custo por gema: <strong id="gemaHint">${formatAlzGamer(getCostPerGem())}</strong></div></div>
  </div>
  ${ticketCraftBlock}
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
    <div class="row" style="align-items:flex-end;flex-wrap:wrap">
      <div style="width:190px"><label class="lbl">Teto de rush no mês (Alz)</label>
        <input class="inp" type="text" inputmode="numeric" placeholder="opcional" value="${AppState.rushMonthlyBudgetAlz ? formatNumber(AppState.rushMonthlyBudgetAlz) : ''}" oninput="maskAlzInputLive(this)" onblur="setRushMonthlyBudget(this.value)"></div>
      <div style="flex:1;min-width:220px;font-size:12px;color:var(--muted);padding-bottom:6px">
        ${budget.spent > 0 || budget.limit > 0
          ? `Já investido em ${budget.monthLabel}: <strong style="color:var(--txt)" title="${formatNumber(budget.spent)} Alz">${formatAlzGamer(budget.spent)}</strong>${budget.limit > 0 ? ` de ${formatAlzGamer(budget.limit)} <span style="color:${budget.pct >= 100 ? 'var(--err)' : budget.pct >= 80 ? 'var(--warn)' : 'var(--muted)'}">(${budget.pct}%)</span>` : ''}`
          : 'Sem gasto de rush registrado neste mês ainda.'}
      </div>
    </div>
    ${budget.limit > 0 ? `<div style="height:6px;background:var(--surf2);border-radius:4px;overflow:hidden;margin-top:8px">
      <div style="height:100%;width:${Math.min(100, budget.pct)}%;background:${budget.pct >= 100 ? 'var(--err)' : budget.pct >= 80 ? 'var(--warn)' : 'var(--acc)'}"></div>
    </div>` : ''}
    ${budget.limit > 0 && budget.pct >= 80 ? `<div style="font-size:11px;color:${budget.pct >= 100 ? 'var(--err)' : 'var(--warn)'};margin-top:8px"><i class="ti ti-alert-triangle"></i> ${budget.pct >= 100
      ? `Você passou do teto que definiu pra este mês em ${formatAlzGamer(budget.spent - budget.limit)}.`
      : `Faltam ${formatAlzGamer(budget.limit - budget.spent)} pro teto do mês.`}</div>` : ''}
    <div class="hint" style="margin-top:6px">Só um freio pra você mesmo — não bloqueia nada. Existe porque é justamente em mês ruim que o gasto sobe, tentando compensar rushando mais.</div>
  </div>
</div>`;

  // Rotas ficam logo após os parâmetros do dia — é o caminho rápido do dia a dia (aplicar e
  // pronto), então não faz sentido estar depois de Créditos/Gerenciar DGs/Adicionar/Métricas.
  // A lista de rotas em si fica sempre visível (é o que você veio ver); a lista de DGs de CADA
  // rota é que fecha por padrão e abre uma a uma — clicar numa rota não afeta as outras.
  const routesCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-route"></i>Minhas rotas</div>
  ${infoToggle('rush-routes', 'Molde reutilizável de DGs + repetições, sem data fixa. Aplicar <strong>soma</strong> as DGs da rota ao carrinho de hoje (com os preços atuais) — dá pra aplicar mais de uma rota no mesmo dia; DG repetida em duas rotas tem as repetições somadas numa linha só. Monte o carrinho abaixo e clique "Salvar como rota" pra criar uma nova. <strong>Retorno bruto</strong> é o que a rota deve farmar (Alz/run histórico de cada DG × repetições); <strong>Custo</strong> é o que ela consome em entradas — Alz + tickets + gemas aos preços de hoje, mais reset quando alguma DG passa do limite diário. Crédito de macro não entra aqui: é compra do dia, não desta rota. <strong>Lucro</strong> é a diferença, e é a mesma conta de "Qual rota rende mais" em Sessões de farme — trazida pra cá pra decidir sem precisar trocar de página. <i class="ti ti-trophy" style="color:var(--gold)"></i> marca a rota de melhor Lucro/hora entre as suas. Clique no número de DGs pra ver quais são.')}
  ${!AppState.rushRoutes.length ? '<div class="empty">Nenhuma rota criada ainda.</div>' : `
  ${/* Bruto e custo ao lado do lucro: só o lucro esconde COMO ele foi obtido. Duas rotas com o
       mesmo lucro podem ser uma de retorno alto e entrada cara e outra de retorno modesto e quase
       sem custo — e elas se comportam de forma bem diferente quando o preço do ticket ou da gema
       muda. Mesmas colunas de "Qual rota rende mais" em Sessões, que já mostrava as três. */''}
  <table class="t-cards"><thead><tr><th>Rota</th><th style="width:130px">DGs</th><th>Tempo estimado</th><th>Retorno bruto</th><th>Custo</th><th>Lucro esperado</th><th>Lucro/hora</th><th style="width:150px">Ações</th></tr></thead><tbody>
  ${AppState.rushRoutes.map(route => {
    const stats = routeTimeById[route.id];
    const isBest = melhorRota && route.id === melhorRota.id;
    const expanded = !!AppState.expandedRushRoutes[route.id];
    const missingWarning = stats?.missingDataCount
      ? ` <i class="ti ti-alert-triangle" style="color:var(--warn)" title="${stats.missingDataCount} DG(s) desta rota ainda sem sessão farmada com runs registradas — não entram no lucro esperado"></i>`
      : '';
    return `<tr>
    <td data-label="Rota" style="font-weight:500">${isBest ? '<i class="ti ti-trophy" style="color:var(--gold)" title="Melhor Lucro/hora entre suas rotas"></i> ' : ''}${esc(route.name)}${missingWarning}</td>
    <td data-label="DGs">
      <button onclick="toggleRushRouteItems('${route.id}')" style="background:transparent;border:none;color:var(--acc);cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;padding:0">
        ${route.items.length} DG${route.items.length > 1 ? 's' : ''} <i class="ti ti-chevron-${expanded ? 'up' : 'down'}"></i>
      </button>
      ${expanded ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
        ${route.items.map(it => {
          const dg = AppState.dungeonList.find(d => d.id === it.dungeonId);
          return `<span class="badge badge-muted" title="${dg ? esc(dg.name) : 'DG removida'}">${dg ? esc(dg.name) : '(DG removida)'} ×${it.repetitions}</span>`;
        }).join('')}
      </div>` : ''}
    </td>
    <td data-label="Tempo estimado">${stats?.estimatedTimeMs
      ? (stats.hasTimeData
        ? `<span title="${esc(timeBreakdownTooltip(stats.timeBreakdown))}">${formatDuration(stats.estimatedTimeMs)}</span>`
        : `<span title="${esc(timeBreakdownTooltip(stats.timeBreakdown) + (stats.timeBreakdown.length ? '\n\n' : '') + 'Falta tempo/run farmado de: ' + stats.missingTimeDataDgNames.join(', ') + ' — soma só das DGs com dado')}">≈${formatDuration(stats.estimatedTimeMs)} <i class="ti ti-alert-triangle" style="color:var(--warn)"></i></span>`)
      : '<span style="color:var(--muted)" title="Nenhuma DG desta rota tem tempo/run farmado ainda">—</span>'}</td>
    <td data-label="Retorno bruto">${stats && stats.expectedAlz > 0 ? `<span title="${formatNumber(stats.expectedAlz)} Alz — o que a rota deve farmar, antes de descontar as entradas">${formatAlzGamer(stats.expectedAlz)}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
    <td data-label="Custo">${stats && stats.expectedAlz > 0 ? `<span style="color:var(--err)" title="${formatNumber(stats.cost)} Alz — Alz de entrada + tickets + gemas das DGs desta rota (crédito de macro não entra: é compra do dia, não desta rota)">−${formatAlzGamer(stats.cost)}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
    <td data-label="Lucro esperado">${stats && stats.expectedAlz > 0 ? `<span style="color:${stats.profit >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:600" title="${formatNumber(stats.profit)} Alz">${stats.profit >= 0 ? '+' : ''}${formatAlzGamer(stats.profit)}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
    <td data-label="Lucro/hora">${stats?.profitPerHour != null ? `<strong style="color:var(--gold)">${formatAlzGamer(stats.profitPerHour)}/h</strong>` : '<span style="color:var(--muted);font-weight:400">—</span>'}</td>
    <td><div style="display:flex;gap:4px">
      <button class="btn btn-d btn-xs" aria-label="Aplicar rota ${esc(route.name)}" onclick="applyRushRoute('${route.id}')" title="Soma as DGs desta rota ao carrinho de hoje"><i class="ti ti-player-play"></i></button>
      <button class="btn btn-d btn-xs" aria-label="Editar rota ${esc(route.name)}" onclick="startEditingRushRoute('${route.id}')" title="Editar (adicionar/remover DGs, mudar repetições)"><i class="ti ti-pencil"></i></button>
      <button class="btn btn-d btn-xs" aria-label="Renomear rota ${esc(route.name)}" onclick="renameRushRoute('${route.id}')" title="Só renomear"><i class="ti ti-tag"></i></button>
      <button aria-label="Excluir rota ${esc(route.name)}" title="Excluir" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteRushRoute('${route.id}')"><i class="ti ti-trash"></i></button>
    </div></td>
  </tr>`;
  }).join('')}
  </tbody></table>`}
</div>`;

  const addDgCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-plus"></i>Adicionar DG ao rush</div>
  ${infoToggle('rush-add-dg', `Cada run usa o custo Alz da DG (se houver) + tickets × preço do ticket + gemas de entrada × custo por gema (sugestão: <span id="gemaSuggestion">${formatAlzGamer(getCostPerGem())}</span>, calculado a partir do Card Cash). Reset (opcional) soma gemas por cima disso.`)}
  <div class="g3" style="margin-bottom:10px">
    <div style="grid-column:span 2"><label class="lbl">DG</label>
      <select class="inp" id="dgS" onchange="updateCartPreview()">
      ${renderDungeonOptionsGrouped(AppState.dungeonList, d => {
        const parts = [];
        if (d.alzCost > 0) parts.push(formatAlzGamer(d.alzCost) + '/run');
        if (d.ticketsPerRun > 0) parts.push(d.ticketsPerRun + '× ticket');
        if (d.gemsPerRun > 0) parts.push(d.gemsPerRun + '× gema');
        return `${d.name}${parts.length ? ' — ' + parts.join(' + ') : ''}`;
      })}
      </select></div>
    <div><label class="lbl">Repetições</label><input class="inp" id="dgRp" type="number" min="1" value="${DAILY_RUN_LIMIT}" oninput="updateCartPreview()"></div>
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
</div>`;

  const cartCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-shopping-cart"></i>Carrinho do dia ${formatDateBR(AppState.rushCartDate)}${appliedRoutes.length ? appliedRoutes.map(r => ` <span style="font-size:11px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:.4px"><i class="ti ti-route"></i> ${esc(r.name)}</span>`).join('') : ''}</div>
  <div style="display:flex;gap:8px">
    ${AppState.rushCart.length ? '<button class="btn btn-d" onclick="clearRushCart()" title="Remove todas as DGs do carrinho"><i class="ti ti-eraser"></i>Limpar carrinho</button>' : ''}
    <button class="btn ${cartUnsaved ? 'btn-p' : 'btn-s'}" onclick="saveRushForDay()"><i class="ti ti-device-floppy"></i>${AppState.rushHistory[AppState.rushCartDate] ? 'Atualizar rush do dia' : 'Salvar rush do dia'}</button>
  </div></div>
  ${/* O gasto do dia é um SNAPSHOT tirado no momento de salvar — mexer no carrinho depois (aplicar
       uma rota, mudar repetições, trocar o preço do ticket) não muda o que já foi gravado, e é
       assim que tem que ser: rush salvo é registro, não espelho ao vivo do carrinho.
       O problema era o silêncio. As duas coisas divergiam sem nada na tela dizendo, e o gasto do
       dia no sidebar simplesmente parecia errado. */''}
  ${!podeReconciliar ? '' : `<div style="margin-top:10px;padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:6px;font-size:12px">
    <div style="margin-bottom:6px"><i class="ti ti-receipt-off" style="color:var(--gold)"></i> <strong>Sobraram ${rushVsDone.naoFeitas} run(s) planejadas que você não fez.</strong></div>
    <div style="color:var(--muted);font-size:11px;margin-bottom:8px">Se você compra as entradas conforme usa, não gastou nelas — e o gasto de ${formatDateBR(AppState.rushCartDate)} está <strong style="color:var(--warn)">${formatAlzGamer(rushVsDone.diferenca)} acima</strong> do real (${formatAlzGamer(rushVsDone.totalPlanejado)} cobrado, ${formatAlzGamer(rushVsDone.totalSeSoOFeito)} de fato usado).<br>Se você comprou tudo adiantado e a entrada sobrou pra amanhã, ignore — aí o gasto está certo.</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
      ${rushVsDone.linhas.filter(l => l.cobradas < l.planejadas).map(l => `<span class="badge badge-muted" title="${l.cobradas} de ${l.planejadas} runs feitas">${esc(l.name)}: ${l.cobradas}/${l.planejadas}</span>`).join('')}
    </div>
    ${!rushVsDone.semRuns.length ? '' : `<div style="font-size:11px;color:var(--warn);margin-bottom:8px"><i class="ti ti-alert-triangle"></i> <strong>${rushVsDone.semRuns.map(esc).join(', ')}</strong>: você farmou, mas nenhuma sessão dessas DGs tem "Runs feitas" preenchido. Como não dá pra saber quantas foram, mantive o planejado — preencha as runs no histórico de Sessões e volte aqui pra cobrança ficar exata.</div>`}
    <button class="btn btn-p btn-xs" onclick="chargeOnlyDoneRuns('${AppState.rushCartDate}')"><i class="ti ti-adjustments-check"></i>Cobrar só o que eu fiz</button>
  </div>`}
  ${!cartUnsaved ? '' : `<div style="margin-top:10px;padding:8px 12px;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:6px;font-size:12px;color:var(--warn)"><i class="ti ti-alert-triangle"></i> ${!rushSalvoDoDia
    ? `Este carrinho <strong>ainda não foi salvo</strong> — o gasto de ${formatDateBR(AppState.rushCartDate)} continua zerado até você salvar.`
    : `O carrinho mudou desde que você salvou: agora dá <strong>${formatAlzGamer(cost.total)}</strong>, mas o gasto gravado em ${formatDateBR(AppState.rushCartDate)} ainda é <strong>${formatAlzGamer(rushSalvoDoDia.total || 0)}</strong>. Atualize pra bater.`}</div>`}
  ${AppState.rushCart.length ? `
  ${editingRoute ? `<div style="font-size:12px;color:var(--gold);background:var(--gold-bg);border:1px solid var(--gold-border);border-radius:6px;padding:7px 12px;margin-bottom:10px"><i class="ti ti-edit"></i> Editando a rota <strong>${esc(editingRoute.name)}</strong> — salvar abaixo sobrescreve ela (não cria outra). <a href="#" onclick="cancelEditingRushRoute();return false" style="color:var(--gold);text-decoration:underline">Cancelar edição</a></div>` : ''}
  <div class="row" style="margin-bottom:12px">
    <div style="flex:1"><input class="inp" id="newRushRouteName" placeholder="Nome da rota (ex: Iniciante, Foco Alz...)" value="${editingRoute ? esc(editingRoute.name) : ''}" onkeydown="if(event.key==='Enter')createRushRouteFromCart()"></div>
    <button class="btn btn-d" onclick="createRushRouteFromCart()" title="${editingRoute ? 'Sobrescreve a rota que está sendo editada' : 'Salva as DGs e repetições atuais como um molde reutilizável, sem data fixa'}"><i class="ti ti-route"></i>${editingRoute ? 'Salvar alterações da rota' : 'Salvar como rota'}</button>
  </div>` : ''}
  ${AppState.rushHistory[AppState.rushCartDate] ? `<div style="font-size:12px;color:var(--acc);background:var(--acc-bg,rgba(34,211,238,.08));border:1px solid var(--acc-border,rgba(34,211,238,.3));border-radius:6px;padding:7px 12px;margin-bottom:10px"><i class="ti ti-info-circle"></i> Este dia (${formatDateBR(AppState.rushCartDate)}) já tem um rush salvo. Ao salvar, ele é <strong>atualizado</strong> com o carrinho atual — não cria outro nem duplica.</div>` : ''}
  ${!AppState.rushCart.length ? '<div class="empty">Nenhuma DG adicionada. Escolha uma DG acima e clique em Adicionar, ou aplique uma rota salva.</div>' : `
  <table class="t-cards"><thead><tr><th>DG</th><th>Tipo</th><th>Reps</th><th>Reset</th><th>Custo (breakdown)</th><th style="width:40px"></th></tr></thead><tbody>
  ${AppState.rushCart.map((item, i) => {
    // Breakdown por item já vem pronto de calculateRushCartCost (cost.items, mesma posição do
    // carrinho) — não recalcula a fórmula aqui, só monta o texto/badges em cima do número pronto.
    const b = cost.items[i];
    const breakdown = [];
    if (b.alzCost > 0) breakdown.push(`${formatAlzGamer(item.alzCost)} × ${item.repetitions} = ${formatAlzGamer(b.alzCost)}`);
    if (b.totalTickets > 0) breakdown.push(`${b.totalTickets} ticket${b.totalTickets > 1 ? 's' : ''} × ${formatAlzGamer(b.ticketPrice)} = ${formatAlzGamer(b.ticketCost)}`);
    if (b.entryGems > 0) breakdown.push(`${b.entryGems} gema${b.entryGems > 1 ? 's' : ''} de entrada × ${formatAlzGamer(b.costPerGem)} = ${formatAlzGamer(b.entryGemCost)}`);
    if (item.usedReset) breakdown.push(`${b.resetGemQuantity} gema${b.resetGemQuantity !== 1 ? 's' : ''} de reset × ${formatAlzGamer(b.resetGemUnitPrice)} = ${formatAlzGamer(b.resetCost)}`);
    const typeBadges = [];
    if (b.totalTickets > 0) typeBadges.push(`<span class="badge badge-acc">${b.totalTickets}× Ticket</span>`);
    if (b.entryGems > 0) typeBadges.push(`<span class="badge badge-warn">${b.entryGems}× Gema</span>`);
    if (!typeBadges.length) typeBadges.push('<span class="badge badge-muted">Alz</span>');
    const resetWorthRow = item.usedReset ? resetWorthByName[item.name] : null;
    const resetWarning = resetWorthRow && !resetWorthRow.worth
      ? ` <i class="ti ti-alert-triangle" style="color:var(--err)" title="Pelo seu histórico, resetar essa DG não compensa: líquido de ${formatAlzGamer(resetWorthRow.netAlzPerRun)}/run não cobre o custo do reset. Veja 'Vale a pena resetar?' em Sessões de farme."></i>`
      : '';
    // Aviso mais amplo que o de reset: essa DG rende negativo no seu histórico mesmo sem contar
    // reset nenhum — reaproveita netAlzPerRun (mesmo cálculo de "Qual DG rende mais" em Sessões de
    // farme). Não repete se o aviso de reset já apareceu (mesma raiz, um é mais específico).
    const dgStat = dgStatsByName[item.name];
    const negativeWarning = !resetWarning && dgStat?.netAlzPerRun != null && dgStat.netAlzPerRun < 0
      ? ` <i class="ti ti-alert-triangle" style="color:var(--warn)" title="Pelo seu histórico, o líquido desta DG (já descontando custo de entrada) é ${formatAlzGamer(dgStat.netAlzPerRun)}/run — negativo mesmo sem reset. Veja 'Qual DG rende mais' em Sessões de farme."></i>`
      : '';
    return `<tr>
      <td data-label="DG" style="font-weight:500">${esc(item.name)}${negativeWarning}</td>
      <td data-label="Tipo">${typeBadges.join(' ')}</td>
      <td data-label="Reps">${item.repetitions}×</td>
      <td data-label="Reset">${item.usedReset ? '<span class="badge badge-warn">Sim</span>' : '<span class="badge badge-muted">Não</span>'}${resetWarning}</td>
      <td data-label="Custo">${renderAlzValue(b.total, true)}<div style="font-size:var(--fs-2xs);color:var(--muted);margin-top:2px">${breakdown.join(' + ')}</div></td>
      <td><button aria-label="Remover ${esc(item.name)} do carrinho" title="Remover" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeDungeonFromCart(${i})"><i class="ti ti-trash"></i></button></td>
    </tr>`;
  }).join('')}
  </tbody></table>`}
  <div id="rMsg" style="display:none;margin-top:10px;padding:7px 12px;background:var(--ok-bg);border:1px solid var(--ok-border);border-radius:6px;color:var(--ok);font-size:12px"></div>
</div>`;

  const metricsBlock = `
<div class="g6" style="margin-bottom:12px">
  <div class="metric"><div class="metric-lbl">Alz das DGs</div><div class="metric-val" id="m-a" style="color:${getAlzTierColor(cost.alzFromDungeons)}" title="${formatNumber(cost.alzFromDungeons)} Alz">${formatAlzGamer(cost.alzFromDungeons)}</div></div>
  <div class="metric"><div class="metric-lbl">Tickets totais</div><div class="metric-val" id="m-t">${cost.ticketCount}</div></div>
  <div class="metric"><div class="metric-lbl">Custo tickets</div><div class="metric-val" id="m-ct" style="color:${getAlzTierColor(cost.ticketCost)}" title="${formatNumber(cost.ticketCost)} Alz">${formatAlzGamer(cost.ticketCost)}</div></div>
  <div class="metric"><div class="metric-lbl">Gemas totais</div><div class="metric-val" id="m-g">${cost.gemCount}</div></div>
  <div class="metric"><div class="metric-lbl">Custo gemas (entrada + reset)</div><div class="metric-val" id="m-cg" style="color:${getAlzTierColor(cost.gemCost)}" title="${formatNumber(cost.gemCost)} Alz">${formatAlzGamer(cost.gemCost)}</div></div>
  <div class="metric"><div class="metric-lbl">Custo dos créditos</div><div class="metric-val" id="m-cc" style="color:${getAlzTierColor(cost.creditsCost)}" title="${formatNumber(cost.creditsCost)} Alz">${formatAlzGamer(cost.creditsCost)}</div></div>
  <div class="metric hl"><div class="metric-lbl">Custo final geral</div><div class="metric-val" id="m-tot" style="color:${getAlzTierColor(cost.total)}" title="${formatNumber(cost.total)} Alz">${formatAlzGamer(cost.total)}</div></div>
  <div class="metric"><div class="metric-lbl">Retorno esperado</div><div class="metric-val" style="color:${getAlzTierColor(expectedReturn)}" title="${formatNumber(expectedReturn)} Alz">${formatAlzGamer(expectedReturn)}</div>${missingReturnCount ? `<div class="metric-lbl" style="margin-top:2px">${missingReturnCount} DG sem histórico, fora da conta</div>` : ''}</div>
  <div class="metric" style="border-left-color:${expectedProfit >= 0 ? 'var(--ok-border)' : 'var(--err-border)'}"><div class="metric-lbl">Lucro esperado hoje</div><div class="metric-val" style="color:${expectedProfit >= 0 ? 'var(--ok)' : 'var(--err)'}" title="${formatNumber(expectedProfit)} Alz">${expectedProfit >= 0 ? '+' : ''}${formatAlzGamer(expectedProfit)}</div></div>
</div>`;

  const creditsCard = `
<div class="card" style="padding:0;overflow:hidden">
  <div style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleCreditsManager()">
    <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px"><i class="ti ti-clock-hour-4"></i>Créditos de macro</div>
    <i class="ti ti-chevron-${AppState.isCreditsManagerOpen ? 'up' : 'down'}" style="color:var(--muted)"></i>
  </div>
  ${AppState.isCreditsManagerOpen ? `<div style="border-top:1px solid var(--border);padding:14px 16px">
  ${infoToggle('rush-credits', `Cada crédito dá 1h de uso do macro, utilizável em qualquer DG (não é por-DG como tickets/gemas). O custo de cada categoria tem uma parte fixa (Alz + tickets, regra do jogo — só muda se a equipe do servidor mexer no preço, por isso não é campo pra digitar) e uma parte variável: 1 unidade de um item específico, que muda de preço todo dia. Vincule o item de cada categoria abaixo e o preço vem sozinho de Cálculo de farme — sem vínculo (ou sem preço cadastrado ainda), cai num campo manual. Limite de compra: ${CREDIT_DAILY_LIMIT} por dia, pra cada categoria. A sugestão de quantidade cruza a dificuldade de cada DG do carrinho (Avançada/Intermediária/Iniciante) com o tempo/run real das suas sessões — ${creditNeeds.missingDataCount ? `${creditNeeds.missingDataCount} DG(s) do carrinho ainda sem tempo/run farmado, não entram na conta.` : 'cobre todas as DGs do carrinho de hoje.'} "Vale a pena?" compara o custo de 1h de macro com o Alz/hora da sua melhor DG (mesmo dado de "Qual DG rende mais" em Sessões de farme) — 1 crédito só compensa se custar menos do que essa hora renderia farmando de verdade.`)}
  <datalist id="creditItemSugg">${AppState.knownItemNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  <table><thead><tr><th>Categoria</th><th style="width:110px">Qtd. comprada</th><th style="width:220px">Item do dia (preço variável)</th><th>Subtotal</th></tr></thead><tbody>
  ${CREDIT_CATEGORIES.map(cat => {
    const { quantity } = AppState.rushCredits[cat.id];
    const itemName = AppState.rushCreditItemNames[cat.id];
    const itemPriceInfo = getCreditItemPrice(cat.id);
    const unitCost = getCreditUnitCost(cat.id);
    const subtotal = quantity * unitCost;
    const needed = creditNeeds[cat.id] || 0;
    const fixed = CREDIT_TIER_COSTS[cat.id];
    const overLimit = isOverDailyCreditLimit(quantity);
    // Vale a pena comprar esse crédito? 1h de macro custando menos do que 1h rende na sua melhor
    // DG é o piso mínimo pra valer — só aparece com dado real (histórico + custo do crédito).
    const creditWorthIt = bestAlzPerHour > 0 && unitCost > 0
      ? `<div style="font-size:var(--fs-2xs);color:${unitCost < bestAlzPerHour ? 'var(--ok)' : 'var(--warn)'};margin-top:2px" title="Sua melhor entrada rende ${formatAlzGamer(bestAlzPerHour)}/h (ver Qual DG rende mais em Sessões de farme)">${unitCost < bestAlzPerHour ? '<i class="ti ti-check"></i> vale a pena' : '<i class="ti ti-alert-triangle"></i> não compensa'} vs ${formatAlzGamer(bestAlzPerHour)}/h</div>`
      : '';
    return `<tr>
      <td style="font-weight:500">${cat.name}${needed > 0 ? ` <span style="font-size:var(--fs-2xs);font-weight:400;color:${needed > CREDIT_DAILY_LIMIT ? 'var(--warn)' : 'var(--gold)'}" title="Baseado no tempo/run real das DGs dessa faixa no carrinho de hoje${needed > CREDIT_DAILY_LIMIT ? ` — passa do limite de ${CREDIT_DAILY_LIMIT}/dia` : ''}">≈${needed} sugerido${needed > 1 ? 's' : ''}${needed > CREDIT_DAILY_LIMIT ? ' ⚠' : ''}</span>` : ''}
        <div style="font-size:var(--fs-2xs);color:var(--muted);font-weight:400;margin-top:2px">${formatAlzGamer(fixed.fixedAlz)} + ${fixed.fixedTickets}× ticket <span style="opacity:.7">(fixo)</span></div></td>
      <td><input class="inp inp-sm" type="number" min="0" value="${quantity || ''}" placeholder="0" onchange="setRushCreditQuantity('${cat.id}', this.value)">
        ${overLimit ? `<div style="font-size:var(--fs-2xs);color:var(--warn);margin-top:3px"><i class="ti ti-alert-triangle"></i> máx. ${CREDIT_DAILY_LIMIT}/dia</div>` : ''}</td>
      <td><input class="inp inp-sm" list="creditItemSugg" value="${esc(itemName)}" placeholder="ex: Núcleo Iniciante" onblur="setRushCreditItemName('${cat.id}', this.value)">
        ${itemPriceInfo.linked
          ? `<div style="font-size:var(--fs-2xs);color:var(--ok);margin-top:3px"><i class="ti ti-check"></i> ${formatAlzGamer(itemPriceInfo.price)} — puxado de Cálculo de farme</div>`
          : itemName
            ? `<div style="font-size:var(--fs-2xs);color:var(--warn);margin-top:3px">Sem preço cadastrado pra "${esc(itemName)}" em Cálculo de farme — cadastre lá (o nome precisa bater) ou digite o preço de hoje aqui:</div>
               <input class="inp inp-sm" type="text" inputmode="numeric" style="margin-top:3px" value="${AppState.rushCredits[cat.id].marketPrice ? formatNumber(AppState.rushCredits[cat.id].marketPrice) : ''}" placeholder="preço manual" oninput="maskAlzInputLive(this)" onblur="setRushCreditMarketPrice('${cat.id}', this.value)">`
            : `<input class="inp inp-sm" type="text" inputmode="numeric" style="margin-top:3px" value="${AppState.rushCredits[cat.id].marketPrice ? formatNumber(AppState.rushCredits[cat.id].marketPrice) : ''}" placeholder="ou digite o preço na mão" oninput="maskAlzInputLive(this)" onblur="setRushCreditMarketPrice('${cat.id}', this.value)">`}</td>
      <td>${renderAlzValue(subtotal, true)}<div style="font-size:var(--fs-2xs);color:var(--muted);margin-top:2px">${formatAlzGamer(unitCost)}/un.</div>${creditWorthIt}</td>
    </tr>`;
  }).join('')}
  </tbody></table>
  ${creditNeeds.avancado + creditNeeds.intermediario + creditNeeds.iniciante > 0 ? `<button class="btn btn-d btn-xs" style="margin-top:10px" onclick="applySuggestedCreditQuantities()"><i class="ti ti-refresh"></i>Preencher com a sugestão</button>` : ''}
  </div>` : ''}
</div>`;

  const dungeonManagerCard = `
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
          <button class="btn btn-d btn-xs" aria-label="Editar DG ${esc(dg.name)}" title="Editar" onclick="startEditingDungeon('${dg.id}')"><i class="ti ti-edit"></i></button>
          <button class="btn btn-xs" aria-label="Excluir DG ${esc(dg.name)}" title="Excluir" style="background:var(--err-bg);color:var(--err);border:none" onclick="deleteDungeon('${dg.id}')"><i class="ti ti-trash"></i></button>
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
      <button class="btn btn-d" aria-label="Restaurar lista de DGs padrão" onclick="resetDungeonList()" title="Restaurar padrão"><i class="ti ti-refresh"></i></button>
    </div></div>` : '<div style="font-size:12px;color:var(--muted)">Só admins podem editar essa lista.</div>'}
  </div>` : ''}
</div>`;

  // Planejado × realizado. A página inteira é previsão — estima custo, retorno e lucro todo dia —
  // e nunca conferia a própria aposta: o histórico mostrava só o que você GASTOU. Sem o resultado
  // ao lado, "lucro esperado" nunca é validado e o jogador não descobre se a estimativa do app é
  // otimista ou pessimista pro caso dele. O dado sempre esteve em dgSessions, só não era cruzado.
  const rushOutcomes = computeRushOutcomes();
  const savedRushesCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-history"></i>Rushes salvos</div>
  <span style="font-size:12px;color:var(--muted)">Investido no total: ${renderAlzValue(Object.values(AppState.rushHistory).reduce((s, r) => s + r.total, 0), true)}</span></div>
  ${infoToggle('rush-saved', 'O <strong>realizado</strong> é o Alz de todas as sessões daquele dia, valorizado pelos preços de HOJE (mesma base de "Qual DG rende mais", pra comparar dias diferentes na mesma régua). O <strong>resultado</strong> é realizado menos o custo do rush daquele dia — é o número que diz se o plano valeu. Dia sem sessão registrada aparece como "sem sessão": o rush foi salvo, mas não há como saber o que rendeu.')}
  ${!Object.keys(AppState.rushHistory).length ? '<div class="empty">Nenhum rush salvo.</div>' : `
  <table class="t-cards"><thead><tr><th>Data</th><th>DGs</th><th>Custo</th><th>Realizado</th><th>Resultado</th><th style="width:70px">Ações</th></tr></thead><tbody>
  ${Object.entries(AppState.rushHistory).sort(([a], [b]) => b.localeCompare(a)).map(([date, rush]) => {
    const out = rushOutcomes[date];
    return `<tr>
    <td data-label="Data">${formatDateBR(date)}</td>
    <td data-label="DGs">${rush.items?.length || 0} DGs</td>
    <td data-label="Custo">${renderAlzValue(rush.total, true)}</td>
    <td data-label="Realizado">${out ? renderAlzValue(out.realized) : '<span style="color:var(--muted)">sem sessão</span>'}</td>
    <td data-label="Resultado">${out
      ? `<strong style="color:${out.result >= 0 ? 'var(--ok)' : 'var(--err)'}" title="${formatNumber(out.result)} Alz">${out.result >= 0 ? '+' : ''}${formatAlzGamer(out.result)}</strong>`
      : '<span style="color:var(--muted)">—</span>'}</td>
    <td><div style="display:flex;gap:4px">
      <button class="btn btn-d btn-xs" aria-label="Editar rush de ${formatDateBR(date)}" onclick="editSavedRush('${date}')" title="Editar (adicionar/remover DGs)"><i class="ti ti-edit"></i></button>
      <button class="btn btn-d btn-xs" aria-label="Duplicar rush de ${formatDateBR(date)} pra hoje" onclick="duplicateSavedRush('${date}')" title="Duplicar pra hoje"><i class="ti ti-copy"></i></button>
      <button aria-label="Remover rush de ${formatDateBR(date)}" title="Remover" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteRushForDay('${date}')"><i class="ti ti-trash"></i></button>
    </div></td>
  </tr>`;
  }).join('')}
  </tbody></table>`}
</div>`;

  // Ordem pensada pro fluxo de verdade do dia a dia: parâmetros → rotas (caminho rápido) →
  // adicionar DG → ver o carrinho crescer (antes esses dois ficavam separados por Créditos e
  // Gerenciar DGs, então adicionar uma DG não dava feedback visual até rolar a página inteira) →
  // métricas agregadas → configuração ocasional (créditos, catálogo de DG) → histórico no fim.
  return `
<div class="pg-title"><i class="ti ti-swords" style="color:var(--acc)"></i>Planejamento de Rush</div>
<div class="pg-sub">Diga quanto tempo você tem e o FarmHub monta a rota — ou monte o carrinho de DGs na mão. Salve por data e o custo é deduzido do farme daquele dia.</div>
<button class="btn btn-d btn-xs" style="margin-bottom:14px" onclick="openGuidedRush()"><i class="ti ti-bolt" style="color:var(--gold)"></i>Prefere passo a passo? Montar no modo guiado</button>

${timeSuggestionCard}
${paramsCard}
${routesCard}
${addDgCard}
${cartCard}
${metricsBlock}
${creditsCard}
${dungeonManagerCard}
${savedRushesCard}`;
}
