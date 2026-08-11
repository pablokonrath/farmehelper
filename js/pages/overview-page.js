import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getAllDrops, getItemPrice, summarizeDropsByItem, getTodayFarmedAlz, getTodayFarmRate } from '../features/drops.js';
import { getHistoricalSummary, countUncoveredDays, getPeriodTrend, getRushSpentInRange } from '../features/drop-history.js';
import { infoToggle, collapsibleCard } from '../features/ui-toggles.js';
import { getRareDropHistory, getRarityDroughts } from '../features/rare-drops.js';
import { getEventConfig, computeEventProgress } from '../features/event-tracker.js';
import { getRarityMaxPercent, getMinRunsToJudgeRarity } from '../features/item-dungeon-sources.js';
import { dropRateRange, rateConfidence } from '../utils/stats.js';
import { summarizeManualDropBatches } from '../features/manual-drops.js';
import { computeSalesSummary } from '../features/sales.js';
import { computePersonalBests, getActiveSessionSummary, computeDgComparison, computeRunsDoneToday } from '../features/dg-session.js';
import { formatNumber, formatAlzGamer, getAlzTierColor, renderAlzValue, formatDateBR } from '../utils/formatting.js';
import { renderDateInputBR } from '../utils/date-input.js';
import { todayISODate } from '../utils/parsing.js';
import { esc, escAttr } from '../utils/escape.js';
import { renderPage } from '../router.js';

// "1h 20min" / "45min" / "+12h" — usado na projeção "nesse ritmo, meta em ~X".
function formatHoursShort(hours) {
  const totalMin = Math.round(hours * 60);
  if (totalMin > 720) return '+12h';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// "O que fazer agora" — a Visão geral conta o passado; este bloco é o único que aponta o próximo
// passo. Toda a inteligência pra isso já existia no app (melhor DG por run, melhor rota por
// lucro/hora, progresso do rush de hoje), mas morava em Sessões de farme: quem abria a Visão geral
// via o placar e tinha que ir procurar a decisão em outra página.
//
// Uma sugestão só, a mais relevante do momento, em ordem de prioridade — não uma lista de opções.
function buildNextStepCard() {
  const ativa = getActiveSessionSummary();
  if (ativa) {
    return `
<div class="card" style="border-color:var(--ok-border)">
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <i class="ti ti-player-play" style="color:var(--ok);font-size:20px"></i>
    <div style="flex:1;min-width:200px">
      <div style="font-weight:700">Farmando em ${esc(ativa.dungeonName)}</div>
      <div style="font-size:var(--fs-sm);color:var(--muted)">${ativa.dropCount} drops · ${formatAlzGamer(ativa.totalAlz)}${ativa.alzPerHour != null ? ` · ${formatAlzGamer(ativa.alzPerHour)}/h` : ''}</div>
    </div>
    <button class="btn btn-d btn-xs" onclick="navigateTo('sessoes')"><i class="ti ti-arrow-right"></i>Ver sessão</button>
  </div>
</div>`;
  }

  const hoje = todayISODate();
  const rush = AppState.rushHistory[hoje];
  const comparacao = computeDgComparison();
  const melhorDg = comparacao.find(c => c.alzPerRun != null);

  // 1) Rush do dia montado e ainda com runs faltando: terminar o plano vem antes de otimizar.
  const pendentes = !rush?.items?.length ? [] : rush.items
    .map(it => ({ it, faltam: it.repetitions - computeRunsDoneToday(it.name) }))
    .filter(x => x.faltam > 0);
  if (pendentes.length) {
    const prox = pendentes[0];
    const totalFaltam = pendentes.reduce((s, x) => s + x.faltam, 0);
    return `
<div class="card card-featured">
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <i class="ti ti-checklist" style="color:var(--gold);font-size:20px"></i>
    <div style="flex:1;min-width:200px">
      <div style="font-weight:700">Continue o rush de hoje</div>
      <div style="font-size:var(--fs-sm);color:var(--muted)">Faltam <strong style="color:var(--txt)">${totalFaltam} run(s)</strong> — a próxima é <strong style="color:var(--txt)">${esc(prox.it.name)}</strong> (${prox.faltam} restante(s))</div>
    </div>
    <button class="btn btn-p btn-xs" onclick="navigateTo('sessoes')"><i class="ti ti-player-play"></i>Iniciar sessão</button>
  </div>
</div>`;
  }

  // 2) Sem rush montado hoje: aponta onde a entrada rende mais, que é a decisão que o limite
  // diário de runs impõe. Só com dado real — sem histórico, não inventa recomendação.
  if (!rush?.items?.length && melhorDg) {
    return `
<div class="card card-featured">
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <i class="ti ti-bulb" style="color:var(--gold);font-size:20px"></i>
    <div style="flex:1;min-width:200px">
      <div style="font-weight:700">Você ainda não montou o rush de hoje</div>
      <div style="font-size:var(--fs-sm);color:var(--muted)">Pelo seu histórico, a entrada rende mais em <strong style="color:var(--txt)">${esc(melhorDg.dungeonName)}</strong> — ${formatAlzGamer(melhorDg.alzPerRun)}/run</div>
    </div>
    <button class="btn btn-p btn-xs" onclick="navigateTo('rush')"><i class="ti ti-swords"></i>Montar rush</button>
  </div>
</div>`;
  }

  // 3) Rush completo: reconhece e sai do caminho.
  if (rush?.items?.length) {
    return `
<div class="card" style="border-color:var(--ok-border)">
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <i class="ti ti-circle-check" style="color:var(--ok);font-size:20px"></i>
    <div style="flex:1;min-width:200px">
      <div style="font-weight:700">Rush de hoje concluído</div>
      <div style="font-size:var(--fs-sm);color:var(--muted)">Todas as runs planejadas foram feitas.${melhorDg ? ` Sobrou tempo? ${esc(melhorDg.dungeonName)} é a sua melhor entrada (${formatAlzGamer(melhorDg.alzPerRun)}/run).` : ''}</div>
    </div>
  </div>
</div>`;
  }

  return '';
}

// Card da meta de farme do dia: progresso, rendimento (Alz/h) e projeção de quando bate a meta
// nesse ritmo. Sempre sobre HOJE (não respeita os filtros de data da página, de propósito).
function buildMetaCard() {
  const goal = AppState.dailyGoalAlz;
  const todayFarmed = getTodayFarmedAlz();
  const rate = getTodayFarmRate();
  const met = goal > 0 && todayFarmed >= goal;
  const pct = goal > 0 ? Math.min(100, Math.round((todayFarmed / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - todayFarmed);

  let statusRight;
  if (met) {
    statusRight = '<span style="color:var(--ok);font-weight:600">🎉 Meta batida!</span>';
  } else if (rate && rate.alzPerHour > 0 && remaining > 0) {
    statusRight = `<span style="color:var(--muted)">faltam <strong style="color:var(--txt)">${formatAlzGamer(remaining)}</strong> · nesse ritmo, meta em <strong style="color:var(--acc)">~${formatHoursShort(remaining / rate.alzPerHour)}</strong></span>`;
  } else {
    statusRight = `<span style="color:var(--muted)">faltam <strong style="color:var(--txt)">${formatAlzGamer(remaining)}</strong></span>`;
  }

  // A meta em si continua bruta (é o que o título promete), mas quem gastou em rush hoje pode
  // bater a meta bruta e ainda assim estar no vermelho de verdade — sem esta linha, isso ficava
  // invisível bem no card mais em destaque da página. Só aparece quando há gasto de rush hoje,
  // pra não poluir o card em dias sem rush.
  const rushSpentHoje = AppState.rushHistory[todayISODate()]?.total || 0;
  const netHoje = todayFarmed - rushSpentHoje;
  // Retorno = líquido ÷ gasto, não líquido ÷ farmado — é "cada Alz que você meteu em rush voltou
  // quanto", a pergunta que decide se vale manter o nível de rush atual ou reduzir.
  const roiHoje = rushSpentHoje > 0 ? Math.round((netHoje / rushSpentHoje) * 100) : null;
  const liquidoHojeTexto = rushSpentHoje <= 0 ? '' : `
  <div style="margin-top:6px;font-size:11px;color:var(--muted)">
    Líquido hoje (descontando ${formatAlzGamer(rushSpentHoje)} de rush): <strong style="color:${getAlzTierColor(netHoje)}" title="${formatNumber(netHoje)} Alz">${formatAlzGamer(netHoje)}</strong>
    <span style="color:${roiHoje >= 0 ? 'var(--ok)' : 'var(--err)'}">· retorno ${roiHoje >= 0 ? '+' : ''}${roiHoje}%</span>
  </div>`;

  return `
<div class="card card-featured">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-target" style="color:var(--gold)"></i>Meta de farme — hoje</div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="lbl" style="margin:0">Meta (Alz)</span>
      <input class="inp" style="width:160px" type="text" inputmode="numeric" placeholder="ex: 500.000.000"
        value="${goal > 0 ? formatNumber(goal) : ''}" oninput="maskAlzInputLive(this)" onblur="setDailyGoal(this.value)">
    </div>
  </div>
  ${goal <= 0
    ? '<div class="empty" style="padding:12px 0">Defina uma meta de Alz para o dia e acompanhe o progresso + o rendimento por hora aqui.</div>'
    : `
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px">
    <span style="font-weight:700;font-size:16px;color:${met ? 'var(--ok)' : getAlzTierColor(todayFarmed)}" title="${formatNumber(todayFarmed)} Alz">${formatAlzGamer(todayFarmed)}</span>
    <span style="font-size:12px;color:var(--muted)">de ${formatAlzGamer(goal)} · <strong style="color:${met ? 'var(--ok)' : 'var(--txt)'}">${pct}%</strong></span>
  </div>
  <div style="height:10px;background:var(--surf2);border-radius:6px;overflow:hidden">
    <div style="height:100%;width:${pct}%;background:${met ? 'var(--ok)' : 'var(--acc)'};box-shadow:0 0 10px ${met ? 'var(--ok)' : 'var(--acc)'};transition:width .3s"></div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px;flex-wrap:wrap;gap:8px">
    <span style="color:var(--muted)"><i class="ti ti-bolt" style="color:var(--gold)"></i> Rendimento: <strong style="color:var(--txt)">${rate ? formatAlzGamer(rate.alzPerHour) + '/h' : '—'}</strong></span>
    ${statusRight}
  </div>`}
  ${liquidoHojeTexto}
</div>`;
}

// Recorde pessoal: melhor dia e melhor sessão única já farmados. Não ajuda a decidir nada — é só
// um "high score", igual qualquer jogo, pra motivar olhando pros próprios números de antes.
function buildPersonalBestsCard() {
  const bests = computePersonalBests();
  if (!bests) return '';
  return collapsibleCard({
    id: 'overview-records',
    icon: 'ti-trophy',
    iconColor: 'var(--gold)',
    title: 'Recorde pessoal',
    resumo: `<span style="font-size:var(--fs-sm);color:var(--muted)">melhor dia</span> <strong style="color:var(--gold)">${formatAlzGamer(bests.bestDay.totalAlz)}</strong>`,
    body: `
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <div style="flex:1;min-width:180px;padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px">
      <div style="font-size:11px;color:var(--muted)">🏆 Melhor dia</div>
      <div style="color:var(--gold);font-weight:700;font-size:16px" title="${formatNumber(bests.bestDay.totalAlz)} Alz">${formatAlzGamer(bests.bestDay.totalAlz)}</div>
      <div style="font-size:11px;color:var(--muted)">${formatDateBR(bests.bestDay.date)}</div>
    </div>
    <div style="flex:1;min-width:180px;padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px">
      <div style="font-size:11px;color:var(--muted)">⚔️ Melhor sessão única</div>
      <div style="color:var(--gold);font-weight:700;font-size:16px" title="${formatNumber(bests.bestSession.totalAlz)} Alz">${formatAlzGamer(bests.bestSession.totalAlz)}</div>
      <div style="font-size:11px;color:var(--muted)">${esc(bests.bestSession.dungeonName)} · ${formatDateBR(bests.bestSession.date)}</div>
    </div>
  </div>`,
  });
}

// Painel do evento: conta o item de evento aplicando o multiplicador de cada DG. Isolado do resto
// da página porque evento é temporário — desligou, some, e nenhum número permanente muda.
function buildEventCard() {
  const cfg = getEventConfig();
  const progresso = computeEventProgress();
  const aberto = cfg.enabled;

  const configuracao = !aberto ? '' : `
    <div class="row" style="align-items:flex-end;margin-bottom:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><label class="lbl">Item do evento</label>
        <input class="inp" list="eventItemSugg" value="${esc(cfg.itemName)}" placeholder="ex: Fragmento Prismático" onblur="setEventItemName(this.value)">
        <datalist id="eventItemSugg">${[...new Set(AppState.knownItemNames || [])].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="hint">Casa por trecho do nome — não precisa ser exato.</div></div>
      <div style="width:150px"><label class="lbl">Contar a partir de</label>
        ${renderDateInputBR({ id: 'eventSince', value: cfg.since, onChange: 'setEventSince' })}</div>
    </div>
    <label class="lbl">Quanto cada DG vale por drop</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      ${AppState.dungeonList.filter(d => cfg.multipliers[d.id]).map(d => `<span style="display:flex;align-items:center;gap:6px;background:var(--surf2);border:1px solid var(--border);border-radius:8px;padding:5px 10px;font-size:var(--fs-sm)">
        ${esc(d.name)} <span style="color:var(--muted)">×</span>
        <input class="inp inp-sm" type="number" min="0" value="${cfg.multipliers[d.id]}" style="width:56px" onchange="setEventMultiplier('${escAttr(d.id)}', this.value)">
      </span>`).join('')}
    </div>
    <div class="row" style="align-items:flex-end;margin-bottom:12px">
      <div style="flex:1"><label class="lbl">Adicionar DG ao evento</label>
        <select class="inp" onchange="if(this.value){setEventMultiplier(this.value, 1);this.value=''}">
          <option value="">Escolher DG…</option>
          ${AppState.dungeonList.filter(d => !cfg.multipliers[d.id]).map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}
        </select></div>
    </div>`;

  const resultado = !progresso ? '' : !progresso.totalBruto ? `
    <div class="empty" style="padding:12px 0">Nenhum "${esc(progresso.itemName)}" registrado em sessão ainda${cfg.since ? ` desde ${formatDateBR(cfg.since)}` : ''}.</div>`
    : `
    <div class="kpi" style="margin-bottom:12px">
      <div class="kpi-lbl">Total do evento</div>
      <div class="kpi-val" style="color:var(--gold)">${progresso.totalContado.toLocaleString('pt-BR')}</div>
      <div class="kpi-sub">de ${progresso.totalBruto.toLocaleString('pt-BR')} drops registrados${progresso.brutoForaDeMultiplicador ? ` · ${progresso.brutoForaDeMultiplicador} caíram em DG sem multiplicador (não contados)` : ''}</div>
    </div>
    <table><thead><tr><th>DG</th><th>Drops</th><th>Vale</th><th>Conta como</th></tr></thead><tbody>
      ${progresso.porDg.map(l => `<tr>
        <td style="font-weight:500">${esc(l.dungeonName)}</td>
        <td>${l.bruto.toLocaleString('pt-BR')}×</td>
        <td style="color:var(--muted)">×${l.mult}</td>
        <td style="color:var(--gold);font-weight:700">${l.contado.toLocaleString('pt-BR')}</td>
      </tr>`).join('')}
    </tbody></table>`;

  // O liga/desliga fica DENTRO do corpo, não no cabeçalho: o cabeçalho inteiro é a área de
  // clique pra colapsar, e um toggle ali dentro capturaria/competiria com esse clique.
  const chave = `<label class="tgl-row" style="display:flex;align-items:center;gap:8px;font-size:var(--fs-sm);color:var(--muted);cursor:pointer;margin-bottom:12px">
      <label class="tgl"><input type="checkbox" ${aberto ? 'checked' : ''} onchange="setEventEnabled(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
      Evento ativo
    </label>`;

  return collapsibleCard({
    id: 'overview-event',
    icon: 'ti-gift',
    iconColor: 'var(--gold)',
    title: 'Evento',
    // Fechado, o cabeçalho ainda entrega o número que importa — o total já multiplicado.
    resumo: aberto && progresso?.totalContado
      ? `<strong style="color:var(--gold)">${progresso.totalContado.toLocaleString('pt-BR')}</strong> <span style="font-size:var(--fs-sm);color:var(--muted)">${esc(progresso.itemName)}</span>`
      : '<span class="badge badge-muted">desligado</span>',
    defaultOpen: aberto && !progresso?.totalContado,
    body: `${chave}${!aberto
      ? '<div style="font-size:var(--fs-sm);color:var(--muted)">Ligue quando houver evento em que um item vale quantidade diferente por DG (ex: fragmento que vale 3 numa DG e 5 em outra). O FarmHub faz a conta pra você.</div>'
      : `${infoToggle('overview-event-info', 'O log do jogo registra só "caiu 1 item" — ele não sabe em qual DG. Quem sabe é o histórico de sessões, então a contagem aqui usa as sessões: um drop só entra com o multiplicador se caiu dentro de uma sessão marcada naquela DG. Como o FarmHub abre e encerra sessão sozinho, na prática cobre quase tudo — e o que ficou de fora aparece declarado abaixo, em vez de ser omitido. Fica num painel próprio porque evento é temporário: nada disso mexe no Total de farme, Top itens ou Relatório.')}
      ${configuracao}${resultado}`}`,
  });
}

export function setTrendPeriod(dias) {
  AppState.trendPeriodDays = parseInt(dias, 10) === 7 ? 7 : 30;
  renderPage();
}

export function setTrendMode(liquido) {
  AppState.trendShowNet = !!liquido;
  renderPage();
}

// Card único de comparação temporal. Antes eram dois ("Sua semana" 7d×7d e "Sua evolução" 30d×30d)
// dizendo a mesma coisa em janelas diferentes e ocupando quase uma tela de celular cada. Agora é
// um card com seletor de período — mesma informação, um terço do espaço.
//
// Compara pela média por DIA FARMADO, não pelo total: se num período você jogou 20 dias e no outro
// 5, o total falaria mais sobre presença do que sobre o quanto o farme rende.
function buildTrendCard() {
  const dias = AppState.trendPeriodDays === 7 ? 7 : 30;
  const liquido = !!AppState.trendShowNet;
  const blocos = getPeriodTrend(dias, 3);
  if (blocos.filter(b => b.diasComFarme > 0).length < 2) return '';

  const [atual, anterior] = blocos;
  // Bruto = só o valor do que caiu. Líquido = bruto − gasto em rush (crédito/tickets/gemas) dos
  // mesmos dias, então pode ficar negativo — dia em que o rush custou mais do que rendeu.
  const metricaBloco = b => liquido ? b.netPorDiaFarmado : b.alzPorDiaFarmado;
  // Exige farme nos DOIS blocos comparados, não só "2 blocos com farme em algum lugar": se você
  // parou de farmar no período atual, a frase dizia "rendeu -100%" enquanto o quadro ao lado
  // dizia "sem farme registrado" — duas afirmações contraditórias na mesma tela.
  const variacao = atual.diasComFarme > 0 && anterior?.diasComFarme > 0 && metricaBloco(anterior) > 0
    ? Math.round((metricaBloco(atual) / metricaBloco(anterior) - 1) * 100)
    : null;
  const subiu = variacao != null && variacao >= 0;
  const rotulo = dias === 7
    ? ['Últimos 7 dias', '7 dias antes', '7 dias antes disso']
    : ['Últimos 30 dias', '30 dias antes', '30 dias antes disso'];

  // Projeção: no ritmo atual, onde você fecha o período CALENDÁRIO corrente (semana Seg-Dom ou
  // mês em curso). Precisa do total acumulado DESSE período específico, do início dele até hoje —
  // não dá pra reaproveitar "atual" acima porque aquele bloco é uma janela ROLANTE (últimos 7/30
  // dias terminando hoje, sempre cheia), enquanto diaDoPeriodo conta dias do calendário. Misturar
  // os dois inflava a projeção: numa terça, diaDoPeriodo é 2, mas o total rolante já cobre 7 dias
  // inteiros — dividir um pelo outro multiplicava a taxa diária por ~3,5x.
  const hoje = new Date();
  const diaDoPeriodo = dias === 30 ? hoje.getDate() : (hoje.getDay() || 7);
  const totalDoPeriodo = dias === 30 ? new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate() : 7;
  const inicioPeriodo = dias === 30
    ? new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (diaDoPeriodo - 1));
  const inicioPeriodoIso = todayISODate(inicioPeriodo);
  const hojeIso = todayISODate(hoje);
  const periodoEmAndamento = getHistoricalSummary(inicioPeriodoIso, hojeIso, { respeitarFiltrosDaPagina: false });
  const diasFarmadosNoPeriodo = Object.values(periodoEmAndamento.totalsByDate).filter(v => v > 0).length;
  const totalPeriodoBase = liquido
    ? periodoEmAndamento.totalAlz - getRushSpentInRange(inicioPeriodoIso, hojeIso)
    : periodoEmAndamento.totalAlz;
  const ritmoPorDiaCorrido = diaDoPeriodo > 0 ? totalPeriodoBase / diaDoPeriodo : 0;
  const projecao = ritmoPorDiaCorrido * totalDoPeriodo;
  const projecaoTexto = diasFarmadosNoPeriodo < 2 ? '' : `
    <div style="font-size:var(--fs-sm);color:var(--muted);margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
      <i class="ti ti-target" style="color:var(--gold)"></i> No seu ritmo atual, ${dias === 30 ? 'este mês' : 'esta semana'} fecha em
      <strong style="color:${getAlzTierColor(projecao)}" title="${formatNumber(Math.round(projecao))} Alz">${formatAlzGamer(projecao)}</strong>
      <span style="font-size:var(--fs-2xs)">(${formatAlzGamer(totalPeriodoBase)}${liquido ? ' líquido' : ''} até agora, em ${diasFarmadosNoPeriodo} dia(s) de farme)</span>
    </div>`;

  // Retorno do bloco inteiro (não por dia): líquido ÷ gasto em rush do mesmo bloco. Só aparece em
  // modo Líquido com rush registrado — em Bruto não existe "investimento" pra comparar contra.
  const roiTexto = b => !liquido || !b.rushSpent ? '' : (() => {
    const roi = Math.round((b.netAlz / b.rushSpent) * 100);
    return `<div style="font-size:var(--fs-2xs);color:${roi >= 0 ? 'var(--ok)' : 'var(--err)'};margin-top:2px">retorno ${roi >= 0 ? '+' : ''}${roi}%</div>`;
  })();

  // Meta de semana/mês: extensão da Meta diária pra este card, que já sabe pra onde o período tá
  // indo. Sempre bruto (mesmo critério da meta diária), independente do toggle Bruto/Líquido
  // acima — esse toggle é só de exibição da comparação/projeção, não muda o que conta como meta.
  const metaPeriodo = dias === 30 ? AppState.monthlyGoalAlz : AppState.weeklyGoalAlz;
  const setMetaFn = dias === 30 ? 'setMonthlyGoal' : 'setWeeklyGoal';
  const metaAcumulado = periodoEmAndamento.totalAlz;
  const metaBatida = metaPeriodo > 0 && metaAcumulado >= metaPeriodo;
  const metaPct = metaPeriodo > 0 ? Math.min(100, Math.round((metaAcumulado / metaPeriodo) * 100)) : 0;
  const metaPeriodoTexto = `
    <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px;gap:8px;flex-wrap:wrap">
        <span style="color:var(--muted);display:flex;align-items:center;gap:6px">Meta ${dias === 30 ? 'do mês' : 'da semana'}
          <input class="inp inp-sm" style="width:110px" type="text" inputmode="numeric" placeholder="Alz" value="${metaPeriodo > 0 ? formatNumber(metaPeriodo) : ''}" oninput="maskAlzInputLive(this)" onblur="${setMetaFn}(this.value)"></span>
        ${metaPeriodo > 0 ? `<span style="color:${metaBatida ? 'var(--ok)' : 'var(--muted)'}">${metaBatida ? '🎉 batida' : `faltam ${formatAlzGamer(Math.max(0, metaPeriodo - metaAcumulado))}`}</span>` : ''}
      </div>
      ${metaPeriodo > 0 ? `<div style="height:6px;background:var(--surf2);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${metaPct}%;background:${metaBatida ? 'var(--ok)' : 'var(--acc)'}"></div>
      </div>` : ''}
    </div>`;

  const botaoPeriodo = (v, txt) => `<button class="btn btn-xs ${dias === v ? 'btn-p' : 'btn-d'}" onclick="setTrendPeriod(${v})">${txt}</button>`;
  const botaoModo = (v, txt) => `<button class="btn btn-xs ${liquido === v ? 'btn-p' : 'btn-d'}" onclick="setTrendMode(${v})">${txt}</button>`;

  return `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-chart-bar"></i>Sua evolução</div>
    <div style="display:flex;gap:6px">${botaoPeriodo(7, 'Semana')}${botaoPeriodo(30, 'Mês')}</div></div>
  <div style="display:flex;gap:6px;margin:-4px 0 10px">${botaoModo(false, 'Bruto')}${botaoModo(true, 'Líquido')}</div>
  ${infoToggle('overview-trend', `Compara blocos de ${dias} dias usando a média por <strong>dia farmado</strong> (não por dia corrido): se num período você jogou 20 dias e no outro 5, comparar o total diria mais sobre presença do que sobre o quanto seu farme rende. <strong>Bruto</strong> é só o valor dos itens que caíram; <strong>líquido</strong> desconta o que você gastou em rush (crédito, tickets, gemas) nos mesmos dias — pode ficar negativo se o rush custou mais do que rendeu naquele período. "Retorno" é o líquido dividido pelo gasto em rush do mesmo bloco. Só existe porque o FarmHub arquiva o histórico — o log do jogo sozinho não guarda tudo isso. Ignora o filtro de data acima de propósito: a janela deste card é a dele.`)}
  ${variacao == null ? '' : `<div style="font-size:13px;margin-bottom:12px">Nos últimos ${dias} dias você rendeu${liquido ? ' líquido' : ''} <strong style="color:${subiu ? 'var(--ok)' : 'var(--err)'}">${subiu ? '+' : ''}${variacao}%</strong> por dia farmado, comparado com os ${dias} dias anteriores.</div>`}
  <div class="g3">
    ${blocos.map((b, i) => `<div class="kpi">
      <div class="kpi-lbl">${rotulo[i]}</div>
      <div class="kpi-val" style="font-size:18px;color:${getAlzTierColor(metricaBloco(b))}" title="${formatNumber(Math.round(metricaBloco(b)))} Alz${liquido ? ' líquido' : ''} por dia farmado">${b.diasComFarme ? formatAlzGamer(metricaBloco(b)) : '—'}</div>
      <div class="kpi-sub">${b.diasComFarme ? `${liquido ? 'líquido ' : ''}por dia farmado · ${b.diasComFarme} dia(s)` : 'sem farme registrado'}</div>
      ${roiTexto(b)}
    </div>`).join('')}
  </div>
  ${projecaoTexto}
  ${metaPeriodoTexto}
</div>`;
}

// Raridades têm lugar próprio porque se perdem no volume: no meio de milhares de drops comuns,
// o item que você caça vira uma linha igual às outras nas listas gerais. Duas perguntas que só
// aqui têm resposta: "o que de bom já veio?" e "há quanto tempo o que eu caço não cai?".
function buildRareDropsCard() {
  const historico = getRareDropHistory(12);
  const secas = getRarityDroughts();
  if (!historico.total && !secas.length && !(AppState.rarityDismissed || []).length) return '';

  const quandoTexto = at => {
    const dias = Math.floor((Date.now() - at) / 86400000);
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    return `há ${dias} dias`;
  };

  const maxPct = getRarityMaxPercent();
  const minRuns = getMinRunsToJudgeRarity();
  const criterio = `Um item entra aqui de duas formas: <strong>você cadastrou</strong> ele em Onde dropa, ou <strong>o seu próprio histórico</strong> mostra que ele cai em <strong>até ${maxPct}% das runs</strong> daquela DG — é exatamente a "taxa por run" que a página Onde dropa já exibe, mesma conta (quantidade ÷ runs).<br><br>Só julga uma DG onde você já fez pelo menos ${minRuns} runs: pra afirmar que algo cai em menos de ${maxPct}% das vezes, o item precisa ter tido ao menos ${minRuns} chances de cair — antes disso, "não caiu ainda" não prova nada.<br><br>Os dois caminhos existem porque nenhum cobre tudo: a estatística só enxerga item que <strong>já caiu</strong> — um item raro demais, que você ainda não tirou, tem quantidade zero e é invisível pra ela. Esse só aparece se você cadastrar. Por isso o cadastro manual continua valendo a pena mesmo com a detecção automática ligada.`;

  const controleLimiar = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;font-size:var(--fs-sm);color:var(--muted)">
      <span>Considero raro o que cai em até</span>
      <input class="inp inp-sm" type="number" min="0.01" max="100" step="0.5" value="${maxPct}" style="width:80px" onchange="setRarityMaxPercent(this.value)">
      <span><strong style="color:var(--txt)">% das runs</strong> da DG</span>
      <span style="font-size:var(--fs-2xs)">— é a mesma taxa por run que aparece em Onde dropa; baixe se ainda vier coisa que cai todo dia</span>
    </div>`;

  const fmtPct = v => `${(v * 100).toFixed(v * 100 < 1 ? 2 : 1)}%`;
  // Mostra a faixa provável, não só o número: com poucos drops a taxa medida quase não diz nada
  // (1 drop em 1000 runs = "0,1%", mas a verdade pode estar entre 1/179 e 1/40.000). Ver stats.js.
  const taxaTexto = taxa => {
    if (!taxa || !taxa.runs) return '';
    const faixa = dropRateRange(taxa.qty, taxa.runs);
    const conf = rateConfidence(taxa.qty);
    const cor = conf.nivel === 'boa' ? 'var(--muted)' : conf.nivel === 'media' ? 'var(--txt2)' : 'var(--warn)';
    return `<span style="color:${cor};font-size:var(--fs-2xs)" title="${taxa.qty} drop(s) em ${taxa.runs} runs — ${conf.rotulo}. Faixa provável (95%): ${fmtPct(faixa.min)} a ${fmtPct(faixa.max)}.">${fmtPct(taxa.perRun)}${taxa.qty > 0 ? ` (${fmtPct(faixa.min)}–${fmtPct(faixa.max)})` : ''} · ${taxa.qty}/${taxa.runs} runs</span>`;
  };

  const descartados = AppState.rarityDismissed || [];
  const listaDescartados = !descartados.length ? '' : `
    <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
      <label class="lbl" style="margin-bottom:6px">Você marcou como "não é raro"</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${descartados.map(n => `<span class="badge badge-muted" style="display:flex;align-items:center;gap:6px">${esc(n)}<button title="Voltar a tratar como raro" style="background:transparent;border:none;color:inherit;cursor:pointer;padding:0;display:flex" onclick="restoreRarity('${escAttr(n)}')"><i class="ti ti-arrow-back-up"></i></button></span>`).join('')}
      </div>
    </div>`;

  const listaSecas = secas.length ? `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
      <label class="lbl" style="margin-bottom:6px">O que você caça</label>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${secas.slice(0, 6).map(d => `<div style="display:flex;align-items:center;gap:8px;font-size:var(--fs-sm);flex-wrap:wrap">
          <span style="color:var(--epic);font-weight:600">${esc(d.name)}</span>
          <span style="color:var(--muted)">${esc(d.dungeonName)}</span>
          <span style="margin-left:auto;color:${d.diasSem === null ? 'var(--muted)' : d.diasSem > 14 ? 'var(--warn)' : 'var(--txt2)'}">
            ${d.diasSem === null ? 'ainda não caiu pra você' : `última vez ${quandoTexto(d.ultimaVezAt)}`}
          </span>
          ${taxaTexto(d.taxa)}
        </div>`).join('')}
      </div>
    </div>` : '';

  // Fechado, o cabeçalho mostra a última raridade que caiu — é a informação que faz alguém abrir.
  const ultima = historico.itens[0];
  return collapsibleCard({
    id: 'overview-rare',
    icon: 'ti-star',
    iconColor: 'var(--epic)',
    title: 'Raridades',
    resumo: ultima
      ? `<span style="font-size:var(--fs-sm);color:var(--muted)">última:</span> <strong style="color:var(--epic)">${esc(ultima.name)}</strong> <span style="font-size:var(--fs-xs);color:var(--muted)">${quandoTexto(ultima.at)}</span> <span class="badge" style="background:var(--epic-bg);color:var(--epic);border:1px solid var(--epic-border)">${historico.total}</span>`
      : '<span class="badge badge-muted">nenhuma ainda</span>',
    body: `
  ${infoToggle('overview-rare-info', criterio)}
  ${controleLimiar}
  ${!historico.total
    ? '<div class="empty" style="padding:14px 0">Nenhuma raridade registrada ainda — elas aparecem aqui conforme caem nas suas sessões.</div>'
    : `<div style="display:flex;flex-direction:column;gap:6px">
      ${historico.itens.map(i => `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--epic-bg);border:1px solid var(--epic-border);border-radius:8px;flex-wrap:wrap">
        <i class="ti ti-star" style="color:var(--epic)"></i>
        <strong style="color:var(--epic)">${esc(i.name)}</strong>${i.qty > 1 ? `<span style="color:var(--muted)">×${i.qty}</span>` : ''}
        <span style="color:var(--muted);font-size:var(--fs-sm)">${esc(i.dungeonName)}</span>
        <span style="margin-left:auto;display:flex;align-items:center;gap:10px">
          ${i.value ? `<strong style="color:${getAlzTierColor(i.value)}" title="${formatNumber(i.value)} Alz">${formatAlzGamer(i.value)}</strong>` : ''}
          <span style="color:var(--muted);font-size:var(--fs-xs)">${quandoTexto(i.at)}</span>
          <button title="Não considero isso raro — tira daqui e do destaque roxo" style="background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0;display:flex" onclick="dismissRarity('${escAttr(i.name)}')"><i class="ti ti-x"></i></button>
        </span>
      </div>`).join('')}
    </div>`}
  ${listaSecas}
  ${listaDescartados}`,
  });
}

export function setDateFrom(value) {
  AppState.dateFrom = value;
  renderPage();
}

export function setDateTo(value) {
  AppState.dateTo = value;
  renderPage();
}

export function toggleManualDropsManager() {
  AppState.isManualDropsOpen = !AppState.isManualDropsOpen;
  renderPage();
}

export function renderOverviewPage() {
  const drops = getFilteredDrops();
  // Costura log ao vivo (últimos ~30 dias, exato) com o histórico agregado do banco (o resto) —
  // sem isso, qualquer período mais antigo que a janela do log mostrava um total incompleto sem
  // avisar. Ver drop-history.js.
  const history = getHistoricalSummary(AppState.dateFrom, AppState.dateTo);
  const items = history.items;
  const totalFarmed = history.totalAlz;

  const totalRushSpent = getRushSpentInRange(AppState.dateFrom, AppState.dateTo);

  const net = totalFarmed - totalRushSpent;
  // Drops/hora precisa de horário exato de cada drop, que só o log ao vivo tem (o histórico
  // agregado guarda o dia, não a hora) — por isso essa métrica continua só sobre o log.
  //
  // Exclui drop MANUAL, não só filtra por ter timestamp: addManualDrop grava um timestamp real
  // (00:00:00 do dia escolhido, ver manual-drops.js), então "tem timestamp" sozinho não bastava
  // pra afastar o problema que o comentário antigo aqui já descrevia — um manual de outro dia (ou
  // de hoje à meia-noite) ainda entrava no MIN/MAX e esticava/encolhia a janela em horas, mesmo
  // com a ordenação por MIN/MAX já corrigida. getTodayFarmRate() já evita isso do mesmo jeito.
  const logDropsComHorario = drops.filter(d => d.timestamp && !d.manual);
  const comHorario = logDropsComHorario.map(d => d.timestamp.getTime());
  const elapsedHours = comHorario.length >= 2
    ? (Math.max(...comHorario) - Math.min(...comHorario)) / 3600000
    : 0;
  const dropsPerHour = elapsedHours > 0.1 ? (logDropsComHorario.length / elapsedHours).toFixed(1) : '—';

  // Dias do período pedido sem nenhuma fonte de dado (nem log, nem histórico) — normalmente
  // porque são anteriores ao dia em que o FarmHub começou a guardar. Avisar é o que impede o
  // "Total de farme" de parecer completo quando não é.
  const uncoveredDays = countUncoveredDays(AppState.dateFrom, AppState.dateTo);
  const coverageNotice = !uncoveredDays ? '' : `
<div class="notice"><i class="ti ti-info-circle" style="flex-shrink:0;margin-top:1px"></i><div>
  <strong>${uncoveredDays} dia(s) do período sem dado registrado.</strong>
  O log do jogo guarda cerca de 30 dias; o FarmHub arquiva o resto conforme você usa, então dias
  anteriores ao início do arquivamento não entram nos totais abaixo.${history.snapshotOnlyDays ? ` (${history.snapshotOnlyDays} dia(s) deste período vieram do histórico arquivado.)` : ''}
</div></div>`;
  // Cobertura por VOLUME, não por itens distintos. Contando itens distintos, um item caro
  // precificado + um item sem preço que caiu 500x dava "50% coberto" — quando 99,6% do que caiu
  // não tinha preço. A métrica tranquilizava justamente quando devia alarmar.
  const semPreco = items.filter(i => !i.price);
  const volumeSemPreco = semPreco.reduce((sum, i) => sum + i.qty, 0);
  const priceCoverage = history.dropCount ? Math.round((1 - volumeSemPreco / history.dropCount) * 100) : 100;
  const piorSemPreco = semPreco.sort((a, b) => b.qty - a.qty)[0];

  // Aviso acionável em vez de um % decorativo: aponta o item que mais pesa no volume sem preço e
  // manda direto pra tela onde se resolve. Todo Alz do app depende desses preços — item sem preço
  // não é "cobertura menor", é farme sendo contado como zero.
  //
  // O gatilho é a QUANTIDADE do pior item, não a % do total: com meses de histórico acumulado, um
  // item novo caindo às centenas fica diluído a 3% e o aviso nunca apareceria — justamente quando
  // é fácil de resolver (um preço a cadastrar).
  const MIN_DROPS_PRA_AVISAR_SEM_PRECO = 50;
  const avisoSemPreco = !piorSemPreco || piorSemPreco.qty < MIN_DROPS_PRA_AVISAR_SEM_PRECO ? '' : `
<div class="notice"><i class="ti ti-alert-circle" style="flex-shrink:0;margin-top:1px"></i><div>
  <strong>${Math.round(volumeSemPreco / history.dropCount * 100)}% do que você dropou está sendo contado como 0 Alz</strong> — falta preço cadastrado.
  O que mais pesa: <strong>${esc(piorSemPreco.name)}</strong> (${piorSemPreco.qty.toLocaleString('pt-BR')} unidades)${semPreco.length > 1 ? ` e mais ${semPreco.length - 1} item(ns)` : ''}.
  <a href="#" onclick="navigateTo('calculo');return false" style="color:var(--acc);text-decoration:underline">Cadastrar preços</a>
</div></div>`;

  // Todo Alz desta página vem do preço CADASTRADO, não do que você realmente recebeu ao vender —
  // e o app já mede a diferença entre os dois (computeSalesSummary, tela de Vendas), só nunca
  // trazia esse resultado pra cá. Exige uma amostra mínima (uma venda isolada não prova nada) e um
  // desvio mínimo (todo mundo diverge um pouco; só vale avisar quando o gap é grande o bastante
  // pra distorcer os números da página). Cada venda já atualiza o preço cadastrado sozinha agora
  // (ver recordSale em sales.js), então esse aviso tende a ficar cada vez mais raro com o tempo —
  // e quando aparecer, é sinal de item vendido raramente ou editado manualmente depois.
  const salesSummary = computeSalesSummary();
  const MIN_VENDAS_PRA_AVISAR_PRECO = 3;
  const MIN_DESVIO_PRA_AVISAR_PRECO = 10; // %
  const desvioPrecoPct = salesSummary.estimatedTotal > 0 ? Math.round((salesSummary.diff / salesSummary.estimatedTotal) * 100) : 0;
  const avisoPrecoDesatualizado = salesSummary.count < MIN_VENDAS_PRA_AVISAR_PRECO || Math.abs(desvioPrecoPct) < MIN_DESVIO_PRA_AVISAR_PRECO ? '' : `
<div class="notice"><i class="ti ti-scale" style="flex-shrink:0;margin-top:1px"></i><div>
  <strong>Seus preços cadastrados estão ${desvioPrecoPct > 0 ? `${desvioPrecoPct}% abaixo` : `${Math.abs(desvioPrecoPct)}% acima`} do que você realmente vende.</strong>
  Nas suas ${salesSummary.count} vendas registradas: ${renderAlzValue(salesSummary.realTotal)} recebido de verdade contra ${renderAlzValue(salesSummary.estimatedTotal)} pelo preço cadastrado — e é esse preço cadastrado que todo número desta página usa.
  <a href="#" onclick="navigateTo('vendas');return false" style="color:var(--acc);text-decoration:underline">Ver em Vendas</a>
</div></div>`;

  const totalsByDate = history.totalsByDate;
  const datesWithData = Object.keys(totalsByDate).sort();

  const manualBatches = summarizeManualDropBatches();
  const manualSuggestions = Object.keys(AppState.itemPrices);
  const manualDropsCard = `
<div class="card" style="padding:0;overflow:hidden">
  <div style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleManualDropsManager()">
    <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px"><i class="ti ti-hand-stop"></i>Adicionar drop manual <span style="font-size:11px;font-weight:400;color:var(--muted)">${AppState.manualDrops.length} itens</span></div>
    <i class="ti ti-chevron-${AppState.isManualDropsOpen ? 'up' : 'down'}" style="color:var(--muted)"></i>
  </div>
  ${AppState.isManualDropsOpen ? `<div style="border-top:1px solid var(--border);padding:14px 16px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px"><i class="ti ti-info-circle"></i> Para itens dropados fora do log oficial do jogo. Entram no total de farme junto com os drops do arquivo.</div>
    <div class="row" style="margin-bottom:12px">
      <div style="flex:1"><label class="lbl">Nome do item</label>
        <input class="inp" id="mdName" placeholder="ex: Nucleo de Aprimoramento" list="mdSugg">
        <datalist id="mdSugg">${manualSuggestions.map(name => `<option value="${esc(name)}">`).join('')}</datalist></div>
      <div style="width:140px"><label class="lbl">Valor unitário (Alz)</label><input class="inp" id="mdPrice" type="text" inputmode="numeric" placeholder="opcional" oninput="maskAlzInputLive(this)"></div>
      <div style="width:100px"><label class="lbl">Quantidade</label><input class="inp" id="mdQty" type="number" min="1" value="1"></div>
      <div style="width:150px"><label class="lbl">Data</label>${renderDateInputBR({ id: 'mdDate', value: todayISODate() })}</div>
      <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addManualDrop()"><i class="ti ti-plus"></i>Adicionar</button></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:-6px;margin-bottom:12px">Deixe o valor em branco para manter o preço já cadastrado desse item (se houver).</div>
    ${manualBatches.length ? `<table><thead><tr><th>Data</th><th>Item</th><th>Quantidade</th><th>Valor</th><th style="width:40px"></th></tr></thead><tbody>
    ${manualBatches.map(b => `<tr>
      <td>${formatDateBR(b.date)}</td>
      <td>${esc(b.name)}</td>
      <td>${b.qty}×</td>
      <td>${getItemPrice(b.name) ? renderAlzValue(getItemPrice(b.name) * b.qty) : '<span style="color:var(--muted)">—</span>'}</td>
      <td><button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteManualDropBatch('${b.batchId}')"><i class="ti ti-trash"></i></button></td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="empty">Nenhum item manual adicionado ainda.</div>'}
  </div>` : ''}
</div>`;

  const metaCard = buildMetaCard();
  const personalBestsCard = buildPersonalBestsCard();

  if (!getAllDrops().length) {
    // Tudo que vem do BANCO (sessões, vendas, histórico arquivado) continua valendo mesmo sem o
    // log conectado agora — só o que depende do arquivo do dia é que fica de fora. Todo card novo
    // que ler do banco precisa entrar aqui também, senão some sem motivo com o log desconectado.
    return buildNextStepCard() + metaCard + avisoPrecoDesatualizado + buildEventCard() + buildRareDropsCard() + personalBestsCard + buildTrendCard() + manualDropsCard + `<div style="text-align:center;padding:70px 0;color:var(--muted)"><i class="ti ti-chart-bar" style="font-size:52px;display:block;margin-bottom:14px;color:var(--acc)"></i><div style="font-size:18px;font-weight:600;color:var(--txt2);margin-bottom:6px">Nenhum dado carregado</div><div>Use o menu lateral para carregar seu arquivo de log, ou adicione itens manualmente acima</div></div>`;
  }

  return `
<div class="pg-title"><i class="ti ti-map" style="color:var(--acc)"></i>Visão geral</div>
<div class="pg-sub">Seu painel de farme. O filtro de data abaixo comanda os totais; cards de janela própria (meta de hoje, evolução, raridades) têm período próprio.</div>
${buildNextStepCard()}
${/* Ordem pensada pra quem abre a página querendo um número, não um painel: meta de hoje ->
     filtro (que comanda tudo abaixo) -> os totais -> contexto -> ferramentas. Recorde pessoal e
     "adicionar drop manual" são motivação e ferramenta, não dado operacional — foram pro fim,
     porque no celular empurravam o "Total de farme" pra ~4 telas abaixo. */''}
${metaCard}
<div class="card">
  <div class="row">
    <div style="width:130px"><label class="lbl">De</label>${renderDateInputBR({ value: AppState.dateFrom, onChange: 'setDateFrom' })}</div>
    <div style="width:130px"><label class="lbl">Até</label>${renderDateInputBR({ value: AppState.dateTo, onChange: 'setDateTo' })}</div>
  </div>
  <div class="alz-legend">
    <span>Escala Alz:</span>
    <span><span class="alz-dot" style="background:#fde68a"></span>&lt; 1kk</span>
    <span><span class="alz-dot" style="background:#93c5fd"></span>1kk – 9,9kk</span>
    <span><span class="alz-dot" style="background:#86efac"></span>10kk – 99,9kk</span>
    <span><span class="alz-dot" style="background:#fb923c"></span>100kk – 999,9kk</span>
    <span><span class="alz-dot" style="background:#38bdf8"></span>1B – 9,9B</span>
    <span><span class="alz-dot" style="background:#4ade80"></span>10B – 99,9B</span>
    <span><span class="alz-dot" style="background:#f472b6"></span>100B+</span>
  </div>
</div>
${coverageNotice}
${avisoSemPreco}
${avisoPrecoDesatualizado}
<div class="g3" style="margin-bottom:10px">
  <div class="kpi"><div class="kpi-lbl">Total de farme</div><div class="kpi-val" style="font-size:22px;color:${getAlzTierColor(totalFarmed)}" title="${formatNumber(totalFarmed)} Alz">${formatAlzGamer(totalFarmed)}</div></div>
  <div class="kpi"><div class="kpi-lbl">Total gasto em rush</div><div class="kpi-val" style="color:${getAlzTierColor(totalRushSpent)}" title="${formatNumber(totalRushSpent)} Alz">${formatAlzGamer(totalRushSpent)}</div><div class="kpi-sub">deduzido por dia dentro do período filtrado</div></div>
  <div class="kpi"><div class="kpi-lbl">Total líquido</div><div class="kpi-val" style="font-size:22px;color:${getAlzTierColor(net)}" title="${formatNumber(net)} Alz">${formatAlzGamer(net)}</div><div class="kpi-sub">farme − gastos</div></div>
</div>
<div class="g4" style="margin-bottom:12px">
  <div class="kpi"><div class="kpi-lbl">Total de drops</div><div class="kpi-val">${history.dropCount.toLocaleString('pt-BR')}</div></div>
  <div class="kpi"><div class="kpi-lbl">Itens únicos</div><div class="kpi-val">${items.length.toLocaleString('pt-BR')}</div></div>
  <div class="kpi"><div class="kpi-lbl">Drops / hora</div><div class="kpi-val">${dropsPerHour}</div></div>
  <div class="kpi"><div class="kpi-lbl">Cobertura de preços</div><div class="kpi-val" style="color:${priceCoverage < 30 ? 'var(--err)' : priceCoverage < 70 ? 'var(--warn)' : 'var(--ok)'}">${priceCoverage}%</div><div class="kpi-sub" title="${volumeSemPreco.toLocaleString('pt-BR')} de ${history.dropCount.toLocaleString('pt-BR')} drops sem preço cadastrado">do que caiu já tem preço</div></div>
</div>
${buildEventCard()}
${buildRareDropsCard()}
${buildTrendCard()}
${datesWithData.length > 1 ? `<div class="card"><div class="ctitle"><i class="ti ti-chart-bar"></i>Farme diário</div><div class="chart-wrap"><canvas id="fc"></canvas></div></div>` : ''}
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-trophy"></i>Top itens <span style="color:var(--muted);font-size:12px;font-weight:400;margin-left:4px">${items.length} itens</span></div></div>
  <table><thead><tr><th style="width:36px">#</th><th>Item</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>
  ${items.length ? items.slice(0, 25).map((it, i) => `<tr>
    <td class="rank">${i + 1}</td><td>${esc(it.name)}</td>
    <td>${it.qty.toLocaleString('pt-BR')}</td>
    <td>${it.price ? renderAlzValue(it.price) : '<span style="color:var(--muted)">—</span>'}</td>
    <td>${it.total ? renderAlzValue(it.total, true) : '<span style="color:var(--muted)">—</span>'}</td>
  </tr>`).join('') : `<tr><td colspan="5" class="empty">Nenhum item neste período</td></tr>`}
  </tbody></table>
</div>
${personalBestsCard}
${manualDropsCard}`;
}
