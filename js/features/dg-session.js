import { AppState } from '../state/app-state.js';
import { getItemPrice, summarizeDropsByItem, isExcludedGearItem } from './drops.js';
import { saveDgSessions, saveActiveDgSession, saveResetConfig } from '../state/persistence.js';
import { formatAlzGamer, parseTimeInputBR } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { esc } from '../utils/escape.js';
import { setWatchdogEnabled } from './alerts.js';
import { getExpectedItemNamesForDungeon } from './item-dungeon-sources.js';
import { renderPage } from '../router.js';

// Limite diário conhecido de entradas por DG no Cabal Neo (antes de resetar por gemas) — usado
// em qualquer conta "quantos dias" ou "quanto cabe hoje" pelo app.
export const DAILY_RUN_LIMIT = 20;

// Se essa DG faz parte de alguma rota aplicada hoje (ver applyRushRoute, que agora SOMA — pode
// ter mais de uma aplicada ao mesmo tempo), a sessão herda o rótulo dela — farme "de rota" fica
// separado de farme avulso no histórico (ver Sessões de farme). DG que não está em nenhuma rota
// aplicada fica sem rótulo. Quando a DG está em mais de uma rota aplicada, usa a primeira — o
// histórico só guarda um rótulo por sessão.
function findAppliedRouteForDungeon(dungeonId) {
  for (const routeId of AppState.appliedRouteIds) {
    const route = AppState.rushRoutes.find(r => r.id === routeId);
    if (route?.items.some(it => it.dungeonId === dungeonId)) return route;
  }
  return null;
}

// Drops do LOG (não manuais) que caíram na janela [startAt, endAt]. A atribuição é por horário:
// game e navegador rodam na mesma máquina, então o timestamp do log bate com o relógio real.
// Equipamento genérico (ver isExcludedGearItem) fica de fora — não conta pra Alz da sessão (já
// não teria preço) e some da lista "o que caiu", que sem isso ficava enorme em qualquer DG.
function sessionDrops(startAt, endAt) {
  return AppState.drops.filter(d =>
    d.timestamp && d.timestamp.getTime() >= startAt && d.timestamp.getTime() <= endAt && !isExcludedGearItem(d.name));
}

function summarizeDrops(drops) {
  const totalAlz = drops.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  let best = null;
  drops.forEach(d => {
    const price = getItemPrice(d.name);
    if (!best || price > best.price) best = { name: d.name, price };
  });
  return { totalAlz, bestItem: best && best.price > 0 ? best : null };
}

// startAt opcional: a detecção automática (session-autostart.js) só percebe que você começou a
// farmar depois dos primeiros drops, então precisa retroagir o início pro primeiro drop — senão
// esses minutos iniciais ficariam fora da sessão.
export function startDgSession(dungeonId, runMinutes, { startAt, auto = false } = {}) {
  if (!dungeonId) return;
  const dg = AppState.dungeonList.find(d => d.id === dungeonId);
  if (!dg) return;
  // O watchdog liga junto com a sessão (resolve o "esqueci de ativar/desativar"). Se ele já estava
  // ligado (o jogador ligou na mão), NÃO reivindicamos — guardamos autoWatchdog só quando fomos nós
  // que ligamos, pra desligar apenas o que ligamos ao encerrar. Fica no registro da sessão ativa
  // (persistido no app_settings), então sobrevive a um reload no meio da sessão.
  const autoWatchdog = !AppState.alertSettings.watchdogEnabled;
  const routeMatch = findAppliedRouteForDungeon(dungeonId);
  // runMinutes é opcional: se informado, o ticker (startDgSessionTicker) deriva "Runs feitas"
  // sozinho a partir do tempo ATIVO de farme ÷ tempo por run, em vez de depender do jogador
  // lembrar de preencher na mão. runsManuallySet vira true assim que o jogador editar o campo
  // direto (setActiveSessionRuns) — a partir daí o auto-cálculo para de sobrescrever a correção dele.
  AppState.activeDgSession = {
    dungeonId: dg.id,
    dungeonName: dg.name,
    routeId: routeMatch?.id || null,
    routeName: routeMatch?.name || null,
    startAt: startAt || Date.now(),
    runs: 0,
    runMinutes: Math.max(0, parseFloat(String(runMinutes).replace(',', '.')) || 0),
    runsManuallySet: false,
    autoWatchdog,
    // Marca que quem abriu foi a detecção automática — a UI avisa pra conferir a DG, já que o
    // palpite pode estar errado (e trocar a DG de uma sessão é um clique no histórico).
    autoStarted: auto,
  };
  saveActiveDgSession();
  if (autoWatchdog) setWatchdogEnabled(true); // já reseta os relógios do watchdog e persiste
  renderPage();
}

// Nº de runs da sessão em andamento — informado pelo jogador na mão, ou derivado automaticamente
// pelo ticker quando runMinutes está preenchido (ver startDgSessionTicker). Editar aqui manualmente
// marca runsManuallySet=true, então o auto-cálculo não volta a sobrescrever pelo resto da sessão.
export function setActiveSessionRuns(value) {
  if (!AppState.activeDgSession) return;
  AppState.activeDgSession.runs = Math.max(0, parseInt(value, 10) || 0);
  AppState.activeDgSession.runsManuallySet = true;
  saveActiveDgSession();
}

// Runs de fato feitas HOJE numa DG — soma as sessões já encerradas + a sessão ativa (se for a
// mesma DG). Usado pelo "Progresso do rush de hoje" pra não considerar uma DG planejada pra N
// repetições como "feita" só porque existe alguma sessão dela, mesmo com poucas runs reais.
export function computeRunsDoneToday(dungeonName) {
  const today = todayISODate();
  let runs = AppState.dgSessions
    .filter(s => s.date === today && s.dungeonName === dungeonName)
    .reduce((sum, s) => sum + (s.runs || 0), 0);
  if (AppState.activeDgSession?.dungeonName === dungeonName) runs += AppState.activeDgSession.runs || 0;
  return runs;
}

// Edita as runs de uma sessão já encerrada (identificada pelo startAt, único por sessão).
export function setSessionRuns(startAt, value) {
  const s = AppState.dgSessions.find(x => x.startAt === startAt);
  if (!s) return;
  s.runs = Math.max(0, parseInt(value, 10) || 0);
  saveDgSessions();
  renderPage();
}

// Corrige a DG de uma sessão já encerrada (ex: marcou "Parte do Mapa" mas rushou "Templo
// Esquecido" por engano) — os drops em si não mudam, já foram atribuídos pela janela de horário
// [startAt, endAt] no momento do encerramento; só a etiqueta de qual DG eles pertencem é trocada.
export function setSessionDungeon(startAt, dungeonId) {
  const s = AppState.dgSessions.find(x => x.startAt === startAt);
  const dg = AppState.dungeonList.find(d => d.id === dungeonId);
  if (!s || !dg) return;
  s.dungeonId = dg.id;
  s.dungeonName = dg.name;
  saveDgSessions();
  renderPage();
}

// Remove uma sessão errada do histórico (ex: ficou aberta por horas sem farmar de verdade,
// inflando o tempo médio por run daquele DG pra sempre — o agregado de "Qual DG rende mais" soma
// TODO o histórico, sem cap de quantidade, então uma sessão ruim distorce a média até ser
// removida). Sem confirmação extra: já tem o ícone de lixeira + é uma ação isolada por linha,
// mesmo padrão de deleteRushForDay/deleteRushRoute.
export function deleteSession(startAt) {
  if (!confirm('Remover esta sessão do histórico? Essa ação não pode ser desfeita.')) return;
  AppState.dgSessions = AppState.dgSessions.filter(s => s.startAt !== startAt);
  saveDgSessions();
  renderPage();
}

// Mostra/esconde a lista completa de itens de uma sessão no histórico (estado só de UI, não
// persiste). Guardado por startAt.
export function toggleSessionItems(startAt) {
  if (AppState.expandedDgSessions[startAt]) delete AppState.expandedDgSessions[startAt];
  else AppState.expandedDgSessions[startAt] = true;
  renderPage();
}

// Um intervalo sem nenhum drop maior que isso conta como INATIVIDADE (ex: o rush parou e você foi
// dormir) e não entra no tempo de farme — assim a duração fica fiel ao tempo realmente farmando,
// e o Alz/hora não fica achatado por horas paradas.
const ACTIVE_IDLE_CAP_MS = 5 * 60 * 1000;

// Piso de tempo ativo pra confiar num Alz/hora extrapolado. Com pouco tempo ativo, um único drop
// de valor alto (ou dois drops próximos) infla a extrapolação pra um número absurdo — ex: 2 drops
// com 30s de intervalo e valor alto vira "Alz/hora" multiplicado por 120x. Abaixo desse piso, não
// mostra a taxa (fica "—" / fora do ranking) em vez de passar confiança que a amostra não tem.
const MIN_ACTIVE_MS_FOR_RATE = 15 * 60 * 1000;

// Só pra "Seu horário mais produtivo": mesmo com bastante tempo ativo, 1 sessão só pode ter tido
// sorte com um drop caro e não repetir — não é um "seu horário", é um dia de sorte. Exige pelo
// menos essa quantidade de sessões (dias diferentes) na faixa antes dela entrar no ranking.
const MIN_SESSIONS_FOR_HOUR_RANKING = 2;

// Tempo "ativo" da sessão: soma os intervalos entre drops consecutivos, cortando cada gap no teto
// de inatividade. Continuar farmando (drops seguidos) conta tudo; parar por horas conta só o teto.
function activeDurationMs(drops) {
  const times = drops.filter(d => d.timestamp).map(d => d.timestamp.getTime()).sort((a, b) => a - b);
  let active = 0;
  for (let i = 1; i < times.length; i++) active += Math.min(times[i] - times[i - 1], ACTIVE_IDLE_CAP_MS);
  return active;
}

// Monta o registro final de uma sessão a partir de uma janela [startAt, endAt] — usado tanto pelo
// encerramento normal (endDgSession) quanto pela recuperação de sessão esquecida (abaixo), que
// reconstrói a janela a partir do log em vez de uma sessão ativa de verdade.
function buildSessionRecord({ dungeonId, dungeonName, routeId, routeName, startAt, endAt, runs }) {
  const drops = sessionDrops(startAt, endAt);
  const activeMs = activeDurationMs(drops); // tempo farmando, sem contar inatividade
  const { totalAlz, bestItem } = summarizeDrops(drops);
  const items = {};
  summarizeDropsByItem(drops).forEach(it => (items[it.name] = it.qty));
  return {
    dungeonId,
    dungeonName,
    routeId: routeId || null,
    routeName: routeName || null,
    date: drops[0]?.date || todayISODate(),
    startAt,
    endAt,
    durationMs: endAt - startAt,   // relógio total (início → encerrar)
    activeDurationMs: activeMs,    // tempo fiel de farme (desconta inatividade)
    runs: runs || 0,
    dropCount: drops.length,
    uniqueItems: Object.keys(items).length,
    totalAlz,
    alzPerHour: activeMs > MIN_ACTIVE_MS_FOR_RATE ? totalAlz / (activeMs / 3600000) : null,
    bestItem,
    items,
  };
}

// Resumo ao vivo da sessão em andamento (ou null). Recalculado sob demanda a partir da janela.
// Inclui os itens já caídos até agora (mesmo formato do histórico) — não precisa encerrar a
// sessão pra ver o que já dropou, só esperava até fechar antes.
export function getActiveSessionSummary() {
  const s = AppState.activeDgSession;
  if (!s) return null;
  const now = Date.now();
  const drops = sessionDrops(s.startAt, now);
  const activeMs = activeDurationMs(drops);
  const { totalAlz } = summarizeDrops(drops);
  return {
    dungeonName: s.dungeonName,
    durationMs: now - s.startAt, // relógio desde o início (mostrado no contador ao vivo)
    activeMs,                    // tempo farmando, sem inatividade
    dropCount: drops.length,
    totalAlz,
    alzPerHour: activeMs > MIN_ACTIVE_MS_FOR_RATE ? totalAlz / (activeMs / 3600000) : null,
    items: summarizeDropsByItem(drops),
    // Horário do último drop desta sessão (null se ainda não caiu nada) — é por ele que o
    // encerramento automático mede a inatividade e fecha a sessão no ponto certo.
    lastDropAt: drops.length ? Math.max(...drops.map(d => d.timestamp.getTime())) : null,
  };
}

// endAt opcional: o encerramento automático por inatividade (session-autostart.js) fecha a sessão
// no horário do ÚLTIMO DROP, não no momento em que percebeu — senão o tempo parado entraria na
// duração e afundaria a média de tempo/run daquela DG pra sempre.
export function endDgSession({ endAt } = {}) {
  const s = AppState.activeDgSession;
  if (!s) return;
  AppState.dgSessions.push(buildSessionRecord({
    dungeonId: s.dungeonId,
    dungeonName: s.dungeonName,
    routeId: s.routeId,
    routeName: s.routeName,
    startAt: s.startAt,
    endAt: endAt || Date.now(),
    runs: s.runs,
  }));
  const wasAutoWatchdog = s.autoWatchdog;
  AppState.activeDgSession = null;
  saveDgSessions();
  saveActiveDgSession();
  // Se fomos nós que ligamos o watchdog ao iniciar, desliga junto ao encerrar. Se o jogador já o
  // desligou na mão no meio da sessão, o guard abaixo evita mexer (fica no-op).
  if (wasAutoWatchdog && AppState.alertSettings.watchdogEnabled) setWatchdogEnabled(false);
  renderPage();
}

// Alguns drops do log já caíram sem sessão vinculada (o jogador esqueceu de clicar "Iniciar" antes
// de entrar na DG). Sugere a janela recuperável: do fim da ÚLTIMA sessão já encerrada (não importa
// o dia — se você só percebeu no dia seguinte que esqueceu ontem, ainda dá pra recuperar) até
// agora. Sem nenhuma sessão no histórico ainda, cai em meia-noite de hoje, pra não puxar semanas
// de log de quem nunca usou o controle de sessão.
export function suggestForgottenSessionWindow() {
  const lastEndAt = AppState.dgSessions.length ? Math.max(...AppState.dgSessions.map(s => s.endAt || 0)) : 0;
  const anchor = lastEndAt || new Date().setHours(0, 0, 0, 0);
  const unclaimed = AppState.drops.filter(d => d.timestamp && d.timestamp.getTime() > anchor && !isExcludedGearItem(d.name));
  if (!unclaimed.length) return null;
  const times = unclaimed.map(d => d.timestamp.getTime()).sort((a, b) => a - b);
  return { suggestedStart: times[0], dropCount: unclaimed.length };
}

// Mostra/esconde o painel de recuperação de sessão esquecida em Sessões de farme (estado só de
// UI, não persiste).
export function toggleForgottenSessionRecovery() {
  AppState.forgottenSessionRecoveryOpen = !AppState.forgottenSessionRecoveryOpen;
  renderPage();
}

// Registra retroativamente a sessão esquecida: usa a janela sugerida (ou um horário de início
// digitado na mão, quando o log só começou a registrar depois que o jogador já tinha entrado na
// DG) até agora. "Runs feitas" fica em 0 pra preencher depois, igual qualquer sessão do histórico.
export function recoverForgottenSession(dungeonId, startTimeInput) {
  const dg = AppState.dungeonList.find(d => d.id === dungeonId);
  const suggestion = suggestForgottenSessionWindow();
  if (!dg || !suggestion) return;
  const parsedTime = parseTimeInputBR(startTimeInput);
  // O horário digitado à mão é só um ajuste fino dentro da janela sugerida — usa o DIA de
  // suggestedStart, não "hoje", pra continuar certo quando a sessão esquecida foi ontem.
  const startAt = parsedTime ? new Date(`${todayISODate(new Date(suggestion.suggestedStart))}T${parsedTime}:00`).getTime() : suggestion.suggestedStart;
  const endAt = Date.now();
  if (!(startAt < endAt)) { alert('Horário de início inválido — precisa ser antes de agora.'); return; }

  const routeMatch = findAppliedRouteForDungeon(dungeonId);

  AppState.dgSessions.push(buildSessionRecord({
    dungeonId: dg.id,
    dungeonName: dg.name,
    routeId: routeMatch?.id,
    routeName: routeMatch?.name,
    startAt,
    endAt,
    runs: 0,
  }));
  AppState.forgottenSessionRecoveryOpen = false;
  saveDgSessions();
  renderPage();
}

// Valor de uma sessão pelos preços de HOJE, recalculado a partir dos itens guardados nela.
//
// O campo session.totalAlz é congelado no fechamento (valor da época). Isso criava duas
// valorizações do mesmo farme na mesma tela: atualizar o preço de um item mudava o "Total de
// farme" da Visão geral mas não mexia em Recorde pessoal, "Qual DG rende mais" nem "Vale a pena
// resetar" — e esses três são ferramentas de COMPARAÇÃO entre períodos. Comparar um mês avaliado
// a preço velho com outro a preço novo não responde nada.
//
// Cai de volta no valor congelado quando a sessão não tem o mapa de itens (registro antigo).
export function sessionTotalAlz(session) {
  if (!session.items) return session.totalAlz || 0;
  let total = 0;
  for (const [name, qty] of Object.entries(session.items)) {
    if (isExcludedGearItem(name)) continue;
    total += getItemPrice(name) * qty;
  }
  return total;
}

// Agrega as sessões salvas por DG, ordenado por Alz/hora (qual DG rende mais). É a ferramenta de
// decisão: "onde meu tempo de macro rende melhor".
export function computeDgComparison() {
  const byDg = {};
  AppState.dgSessions.forEach(s => {
    const agg = byDg[s.dungeonId] || (byDg[s.dungeonId] = {
      dungeonId: s.dungeonId, dungeonName: s.dungeonName, sessions: 0, activeMs: 0, runs: 0, dropCount: 0, totalAlz: 0,
    });
    agg.sessions++;
    // Tempo ativo (fiel), com fallback pra duração total em sessões antigas sem o campo.
    agg.activeMs += s.activeDurationMs ?? s.durationMs;
    agg.runs += s.runs || 0;
    agg.dropCount += s.dropCount;
    agg.totalAlz += sessionTotalAlz(s);
  });
  return Object.values(byDg)
    .map(a => ({
      ...a,
      durationMs: a.activeMs, // "tempo total" exibido = soma do tempo ativo
      alzPerHour: a.activeMs > MIN_ACTIVE_MS_FOR_RATE ? a.totalAlz / (a.activeMs / 3600000) : null,
      alzPerRun: a.runs > 0 ? a.totalAlz / a.runs : null,
      // Tempo médio por run = tempo ativo somado ÷ runs somadas — mesma ideia do Alz/run, sem
      // precisar de nenhum campo novo (usado pra sugerir rota pelo tempo disponível do jogador).
      msPerRun: a.runs > 0 ? a.activeMs / a.runs : null,
    }))
    // Ordena por Alz/RUN, não por Alz/hora: DG tem limite diário de runs, então o que decide
    // onde gastar as entradas é o rendimento por run (quem não tem runs informadas vai pro fim).
    .sort((x, y) => (y.alzPerRun ?? -1) - (x.alzPerRun ?? -1));
}

// Agrupa TODAS as sessões pela hora de início (0-23) e soma Alz/hora de cada faixa — não é só
// "qual DG rende mais", é "em que horário eu historicamente rendo mais", pra quem tem horários
// livres pra escolher e quer saber quando vale mais a pena farmar. Exige tempo ativo suficiente
// (MIN_ACTIVE_MS_FOR_RATE) E mais de uma sessão (MIN_SESSIONS_FOR_HOUR_RANKING) — só uma dessas
// duas coisas ainda deixa passar um dia de sorte isolado como se fosse um padrão confiável.
export function computeBestFarmingHours() {
  const buckets = {};
  AppState.dgSessions.forEach(s => {
    const hour = new Date(s.startAt).getHours();
    const b = buckets[hour] || (buckets[hour] = { hour, activeMs: 0, totalAlz: 0, sessions: 0, dungeonNames: new Set() });
    b.activeMs += s.activeDurationMs ?? s.durationMs;
    b.totalAlz += sessionTotalAlz(s);
    b.sessions++;
    b.dungeonNames.add(s.dungeonName);
  });
  return Object.values(buckets)
    .map(b => ({ ...b, dungeonNames: [...b.dungeonNames], alzPerHour: b.activeMs > MIN_ACTIVE_MS_FOR_RATE ? b.totalAlz / (b.activeMs / 3600000) : null }))
    .filter(b => b.alzPerHour != null && b.sessions >= MIN_SESSIONS_FOR_HOUR_RANKING)
    .sort((a, b) => b.alzPerHour - a.alzPerHour);
}

// Melhores marcas pessoais — melhor dia (soma de todas as sessões daquele dia) e melhor sessão
// única. Não é uma métrica de decisão como o resto desta página, é só um "recorde", pra motivar
// — mesma lógica de high score de qualquer jogo, olhando pros próprios números de antes.
export function computePersonalBests() {
  if (!AppState.dgSessions.length) return null;
  const byDate = {};
  let bestSession = null;
  AppState.dgSessions.forEach(s => {
    const valor = sessionTotalAlz(s);
    byDate[s.date] = (byDate[s.date] || 0) + valor;
    if (!bestSession || valor > bestSession.valor) bestSession = { ...s, valor };
  });
  const [bestDate, bestDateTotal] = Object.entries(byDate).sort(([, a], [, b]) => b - a)[0];
  return {
    bestDay: { date: bestDate, totalAlz: bestDateTotal },
    bestSession: { date: bestSession.date, dungeonName: bestSession.dungeonName, totalAlz: bestSession.valor },
  };
}

// Parâmetros do "vale a pena resetar?" — todos inteiros não-negativos (valores em Alz ou gemas
// vêm de inputs mascarados; runs por reset no mínimo 1).
export function setResetConfig(field, value) {
  const n = Math.max(0, parseInt(String(value).replace(/\D/g, ''), 10) || 0);
  AppState.resetConfig[field] = field === 'runsPerReset' ? Math.max(1, n) : n;
  saveResetConfig();
  renderPage();
}

// Pra cada DG com Alz/run medido: desconta o custo de entrada da run (Alz + tickets + gemas, pelos
// valores informados) e o custo do reset rateado por run. Se sobrar lucro, vale resetar.
export function computeResetWorth() {
  const cfg = AppState.resetConfig;
  const gemValue = cfg.gemValueAlz || 0;
  const ticketValue = cfg.ticketValueAlz || 0;
  const runsPerReset = Math.max(1, cfg.runsPerReset || 1);
  const resetCostPerRun = ((cfg.resetCostGems || 0) * gemValue) / runsPerReset;

  const rows = computeDgComparison()
    .filter(c => c.alzPerRun != null)
    .map(c => {
      const dg = AppState.dungeonList.find(d => d.id === c.dungeonId);
      const entryCostPerRun = dg
        ? (dg.alzCost || 0) + (dg.ticketsPerRun || 0) * ticketValue + (dg.gemsPerRun || 0) * gemValue
        : 0;
      const netAlzPerRun = c.alzPerRun - entryCostPerRun;
      const profitAfterReset = netAlzPerRun - resetCostPerRun;
      return {
        dungeonName: c.dungeonName,
        alzPerRun: c.alzPerRun,
        entryCostPerRun,
        netAlzPerRun,
        profitAfterReset,
        worth: profitAfterReset > 0,
      };
    })
    .sort((a, b) => b.profitAfterReset - a.profitAfterReset);

  return { resetCostPerRun, rows, gemValueSet: gemValue > 0 };
}

// Contador vivo (1s) que reflete a sessão ativa no menu lateral e, se estiver na página Sessões,
// na caixa ao vivo dela — sem re-renderizar a página inteira a cada segundo.
export function startDgSessionTicker() {
  const paint = () => {
    const summary = getActiveSessionSummary();
    const sidebar = document.getElementById('dgSessionIndicator');
    const pageBox = document.getElementById('dgLivePageBox');
    if (!summary) {
      if (sidebar) sidebar.style.display = 'none';
      if (pageBox) pageBox.textContent = '';
      return;
    }
    // Contagem automática: se o jogador informou o tempo por run ao iniciar e não corrigiu
    // "Runs feitas" na mão nesta sessão, deriva a run atual do tempo ATIVO farmado (sem contar
    // pausas) ÷ tempo por run. Só persiste (e só toca o input, se a página Sessões estiver aberta
    // e o campo não estiver focado) quando o número inteiro de fato muda — o floor() já naturalmente
    // só varia a cada runMinutes minutos, sem precisar de throttle extra.
    const session = AppState.activeDgSession;
    if (session.runMinutes > 0 && !session.runsManuallySet) {
      const computedRuns = Math.floor(summary.activeMs / (session.runMinutes * 60000));
      if (computedRuns !== session.runs) {
        session.runs = computedRuns;
        saveActiveDgSession();
        const runsInput = document.getElementById('dgRunsInput');
        if (runsInput && document.activeElement !== runsInput) runsInput.value = computedRuns;
      }
    }

    const mins = Math.floor(summary.durationMs / 60000);
    const secs = Math.floor((summary.durationMs % 60000) / 1000);
    const clock = mins > 0 ? `${mins}min ${secs}s` : `${secs}s`;
    if (sidebar) {
      sidebar.style.display = 'block';
      sidebar.innerHTML = `<i class="ti ti-crosshair" style="color:var(--gold)"></i> ${esc(summary.dungeonName)} · ${clock} · <strong>${formatAlzGamer(summary.totalAlz)}</strong>`;
    }
    if (pageBox) {
      pageBox.innerHTML = `${clock} · ${summary.dropCount} drops · <strong style="color:var(--gold)">${formatAlzGamer(summary.totalAlz)}</strong>${summary.alzPerHour != null ? ` · ${formatAlzGamer(summary.alzPerHour)}/h` : ''}`;
    }
    // Itens já caídos na sessão ativa, ao vivo — sem esperar encerrar pra ver o que dropou.
    // Raridade desta DG (cadastro em Onde dropa) sai em roxo épico e vem primeiro: é o drop que
    // você estava caçando, não pode se perder no meio da lista de lixo comum.
    const itemsBox = document.getElementById('dgLiveItemsBox');
    if (itemsBox) {
      const rareNames = getExpectedItemNamesForDungeon(session.dungeonId);
      const marked = summary.items.map(it => ({ ...it, rare: rareNames.has(it.name) }));
      marked.sort((a, b) => (b.rare - a.rare) || (b.total - a.total));
      itemsBox.innerHTML = marked.length
        ? marked.map(it => it.rare
            ? `<span class="badge" style="background:var(--epic-bg);color:var(--epic);border:1px solid var(--epic-border)" title="Raridade desta DG"><i class="ti ti-star"></i> ${esc(it.name)} ×${it.qty}${it.total ? ` · ${formatAlzGamer(it.total)}` : ''}</span>`
            : `<span class="badge badge-muted">${esc(it.name)} ×${it.qty}${it.total ? ` · ${formatAlzGamer(it.total)}` : ''}</span>`).join(' ')
        : '<span style="color:var(--muted);font-size:var(--fs-xs)">Nenhum item ainda.</span>';
    }
  };
  paint();
  setInterval(paint, 1000);
}
