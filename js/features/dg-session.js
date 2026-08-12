import { AppState } from '../state/app-state.js';
import { getItemPrice, summarizeDropsByItem, isExcludedGearItem } from './drops.js';
import { getCostPerGem } from './rush-cart.js';
import { saveDgSessions, saveActiveDgSession, saveResetConfig, saveDeletedSessions } from '../state/persistence.js';
import { formatAlzGamer, parseTimeInputBR, formatDateBR } from '../utils/formatting.js';
import { todayISODate } from '../utils/parsing.js';
import { esc } from '../utils/escape.js';
import { setWatchdogEnabled, showInfoToast } from './alerts.js';
import { getExpectedItemNamesForDungeon } from './item-dungeon-sources.js';
import { actWithUndo } from './undo.js';
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

// Drops do log que ainda não pertencem a nenhuma sessão encerrada, dentro de uma janela recente.
// Base de duas coisas: a detecção automática (session-autostart.js) e o retroagir do início
// manual abaixo. Fica aqui porque é sobre o ciclo de vida da sessão, não sobre a detecção.
const UNCLAIMED_WINDOW_MS = 30 * 60 * 1000;
// Excluir uma sessão devolve os drops dela pra cá de propósito: excluir é sobre a ATRIBUIÇÃO
// (a etiqueta de qual DG), não sobre o farme em si — os drops continuam no log, e o caso comum de
// exclusão é justamente "essa sessão ficou com a DG errada, quero registrar de novo do jeito
// certo". A janela recente + o bloco contínuo abaixo já impedem que farme antigo volte junto.
export function unclaimedDropsSince(windowMs = UNCLAIMED_WINDOW_MS) {
  const lastEndAt = AppState.dgSessions.length ? Math.max(...AppState.dgSessions.map(s => s.endAt || 0)) : 0;
  const cutoff = Math.max(lastEndAt, Date.now() - windowMs);
  return AppState.drops.filter(d =>
    d.timestamp && d.timestamp.getTime() > cutoff && !isExcludedGearItem(d.name));
}

// Início do bloco de farme que está acontecendo AGORA: caminha do drop mais recente pra trás e
// para no primeiro intervalo grande (o mesmo limite que encerra sessão por inatividade).
//
// Retroagir por janela fixa de tempo era grosseiro demais: 30 minutos atrás pode ser farme de
// antes de uma pausa, ou de outra DG. O bloco contínuo é a definição certa de "o que estou
// farmando agora" — e para sozinho na pausa, sem precisar adivinhar quanto tempo faz.
export function burstStartAt(drops) {
  const times = drops.filter(d => d.timestamp).map(d => d.timestamp.getTime()).sort((a, b) => a - b);
  if (!times.length) return null;
  const gapMs = Math.max(1, +AppState.sessionIdleCloseMinutes || 5) * 60000;
  let inicio = times[times.length - 1];
  for (let i = times.length - 1; i > 0; i--) {
    if (times[i] - times[i - 1] >= gapMs) break;
    inicio = times[i - 1];
  }
  return inicio;
}

// startAt opcional: a detecção automática (session-autostart.js) só percebe que você começou a
// farmar depois dos primeiros drops, então precisa retroagir o início pro primeiro drop — senão
// esses minutos iniciais ficariam fora da sessão.
//
// Sem startAt explícito (clique em "Iniciar" na mão), retroage do MESMO jeito, pro primeiro drop
// que ainda não pertence a sessão nenhuma. Antes usava Date.now(): quem entrava na DG e só lembrava
// de apertar "Iniciar" alguns minutos depois perdia todo o farme desses minutos, silenciosamente —
// os drops estavam no log, mas ficavam fora de qualquer sessão e portanto fora de "Qual DG rende
// mais", de tempo/run e de Onde dropa.
export function startDgSession(dungeonId, runMinutes, { startAt, auto = false } = {}) {
  if (!dungeonId) return;
  const dg = AppState.dungeonList.find(d => d.id === dungeonId);
  if (!dg) return;

  let retroagidos = 0;
  if (!startAt) {
    const pendentes = unclaimedDropsSince();
    const inicio = burstStartAt(pendentes);
    if (inicio) {
      startAt = inicio;
      retroagidos = pendentes.filter(d => d.timestamp.getTime() >= inicio).length;
    }
  }
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

  // Avisa que o início foi puxado pra trás — mudar silenciosamente o horário que a pessoa
  // acha que iniciou seria pior que não retroagir.
  if (retroagidos && !auto) {
    showInfoToast(`Sessão contando desde o 1º drop — ${retroagidos} que já tinham caído entraram`);
  }
}

// Tempo por run sugerido pelo SEU histórico naquela DG.
//
// A contagem automática de runs ("Runs feitas" derivado do tempo ativo ÷ tempo por run) existia,
// mas na prática ninguém usava: exige que o jogador saiba de cabeça quanto demora cada DG, e
// ninguém sabe — varia um ou dois minutos toda run. O app, porém, já mede isso a cada sessão
// encerrada com runs preenchidas. Só faltava devolver o número.
//
// Usa a MEDIANA do tempo/run de cada sessão, não a média: com poucas sessões, uma única atípica
// (lag, pausa longa que o tempo ativo não pegou, run de boss) puxaria a média e desregularia a
// contagem de todas as sessões seguintes. Mediana ignora o extremo sem precisar descartar dado.
//
// null = sem base ainda (nenhuma sessão dessa DG com runs preenchidas). Nesse caso é melhor não
// sugerir nada do que sugerir um número inventado — a contagem erraria em silêncio.
export function suggestRunMinutes(dungeonId) {
  const amostras = [];
  let totalRuns = 0;
  for (const s of AppState.dgSessions) {
    if (s.dungeonId !== dungeonId || !(s.runs > 0)) continue;
    const ativo = s.activeDurationMs ?? s.durationMs;
    if (!(ativo > 0)) continue;
    amostras.push(ativo / s.runs);
    totalRuns += s.runs;
  }
  if (!amostras.length) return null;

  amostras.sort((a, b) => a - b);
  const meio = Math.floor(amostras.length / 2);
  const medianaMs = amostras.length % 2 ? amostras[meio] : (amostras[meio - 1] + amostras[meio]) / 2;
  // Arredonda pro meio minuto — mesma granularidade do campo (step 0.5). Precisão maior que isso
  // é ilusória num dado que varia de run pra run.
  const minutes = Math.max(0.5, Math.round((medianaMs / 60000) * 2) / 2);
  return { minutes, sessions: amostras.length, runs: totalRuns };
}

// Ajusta o tempo por run da sessão em andamento. Existe porque a sugestão do histórico é um ponto
// de partida, não uma verdade: se hoje a DG está saindo mais lenta, corrigir aqui faz a contagem
// automática voltar a bater sem precisar encerrar a sessão.
export function setActiveSessionRunMinutes(value) {
  const s = AppState.activeDgSession;
  if (!s) return;
  s.runMinutes = Math.max(0, parseFloat(String(value).replace(',', '.')) || 0);
  // Voltar a informar um tempo devolve o controle pro automático — senão, quem corrigiu as runs
  // na mão uma vez ficaria presa no manual pro resto da sessão mesmo depois de ajustar o tempo.
  if (s.runMinutes > 0) s.runsManuallySet = false;
  saveActiveDgSession();
  renderPage();
}

// Troca a DG da sessão ATIVA (a de setSessionDungeon troca de sessão já encerrada, no histórico).
// É o que torna a detecção automática confortável de verdade: você nunca aperta "Iniciar", ela
// abre sozinha com um palpite, e corrigir o rótulo é um seletor ali na hora — em vez de esperar
// encerrar e ir consertar no histórico depois.
export function setActiveSessionDungeon(dungeonId) {
  const s = AppState.activeDgSession;
  const dg = AppState.dungeonList.find(d => d.id === dungeonId);
  if (!s || !dg || dg.id === s.dungeonId) return;

  // Sessão que veio de uma RETOMADA (ver resumeDgSession) e está mudando de DG é o caso ambíguo:
  // provavelmente a retomada errou — você parou numa DG e voltou em outra, e agora tem farme de
  // duas DGs no mesmo registro. Trocar o rótulo inteiro atribuiria o farme antigo à DG nova.
  //
  // Pergunta em vez de adivinhar, porque as duas leituras são plausíveis: ou a sessão sempre foi
  // desta DG e o palpite inicial errou (renomeia tudo), ou a DG mudou de verdade no meio (corta
  // em duas). E o corte tem um ponto exato pra acontecer: resumedAt, quando a sessão original
  // tinha encerrado.
  if (s.resumedAt && sessionDrops(s.startAt, s.resumedAt).length) {
    const antes = sessionDrops(s.startAt, s.resumedAt).length;
    const cortar = confirm(
      `Esta sessão foi retomada de um farme anterior em "${s.dungeonName}", e tem ${antes} drop(s) de antes da pausa.\n\n` +
      `OK — você trocou de DG na pausa: eu fecho aquele farme em "${s.dungeonName}" e começo uma sessão nova em "${dg.name}".\n\n` +
      `Cancelar — sempre foi "${dg.name}": renomeio a sessão inteira.`
    );
    if (cortar) {
      splitActiveSessionAt(s.resumedAt, dg.id);
      return;
    }
    delete s.resumedAt;
  }

  s.dungeonId = dg.id;
  s.dungeonName = dg.name;
  // Tempo por run é POR DG — trocar a DG invalida o valor anterior. Reaplica a sugestão da DG
  // nova, a menos que o jogador já tenha corrigido as runs na mão (aí a palavra é dele).
  if (!s.runsManuallySet) s.runMinutes = suggestRunMinutes(dg.id)?.minutes || 0;
  // Confirmar a DG na mão tira o aviso de "aberta automaticamente, confira": você acabou de
  // conferir. A rota também é reavaliada — a nova DG pode pertencer a outra rota aplicada hoje.
  s.autoStarted = false;
  const rota = findAppliedRouteForDungeon(dg.id);
  s.routeId = rota?.id || null;
  s.routeName = rota?.name || null;
  saveActiveDgSession();
  renderPage();
}

// Fecha a sessão ativa em `cutAt` mantendo a DG atual, e abre outra a partir dali na DG nova —
// desfazendo uma retomada que juntou dois farmes diferentes. Os itens de cada lado são
// recalculados da janela de tempo respectiva no log, então nada precisa ser movido à mão.
function splitActiveSessionAt(cutAt, newDungeonId) {
  endDgSession({ endAt: cutAt });
  // +1ms pra o drop que caiu exatamente em cutAt não entrar nas duas (sessionDrops é inclusivo
  // nas duas pontas).
  startDgSession(newDungeonId, suggestRunMinutes(newDungeonId)?.minutes || 0, { startAt: cutAt + 1 });
  showInfoToast('Separei: o farme de antes da pausa ficou na DG anterior');
}

// Reabre uma sessão já encerrada como ativa, devolvendo o registro dela pro estado "em andamento".
// Usado quando os drops voltam pouco depois de um encerramento automático (ver checkAutoStartSession):
// sem isso, encerrar rápido por inatividade partiria um único farme em várias sessões, inflando a
// contagem de sessões e fragmentando o "melhor sessão única". Os itens não se perdem — eles são
// recalculados da janela [startAt, endAt] no log quando a sessão encerrar de novo.
export function resumeDgSession(session) {
  AppState.dgSessions = AppState.dgSessions.filter(s => s.startAt !== session.startAt);
  const autoWatchdog = !AppState.alertSettings.watchdogEnabled;
  AppState.activeDgSession = {
    dungeonId: session.dungeonId,
    dungeonName: session.dungeonName,
    routeId: session.routeId || null,
    routeName: session.routeName || null,
    startAt: session.startAt,
    runs: session.runs || 0,
    runMinutes: session.runMinutes || 0,
    runsManuallySet: !!session.runs,
    autoWatchdog,
    autoStarted: false,
    note: session.note,
    // Momento em que a sessão original tinha encerrado. Guardado porque é a fronteira exata entre
    // "farme de antes da pausa" e "farme de depois" — se a retomada errou a DG (você trocou de DG
    // na pausa), é aqui que setActiveSessionDungeon corta pra separar as duas.
    resumedAt: session.endAt,
  };
  saveDgSessions();
  saveActiveDgSession();
  if (autoWatchdog) setWatchdogEnabled(true);
  renderPage();
}

// Nº de runs da sessão em andamento — informado pelo jogador na mão, ou derivado automaticamente
// pelo ticker quando runMinutes está preenchido (ver startDgSessionTicker). Editar aqui manualmente
// marca runsManuallySet=true, então o auto-cálculo não volta a sobrescrever pelo resto da sessão.
// Corrigir "Runs feitas" na mão RECALIBRA o ritmo e continua contando — não desliga a contagem.
//
// Antes, editar o campo marcava runsManuallySet e o contador congelava no número digitado pelo
// resto da sessão, sem nada avisar. Era o pior dos dois mundos: quem corrigia justamente porque a
// contagem estava errada acabava com ela parada de vez. E era garantido acontecer, porque a
// primeira estimativa depende de um tempo/run que quase nunca está exato.
//
// Você sabe o número verdadeiro (basta olhar as entradas restantes no inventário). Então o certo é
// tratar a correção como ensino: com N runs em X de tempo ativo, o ritmo real é X/N — daí em
// diante a contagem segue sozinha e certa. Uma correção por sessão passa a bastar.
export function setActiveSessionRuns(value) {
  const s = AppState.activeDgSession;
  if (!s) return;
  const runs = Math.max(0, parseInt(value, 10) || 0);
  s.runs = runs;

  // Com pouco tempo de sessão, X/N seria um ritmo tirado de quase nenhuma amostra (e faria a
  // contagem disparar). Nesse caso só respeita o número e congela, como antes.
  const activeMs = getActiveSessionSummary()?.activeMs || 0;
  const baseSuficiente = activeMs >= 2 * 60000;
  if (runs > 0 && baseSuficiente) {
    s.runMinutes = Math.max(0.5, Math.round((activeMs / runs / 60000) * 10) / 10);
    s.runsManuallySet = false;
    showInfoToast(`Ritmo recalibrado: ~${String(s.runMinutes).replace('.', ',')}min por run. Sigo contando sozinho.`);
  } else {
    s.runsManuallySet = true;
  }
  saveActiveDgSession();
  renderPage();
}

// Atalho pro jeito mais confiável de informar: você acabou de sair de uma run, clica. Cada clique
// também recalibra (ver acima), então o ritmo vai ficando certo sozinho conforme você usa.
export function bumpActiveSessionRuns() {
  const s = AppState.activeDgSession;
  if (!s) return;
  setActiveSessionRuns((s.runs || 0) + 1);
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
// Quantas sessões excluídas ficam guardadas. É rede de segurança pra arrependimento recente, não
// um segundo histórico — por isso um número pequeno, e não "tudo pra sempre".
const DELETED_SESSIONS_LIMIT = 10;

export function deleteSession(startAt) {
  const index = AppState.dgSessions.findIndex(s => s.startAt === startAt);
  if (index < 0) return;
  const [sessao] = AppState.dgSessions.splice(index, 1);
  // Vai pra lixeira, não pro vácuo. O toast de desfazer é o caminho rápido (segundos); a lixeira
  // é pra quando você só percebe o erro depois — e sessão é farme de verdade, não configuração.
  AppState.deletedSessions.unshift({ ...sessao, deletedAt: Date.now() });
  if (AppState.deletedSessions.length > DELETED_SESSIONS_LIMIT) {
    AppState.deletedSessions.length = DELETED_SESSIONS_LIMIT;
  }
  saveDgSessions();
  saveDeletedSessions().catch(err => console.error('Falha ao salvar lixeira de sessões:', err));
  renderPage();

  actWithUndo(`Sessão removida: ${sessao.dungeonName} (${formatAlzGamer(sessionTotalAlz(sessao))})`, () => {
    restoreDeletedSession(sessao.startAt);
  });
}

// Devolve uma sessão da lixeira pro histórico. Reordena por startAt em vez de reinserir no índice
// antigo — a posição de antes não vale mais nada se outras sessões entraram desde então.
export function restoreDeletedSession(startAt) {
  const index = AppState.deletedSessions.findIndex(s => s.startAt === startAt);
  if (index < 0) return;
  const [sessao] = AppState.deletedSessions.splice(index, 1);
  delete sessao.deletedAt;
  AppState.dgSessions.push(sessao);
  AppState.dgSessions.sort((a, b) => a.startAt - b.startAt);
  saveDgSessions();
  saveDeletedSessions().catch(err => console.error('Falha ao salvar lixeira de sessões:', err));
  renderPage();
}

// Apaga de vez. Aqui a confirmação faz sentido (diferente do excluir, que tem a lixeira atrás):
// depois disto não há mais de onde voltar.
export function purgeDeletedSession(startAt) {
  const sessao = AppState.deletedSessions.find(s => s.startAt === startAt);
  if (!sessao) return;
  if (!confirm(`Apagar definitivamente a sessão de ${sessao.dungeonName}? Depois disso não tem como recuperar.`)) return;
  AppState.deletedSessions = AppState.deletedSessions.filter(s => s.startAt !== startAt);
  saveDeletedSessions().catch(err => console.error('Falha ao salvar lixeira de sessões:', err));
  renderPage();
}

// Recapitulação do dia, no espírito do placar de fim de partida que todo jogo tem. O jogador já
// tira print pra mandar no Discord da guild — hoje ele fotografa uma tela que não foi desenhada
// pra ser fotografada. Só junta números que já existem espalhados; nenhuma conta nova.
export function computeDaySummary(dateISO = todayISODate()) {
  const sessions = AppState.dgSessions.filter(s => s.date === dateISO);
  const farmed = sessions.reduce((sum, s) => sum + sessionTotalAlz(s), 0);
  const spent = AppState.rushHistory[dateISO]?.total || 0;
  const runs = sessions.reduce((sum, s) => sum + (s.runs || 0), 0);
  const activeMs = sessions.reduce((sum, s) => sum + (s.activeDurationMs ?? s.durationMs ?? 0), 0);
  const sold = AppState.salesLog
    .filter(s => s.date === dateISO)
    .reduce((sum, s) => sum + s.unitPrice * s.qty, 0);

  // Melhor drop do dia entre todas as sessões, pelo preço unitário de hoje.
  let bestItem = null;
  sessions.forEach(s => Object.keys(s.items || {}).forEach(name => {
    if (isExcludedGearItem(name)) return;
    const price = getItemPrice(name);
    if (price > 0 && (!bestItem || price > bestItem.price)) bestItem = { name, price };
  }));

  // DG que mais rendeu no dia — o "MVP" da partida.
  const byDg = {};
  sessions.forEach(s => { byDg[s.dungeonName] = (byDg[s.dungeonName] || 0) + sessionTotalAlz(s); });
  const topDg = Object.entries(byDg).sort((a, b) => b[1] - a[1])[0] || null;

  return {
    date: dateISO,
    farmed, spent, net: farmed - spent, sold, runs, activeMs,
    sessionCount: sessions.length,
    bestItem,
    topDg: topDg ? { name: topDg[0], alz: topDg[1] } : null,
    hasAnything: sessions.length > 0 || spent > 0 || sold > 0,
  };
}

// Copia o resumo do dia como texto pronto pra colar no Discord/WhatsApp da guild. Texto e não
// imagem de propósito: sobrevive a copiar/colar em qualquer lugar, não depende de permissão de
// canvas nem de o print sair legível no celular de quem recebe.
export function copyDaySummary() {
  const d = computeDaySummary();
  const linhas = [
    `⚔️ Farme de ${formatDateBR(d.date)}`,
    `Farmado: ${formatAlzGamer(d.farmed)}`,
  ];
  if (d.spent > 0) linhas.push(`Gasto em rush: ${formatAlzGamer(d.spent)}`, `Líquido: ${d.net >= 0 ? '+' : ''}${formatAlzGamer(d.net)}`);
  if (d.runs > 0) linhas.push(`Runs: ${d.runs} em ${d.sessionCount} sessão(ões)`);
  if (d.topDg) linhas.push(`Melhor DG: ${d.topDg.name} (${formatAlzGamer(d.topDg.alz)})`);
  if (d.bestItem) linhas.push(`Melhor drop: ${d.bestItem.name} (${formatAlzGamer(d.bestItem.price)})`);
  if (d.sold > 0) linhas.push(`Vendido: ${formatAlzGamer(d.sold)}`);

  const texto = linhas.join('\n');
  navigator.clipboard?.writeText(texto)
    .then(() => showInfoToast('Resumo do dia copiado'))
    .catch(() => showInfoToast('Não consegui copiar — seu navegador bloqueou'));
}

// Anotação livre de uma sessão ("lag", "testando build nova", "evento 2×"). Existe porque uma
// sessão atípica distorce a média daquela DG pra sempre (o agregado soma o histórico inteiro) e o
// único remédio que o app oferecia era EXCLUIR — o que apaga farme que aconteceu de verdade.
// Anotar preserva o dado e explica o ponto fora da curva pra quando você reler o histórico meses
// depois. Só texto: não entra em conta nenhuma, de propósito.
export function setSessionNote(startAt, value) {
  const s = AppState.dgSessions.find(x => x.startAt === startAt);
  if (!s) return;
  const note = (value || '').trim().slice(0, 120);
  if (note) s.note = note;
  else delete s.note;
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

// "DG esfriando" (ver computeDgComparison): quantas sessões recentes entram na média de
// comparação, quantas são o mínimo pra confiar nela (1 sessão ruim isolada não prova queda de
// mercado) e quanto o recente precisa cair abaixo da média geral pra virar um aviso.
export const RECENT_SESSIONS_FOR_TREND = 5;
const MIN_SESSIONS_FOR_TREND = 2;
const COOLING_DROP_THRESHOLD = 0.2; // 20%

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
  const registro = buildSessionRecord({
    dungeonId: s.dungeonId,
    dungeonName: s.dungeonName,
    routeId: s.routeId,
    routeName: s.routeName,
    startAt: s.startAt,
    endAt: endAt || Date.now(),
    runs: s.runs,
  });
  // Anotação sobrevive ao encerrar/retomar (ver resumeDgSession) — foi escrita pelo jogador, não
  // é dado derivado que possa ser recalculado.
  if (s.note) registro.note = s.note;
  AppState.dgSessions.push(registro);
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

// Custo de entrada de UMA run de uma DG (Alz direto + tickets×preço + gemas×preço) — a mesma
// conta que "Vale a pena resetar?" já fazia inline. Fatorado aqui pra "líquido" significar
// exatamente a mesma coisa em todo lugar que compara DG (comparação, reset, rotas), em vez de
// três fórmulas que podem divergir se uma mudar e as outras não.
export function entryCostPerRun(dg, gemValue, ticketValue) {
  if (!dg) return 0;
  return (dg.alzCost || 0) + (dg.ticketsPerRun || 0) * ticketValue + (dg.gemsPerRun || 0) * gemValue;
}

// Agrega as sessões salvas por DG, ordenado por Alz/hora (qual DG rende mais). É a ferramenta de
// decisão: "onde meu tempo de macro rende melhor".
//
// Alz/run e Alz/hora aqui são BRUTOS (só o que caiu, sem descontar o custo de entrada) — a ordem
// de sort e os consumidores existentes (rota, próximo passo da Visão geral) dependem desse
// critério bruto continuar estável. Os campos líquidos (netAlzPerRun etc.) vêm JUNTO, prontos pra
// quem quiser comparar por lucro de verdade (ver o toggle Bruto/Líquido em Sessões de farme) sem
// precisar de uma segunda função nem mudar quem já usa o bruto.
//
// sinceDate (opcional, ISO): limita a agregação a sessões daquela data em diante — é o toggle
// "Últimos 30 dias" de Sessões de farme. Sem isso, agrega o histórico inteiro (comportamento
// padrão, o que todo outro consumidor desta função espera).
export function computeDgComparison({ sinceDate } = {}) {
  // Valor da gema/ticket vem de Parâmetros do dia (rush-page.js) — a MESMA fonte que o carrinho
  // de rush usa de verdade pra cobrar de você (calculateRushCartCost em rush-cart.js). Não tem
  // um segundo "valor da gema" digitado só pra essa conta; antes tinha (resetConfig.gemValueAlz/
  // ticketValueAlz) e podia divergir do que o carrinho realmente cobrava pela mesma DG.
  const gemValue = getCostPerGem();
  const ticketValue = +AppState.rushTicketPrice || 0;

  const byDg = {};
  AppState.dgSessions.forEach(s => {
    if (sinceDate && s.date < sinceDate) return;
    const agg = byDg[s.dungeonId] || (byDg[s.dungeonId] = {
      dungeonId: s.dungeonId, dungeonName: s.dungeonName, sessions: 0, activeMs: 0, runs: 0, dropCount: 0, totalAlz: 0, sessionsList: [],
    });
    agg.sessions++;
    // Tempo ativo (fiel), com fallback pra duração total em sessões antigas sem o campo.
    agg.activeMs += s.activeDurationMs ?? s.durationMs;
    agg.runs += s.runs || 0;
    agg.dropCount += s.dropCount;
    agg.totalAlz += sessionTotalAlz(s);
    agg.sessionsList.push(s);
  });
  return Object.values(byDg)
    .map(a => {
      const dg = AppState.dungeonList.find(d => d.id === a.dungeonId);
      const costPerRun = entryCostPerRun(dg, gemValue, ticketValue);
      // Sem runs registradas não dá pra saber quantas entradas o total pagou — cai pro mesmo
      // valor do bruto (custo 0) em vez de virar null, já que "sem dado de custo" não é o mesmo
      // erro que "sem dado de rendimento" (alzPerRun/netAlzPerRun continuam null por runs=0).
      const netTotalAlz = a.totalAlz - costPerRun * a.runs;
      const alzPerRun = a.runs > 0 ? a.totalAlz / a.runs : null;

      // "Esfriando": compara as últimas RECENT_SESSIONS_FOR_TREND sessões desta DG (por Alz/run)
      // contra a média geral acima. O histórico nunca é purgado (de propósito), então sem isso uma
      // DG que rendia bem há meses continua no topo do ranking mesmo que o item que ela dropa
      // tenha caído de preço há semanas — a média de longo prazo mascara a queda recente.
      const recentSessions = [...a.sessionsList]
        .sort((x, y) => x.startAt - y.startAt)
        .slice(-RECENT_SESSIONS_FOR_TREND)
        .filter(s => (s.runs || 0) > 0);
      let recentAlzPerRun = null;
      let cooling = false;
      // Por QUE esfriou. Só existem duas causas possíveis aqui, e elas pedem reações opostas:
      // caiu o VOLUME (a DG está dropando menos coisa por run → o problema é a DG, troque de DG)
      // ou piorou a COMPOSIÇÃO (dropa a mesma quantidade, mas de itens mais baratos → o problema
      // é o que ela dropa, e trocar de DG pode não resolver).
      //
      // Preço de mercado NÃO entra na lista: sessionTotalAlz reavalia todo histórico pelo preço de
      // HOJE (ver o comentário lá), então uma queda de preço derruba as duas janelas por igual e
      // nunca aparece como "esfriando". Sem isso documentado, é fácil concluir a causa errada.
      let coolingCause = null;
      if (recentSessions.length >= MIN_SESSIONS_FOR_TREND) {
        const recentRuns = recentSessions.reduce((sum, s) => sum + (s.runs || 0), 0);
        recentAlzPerRun = recentRuns > 0 ? recentSessions.reduce((sum, s) => sum + sessionTotalAlz(s), 0) / recentRuns : null;
        cooling = recentAlzPerRun != null && alzPerRun != null && recentAlzPerRun < alzPerRun * (1 - COOLING_DROP_THRESHOLD);
        if (cooling) {
          const countItems = list => list.reduce((sum, s) => sum + Object.entries(s.items || {})
            .filter(([name]) => !isExcludedGearItem(name))
            .reduce((n, [, qty]) => n + qty, 0), 0);
          const recentPerRun = recentRuns > 0 ? countItems(recentSessions) / recentRuns : null;
          const overallPerRun = a.runs > 0 ? countItems(a.sessionsList) / a.runs : null;
          if (recentPerRun != null && overallPerRun > 0) {
            coolingCause = recentPerRun < overallPerRun * (1 - COOLING_DROP_THRESHOLD)
              ? { tipo: 'volume', recentPerRun, overallPerRun }
              : { tipo: 'composicao', recentPerRun, overallPerRun };
          }
        }
      }

      return {
        dungeonId: a.dungeonId,
        dungeonName: a.dungeonName,
        sessions: a.sessions,
        runs: a.runs,
        dropCount: a.dropCount,
        totalAlz: a.totalAlz,
        durationMs: a.activeMs, // "tempo total" exibido = soma do tempo ativo
        alzPerHour: a.activeMs > MIN_ACTIVE_MS_FOR_RATE ? a.totalAlz / (a.activeMs / 3600000) : null,
        alzPerRun,
        // Tempo médio por run = tempo ativo somado ÷ runs somadas — mesma ideia do Alz/run, sem
        // precisar de nenhum campo novo (usado pra sugerir rota pelo tempo disponível do jogador).
        msPerRun: a.runs > 0 ? a.activeMs / a.runs : null,
        entryCostPerRun: costPerRun,
        netTotalAlz,
        netAlzPerRun: a.runs > 0 ? netTotalAlz / a.runs : null,
        netAlzPerHour: a.activeMs > MIN_ACTIVE_MS_FOR_RATE ? netTotalAlz / (a.activeMs / 3600000) : null,
        recentAlzPerRun,
        cooling,
        coolingCause,
      };
    })
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

// Consistência de farme: quantos dos últimos N dias tiveram sessão, tempo ativo total, sequência
// atual e maior buraco sem farmar dentro da janela. Igual a computePersonalBests, não ajuda a
// decidir ONDE farmar (isso é trabalho de Sessões de farme) — é sobre ROTINA: você está mantendo
// o ritmo ou já faz dias que não farma sem perceber? "Sua evolução" já mostra a renda por
// período; isto é a mesma ideia só que no eixo do tempo farmado, não do Alz rendido.
export function computeFarmingConsistency(days) {
  const dayMs = 86400000;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const isoOf = offsetDays => {
    const d = new Date(startOfToday.getTime() - offsetDays * dayMs);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const activeMsByDate = {};
  AppState.dgSessions.forEach(s => {
    if (!s.date) return;
    activeMsByDate[s.date] = (activeMsByDate[s.date] || 0) + (s.activeDurationMs ?? s.durationMs ?? 0);
  });

  // cells[0] = dia mais antigo da janela, último = hoje — ordem cronológica, pro heatmap ler da
  // esquerda (passado) pra direita (hoje), igual qualquer calendário.
  const cells = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = isoOf(offset);
    cells.push({ date, activeMs: activeMsByDate[date] || 0 });
  }

  const daysComFarme = cells.filter(c => c.activeMs > 0).length;
  const totalActiveMs = cells.reduce((sum, c) => sum + c.activeMs, 0);

  // Sequência atual: quantos dias seguidos ATÉ HOJE (de trás pra frente) tiveram farme — quebra
  // no primeiro dia vazio. Maior buraco: o intervalo mais longo sem farme em toda a janela, não
  // só o mais recente — pra "há quanto tempo você não some" não ficar escondido atrás de um dia
  // isolado de farme no meio de semanas paradas.
  let streakAtual = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].activeMs > 0) streakAtual++;
    else break;
  }
  let maiorBuraco = 0, buracoCorrente = 0;
  cells.forEach(c => {
    if (c.activeMs > 0) { buracoCorrente = 0; }
    else { buracoCorrente++; maiorBuraco = Math.max(maiorBuraco, buracoCorrente); }
  });

  return { cells, totalDays: days, daysComFarme, totalActiveMs, streakAtual, maiorBuraco };
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
// entryCostPerRun/netAlzPerRun já vêm prontos de computeDgComparison (mesma conta usada lá pro
// toggle Bruto/Líquido) — aqui só falta ratear o custo do RESET em cima do líquido.
//
// dgStats (opcional): aceita um computeDgComparison() já calculado, pra quem monta várias contas
// na mesma renderização (Sessões de farme chama isto, computeRouteComparison E
// suggestRouteForTime, todos sobre o MESMO histórico) não repetir a varredura de
// AppState.dgSessions — que nunca é purgado — três, quatro vezes seguidas pelo mesmo resultado.
// Sem argumento, recalcula (comportamento de sempre, pros chamadores que só precisam disto).
export function computeResetWorth(dgStats = computeDgComparison()) {
  const cfg = AppState.resetConfig;
  const gemValue = getCostPerGem(); // mesma fonte de Parâmetros do dia usada em computeDgComparison
  const runsPerReset = Math.max(1, cfg.runsPerReset || 1);
  const resetCostPerRun = ((cfg.resetCostGems || 0) * gemValue) / runsPerReset;

  const rows = dgStats
    .filter(c => c.alzPerRun != null)
    .map(c => ({
      dungeonName: c.dungeonName,
      alzPerRun: c.alzPerRun,
      entryCostPerRun: c.entryCostPerRun,
      netAlzPerRun: c.netAlzPerRun,
      profitAfterReset: c.netAlzPerRun - resetCostPerRun,
      worth: c.netAlzPerRun - resetCostPerRun > 0,
    }))
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
      // Só pra CIMA. Depois de uma recalibração o ritmo muda, e o novo cálculo pode dar menos que
      // o número que já está na tela — ver o contador andar pra trás faria parecer defeito, e o
      // número menor não seria mais verdadeiro que o que o jogador acabou de confirmar.
      if (computedRuns > session.runs) {
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
