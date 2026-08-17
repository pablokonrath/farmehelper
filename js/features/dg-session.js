import { AppState } from '../state/app-state.js';
import { getItemPrice, getItemPriceOn, summarizeDropsByItem, isExcludedGearItem, isEventItem } from './drops.js';
import { getCostPerGem, getTicketPrice } from './rush-cart.js';
import { saveDgSessions, saveActiveDgSession, saveResetConfig, saveDeletedSessions } from '../state/persistence.js';
import { formatAlzGamer, parseTimeInputBR, formatDateBR } from '../utils/formatting.js';
import { todayISODate, normalizeForSearch, stripEnhancementSuffix } from '../utils/parsing.js';
import { esc } from '../utils/escape.js';
import { setWatchdogEnabled, showInfoToast, showGoalToast } from './alerts.js';
import { relaySessionToTelegram } from './telegram.js';
import { getExpectedItemNamesForDungeon, getManualExpectedItemNames } from './item-dungeon-sources.js';
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

// Item de evento nao vale Alz (ver isEventItem): e ficha de troca, e o valor aparece quando voce
// resgata a recompensa — contar o preco dele agora e o premio depois seria contar duas vezes.
function summarizeDrops(drops) {
  const valorEm = d => (isEventItem(d.name) ? 0 : getItemPrice(d.name));
  const totalAlz = drops.reduce((sum, d) => sum + valorEm(d), 0);
  let best = null;
  drops.forEach(d => {
    const price = valorEm(d);
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
// Sessão SEM DG é permitida — mas só pra detecção automática, nunca pro início manual.
//
// A regra é: capturar o tempo é urgente, atribuir a DG não é. A detecção precisa abrir a sessão
// no primeiro drop pra não perder farme, e nesse instante ela quase nunca sabe qual DG é. Antes
// ela resolvia isso chutando a última DG farmada — o que enfia drops da DG errada na média de
// outra e suja o "Onde dropa". Uma sessão sem DG não entra em conta nenhuma até alguém dizer
// qual é: ela só segura o tempo e os drops, que é exatamente o que não dá pra recuperar depois.
//
// Quem clica "Iniciar" na mão, por outro lado, sabe onde está — aí exigir a DG é de graça.
export function startDgSession(dungeonId, runMinutes, { startAt, auto = false } = {}) {
  if (!dungeonId && !auto) return;
  const dg = dungeonId ? AppState.dungeonList.find(d => d.id === dungeonId) : null;
  if (dungeonId && !dg) return;

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
    dungeonId: dg?.id || null,
    dungeonName: dg?.name || null,
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
  // Marca que o tempo por run é palavra sua. Virou necessário quando a sessão passou a poder
  // nascer sem DG: agora é normal digitar o tempo ANTES de escolher a DG, e sem essa marca o
  // setActiveSessionDungeon sobrescrevia o seu número com a sugestão (ou com 0) logo em seguida.
  s.runMinutesManuallySet = s.runMinutes > 0;
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
// auto = quem está marcando a DG é a detecção pelos itens, não o jogador. Muda duas coisas: não
// pergunta nada (um confirm() aparecendo sozinho no meio do farme seria péssimo) e não limpa o
// aviso de "confira a DG" — quem conferiu foi o app, e ele pode ter errado.
export function setActiveSessionDungeon(dungeonId, { auto = false } = {}) {
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
  // A pergunta só faz sentido quando havia uma DG anterior pra separar. Sessão que estava sem DG
  // não tem farme atribuído a ninguém pra proteger — rotular tudo é a única leitura possível.
  if (!auto && s.dungeonId && s.resumedAt && sessionDrops(s.startAt, s.resumedAt).length) {
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
  // nova, a menos que o jogador já tenha dito o tempo (ou corrigido as runs) na mão.
  //
  // Sem sugestão pra DG nova, MANTÉM o valor atual em vez de zerar. Zerar desliga a contagem
  // automática caladamente — era o que acontecia ao escolher a DG numa sessão aberta sozinha:
  // DG sem histórico, sugestão nula, contador morto sem nada na tela explicando. Um número
  // herdado pode estar errado e você corrige; zero não conta nada e não avisa.
  if (!s.runsManuallySet && !s.runMinutesManuallySet) {
    s.runMinutes = suggestRunMinutes(dg.id)?.minutes || s.runMinutes || 0;
  }
  // Confirmar a DG na mão tira o aviso de "aberta automaticamente, confira": você acabou de
  // conferir. A rota também é reavaliada — a nova DG pode pertencer a outra rota aplicada hoje.
  if (!auto) s.autoStarted = false;
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
  return computeRunsDoneOn(dungeonName, todayISODate());
}

// Runs feitas numa DG numa data qualquer. Generalização de computeRunsDoneToday, que era o único
// jeito de saber isso e só respondia sobre hoje — a reconciliação do rush (cobrar só o que foi
// feito) precisa perguntar sobre qualquer dia salvo.
// DGs que já avisamos hoje que bateram o limite. Em memória, e semeada na PRIMEIRA checagem de
// cada DG: se ela já estava no limite quando a página abriu, marca sem avisar. Sem isso, todo
// reload de página mandaria a mensagem de novo — e recarregar durante o farme é rotina.
const limiteAvisado = new Set();

// Marca como "já avisado" toda DG que JÁ estava no limite quando o app abriu. Chamada uma vez,
// depois do estado carregar.
//
// Antes esse papel era feito por um guard dentro do próprio aviso ("só avisa se houver sessão
// ativa nessa DG"), e isso tinha um furo bobo: o app fechou a sessão nas 19, você conferiu no
// jogo, viu que foram 20 e corrigiu no histórico — sem sessão ativa, a mensagem nunca saía. E
// esse é justamente o caminho mais comum de chegar às 20, porque a última run costuma acabar
// depois do último drop.
//
// Semear na abertura resolve os dois lados: quem já estava completo não recebe mensagem repetida
// a cada reload, e qualquer edição que CRUZE o limite depois disso avisa, venha de onde vier.
// A DG da sessão VIVA fica de fora da semeadura: o aviso dela ainda não saiu (só sai ao encerrar),
// então marcá-la aqui engoliria a mensagem de vez. Recarregar a página no meio do farme é rotina.
export function seedDailyLimitNotified() {
  const hoje = todayISODate();
  const viva = AppState.activeDgSession?.dungeonName;
  for (const dg of AppState.dungeonList) {
    if (dg.name === viva) continue;
    if (computeRunsDoneOn(dg.name, hoje) >= DAILY_RUN_LIMIT) limiteAvisado.add(`${hoje}|${dg.name}`);
  }
}

// Avisa (tela + Telegram) quando uma DG completa as runs do dia. É o momento em que você tem que
// TROCAR DE DG, e é justamente quando você não está olhando a tela — está no jogo. Um aviso que
// chega no celular resolve; um toast que some em 5s não.
//
// Manda o resumo junto porque o número sozinho não fecha nada: o que interessa saber ali é se
// aquelas 20 entradas valeram o que costumam valer.
//
// SÓ avisa com a sessão daquela DG já ENCERRADA. O contador é uma estimativa (tempo ativo ÷ tempo
// por run), então ele bate 20 antes da vigésima run acabar de verdade no jogo. Avisando ali, a
// mensagem chega no celular dizendo "acabou" enquanto você ainda está dentro — você sai e perde o
// drop da run que estava rodando. Fechada a sessão, o número é fato, e o resumo também: enquanto
// ela está viva ainda pode cair coisa que mudaria o total.
//
// Não marca como avisado quando segura: a intenção é adiar, não cancelar.
export function checkDailyRunLimitReached(dungeonName) {
  if (!dungeonName) return;
  const chave = `${todayISODate()}|${dungeonName}`;
  if (limiteAvisado.has(chave)) return;
  if (AppState.activeDgSession?.dungeonName === dungeonName) return;

  const runs = computeRunsDoneOn(dungeonName, todayISODate());
  if (runs < DAILY_RUN_LIMIT) return;

  limiteAvisado.add(chave);

  // Só sessões encerradas: pelo guard acima, nenhuma desta DG está viva neste momento.
  const doDia = AppState.dgSessions.filter(s => s.date === todayISODate() && s.dungeonName === dungeonName);
  const alz = doDia.reduce((sum, s) => sum + sessionRealizedAlz(s), 0);
  const drops = doDia.reduce((sum, s) => sum + (s.dropCount || 0), 0);
  const ativo = doDia.reduce((sum, s) => sum + (s.activeDurationMs ?? s.durationMs ?? 0), 0);

  // Divide pelas runs REAIS, não pelo limite: corrigindo o histórico dá pra passar de 20, e aí
  // "por run" calculado em cima de 20 mentiria pra cima.
  const linhas = [
    `✅ ${dungeonName} — ${runs}/${DAILY_RUN_LIMIT} runs do dia (sessão encerrada)`,
    `Farmado: ${formatAlzGamer(alz)}`,
    `Por run: ${formatAlzGamer(alz / runs)}`,
    `Drops: ${drops}`,
    `Tempo: ${Math.round(ativo / 60000)}min`,
  ];
  // Compara com o que essa DG costuma render — é o que transforma o número em informação.
  const hist = computeDgComparison().find(c => c.dungeonName === dungeonName);
  if (hist?.alzPerRun) {
    const diff = Math.round(((alz / runs) / hist.alzPerRun - 1) * 100);
    linhas.push(`Contra a média dessa DG (${formatAlzGamer(hist.alzPerRun)}/run): ${diff >= 0 ? '+' : ''}${diff}%`);
  }
  linhas.push('Limite diário batido — hora de trocar de DG (ou resetar por gemas).');

  const texto = linhas.join('\n');
  relaySessionToTelegram(texto);
  showGoalToast('✅ DG concluída', texto.split('\n').slice(1).join(' · '));
}

export function computeRunsDoneOn(dungeonName, dateISO) {
  let runs = AppState.dgSessions
    .filter(s => s.date === dateISO && s.dungeonName === dungeonName)
    .reduce((sum, s) => sum + (s.runs || 0), 0);
  // A sessão em andamento ainda não está no histórico, mas as runs dela já aconteceram — sem isso
  // o número fica atrasado justamente durante o farme, que é quando você olha.
  if (dateISO === todayISODate() && AppState.activeDgSession?.dungeonName === dungeonName) {
    runs += AppState.activeDgSession.runs || 0;
  }
  return runs;
}

// Edita as runs de uma sessão já encerrada (identificada pelo startAt, único por sessão).
export function setSessionRuns(startAt, value) {
  const s = AppState.dgSessions.find(x => x.startAt === startAt);
  if (!s) return;
  s.runs = Math.max(0, parseInt(value, 10) || 0);
  saveDgSessions();
  // Corrigir aqui é o caminho MAIS comum de chegar ao limite: a última run costuma acabar depois
  // do último drop, então a sessão fecha nas 19 e você acerta pra 20 no histórico. Sem esta
  // chamada, justamente esse caso nunca avisava.
  if (s.date === todayISODate()) checkDailyRunLimitReached(s.dungeonName);
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

  actWithUndo(`Sessão removida: ${sessao.dungeonName} (${formatAlzGamer(sessionRealizedAlz(sessao))})`, () => {
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
  // REALIZADO: preço do dia, não de hoje. O gasto abaixo é histórico (o rush salvo daquele dia,
  // congelado); misturar receita a preços de hoje com custo da época fazia o líquido de um dia
  // antigo mudar sozinho quando o mercado mexia, sem o custo dele acompanhar.
  const realizados = sessions.map(s => sessionRealizedAlzInfo(s));
  const farmed = realizados.reduce((sum, r) => sum + r.total, 0);
  // Algum item entrou pelo preço de hoje por falta de histórico — a tela avisa em vez de
  // apresentar estimativa como fato.
  const farmedExact = realizados.every(r => r.exact);
  const spent = AppState.rushHistory[dateISO]?.total || 0;
  const runs = sessions.reduce((sum, s) => sum + (s.runs || 0), 0);
  const activeMs = sessions.reduce((sum, s) => sum + (s.activeDurationMs ?? s.durationMs ?? 0), 0);
  const sold = AppState.salesLog
    .filter(s => s.date === dateISO)
    .reduce((sum, s) => sum + s.unitPrice * s.qty, 0);

  // Melhor drop do dia entre todas as sessões, pelo preço unitário de hoje.
  let bestItem = null;
  sessions.forEach(s => Object.keys(s.items || {}).forEach(name => {
    if (isExcludedGearItem(name) || isEventItem(name)) return;
    // Melhor drop pelo preco DAQUELE dia — o resumo e um retrato do dia, nao uma reavaliacao.
    const price = getItemPriceOn(name, dateISO).price;
    if (price > 0 && (!bestItem || price > bestItem.price)) bestItem = { name, price };
  }));

  // DG que mais rendeu no dia — o "MVP" da partida.
  const byDg = {};
  sessions.forEach((s, i) => { byDg[s.dungeonName] = (byDg[s.dungeonName] || 0) + realizados[i].total; });
  const topDg = Object.entries(byDg).sort((a, b) => b[1] - a[1])[0] || null;

  return {
    date: dateISO,
    farmed, farmedExact, spent, net: farmed - spent, sold, runs, activeMs,
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
// Fecha a sessão ativa SEM gravar nada no histórico. É pro caso da sessão que não deveria ter
// existido — a detecção automática abriu no primeiro drop e ele acabou não virando farme nenhum.
// Os drops continuam no log e voltam a aparecer no painel de farme sem DG, então descartar aqui
// não perde informação, só evita uma linha inútil no histórico.
export function discardActiveDgSession({ silent = false } = {}) {
  const s = AppState.activeDgSession;
  if (!s) return;
  const wasAutoWatchdog = s.autoWatchdog;
  AppState.activeDgSession = null;
  saveActiveDgSession();
  if (wasAutoWatchdog && AppState.alertSettings.watchdogEnabled) setWatchdogEnabled(false);
  renderPage();
  if (!silent) showInfoToast('Sessão descartada — os drops continuam no log.');
}

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
  // Aqui, e não no contador: só agora o "20/20" é fato e o resumo está completo. Depois de limpar
  // activeDgSession, pra que o guard lá dentro enxergue a sessão como encerrada.
  if (registro.date === todayISODate()) checkDailyRunLimitReached(registro.dungeonName);
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
// Todos os blocos de farme de um dia que NÃO pertencem a nenhuma sessão registrada.
//
// suggestForgottenSessionWindow (acima) só enxerga o rabo da linha do tempo: ancora no fim da
// última sessão e olha pra frente. Isso cobre "esqueci de marcar e acabei de farmar", mas não
// cobre buraco no MEIO — que é o que sobra quando você exclui uma sessão antiga e já registrou
// outras depois dela. Aquele farme fica órfão e invisível, sem jeito de recuperar.
//
// Aqui a conta é ao contrário: pega os drops do dia e tira os que já estão dentro da janela de
// alguma sessão. O que sobra é agrupado em blocos contínuos (mesmo critério de burstStartAt), e
// cada bloco vira um candidato a virar sessão.
export function findUnclaimedDropWindows(dateISO) {
  const inicioDia = new Date(dateISO + 'T00:00:00').getTime();
  const fimDia = inicioDia + 86400000;
  const janelasOcupadas = AppState.dgSessions
    .filter(s => (s.endAt || 0) >= inicioDia && s.startAt <= fimDia)
    .map(s => [s.startAt, s.endAt || s.startAt]);
  // A sessão em andamento também ocupa janela, senão o farme de agora apareceria como "sem DG"
  // e o painel ficaria cutucando você no meio do próprio farme.
  if (AppState.activeDgSession) janelasOcupadas.push([AppState.activeDgSession.startAt, Infinity]);

  const livres = AppState.drops
    .filter(d => {
      if (!d.timestamp || isExcludedGearItem(d.name)) return false;
      const t = d.timestamp.getTime();
      if (t < inicioDia || t >= fimDia) return false;
      return !janelasOcupadas.some(([a, b]) => t >= a && t <= b);
    })
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!livres.length) return [];

  const gapMs = Math.max(1, +AppState.sessionIdleCloseMinutes || 5) * 60000;
  const blocos = [];
  let atual = [livres[0]];
  for (let i = 1; i < livres.length; i++) {
    if (livres[i].timestamp - livres[i - 1].timestamp >= gapMs) {
      blocos.push(atual);
      atual = [];
    }
    atual.push(livres[i]);
  }
  blocos.push(atual);

  return blocos.map(b => {
    const porItem = summarizeDropsByItem(b);
    return {
      startAt: b[0].timestamp.getTime(),
      endAt: b[b.length - 1].timestamp.getTime(),
      dropCount: b.length,
      totalAlz: porItem.reduce((soma, i) => soma + i.total, 0),
      // Os itens mais valiosos do bloco: é por eles que você reconhece de qual DG era aquele farme.
      items: porItem.slice(0, 4).map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`),
    };
  });
}

// Registra um desses blocos como sessão da DG escolhida. Diferente de recoverForgottenSession, a
// janela é EXATA (início e fim do bloco), não "daqui até agora" — recuperar farme do meio do dia
// não pode engolir tudo que veio depois.
export function recoverDropWindow(dungeonId, startAt, endAt) {
  const dg = AppState.dungeonList.find(d => d.id === dungeonId);
  if (!dg || !(startAt < endAt)) return;
  const routeMatch = findAppliedRouteForDungeon(dungeonId);
  // Estima as runs pelo tempo por run que já conhecemos dessa DG. Sem isso a sessão recuperada
  // nasce com 0 runs, e 0 runs significa "— runs" no Alz/run: justamente a métrica pela qual você
  // recuperou o farme. Estimativa dá pra corrigir na tabela; zero não dá pra usar. Sem histórico
  // da DG, continua 0 — aí não há de onde tirar número nenhum.
  const porRun = suggestRunMinutes(dungeonId)?.minutes || 0;
  const drops = sessionDrops(startAt, endAt);
  const runsEstimadas = porRun > 0 ? Math.max(1, Math.round(activeDurationMs(drops) / (porRun * 60000))) : 0;

  AppState.dgSessions.push(buildSessionRecord({
    dungeonId: dg.id,
    dungeonName: dg.name,
    routeId: routeMatch?.id,
    routeName: routeMatch?.name,
    startAt,
    endAt,
    runs: runsEstimadas,
  }));
  AppState.dgSessions.sort((a, b) => a.startAt - b.startAt);
  saveDgSessions();
  renderPage();
  showInfoToast(`Farme das ${new Date(startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} registrado em ${dg.name}${runsEstimadas ? ` — estimei ${runsEstimadas} run(s) pelo seu ritmo nessa DG, corrija na tabela se precisar` : ''}`);
}

// Junta um bloco órfão a uma sessão que JÁ está registrada, em vez de criar outra.
//
// É o caso de "esse drop é da Siena que eu já registrei": criar uma segunda sessão de Siena pro
// mesmo farme estragaria a contagem de sessões e o Alz/run das duas metades. Como a pertinência
// é derivada da janela, juntar = esticar a janela até cobrir o bloco e reconstruir o registro a
// partir dela — assim itens, drops, Alz e melhor drop saem todos coerentes de uma vez, sem
// somar na mão e sem risco de o resumo discordar do log.
//
// A duração de relógio cresce com o intervalo entre os dois trechos, mas activeDurationMs
// desconta parado acima do limite de inatividade — o tempo/run continua honesto.
export function attachDropWindowToSession(sessionStartAt, blockStartAt, blockEndAt) {
  const idx = AppState.dgSessions.findIndex(s => s.startAt === Number(sessionStartAt));
  if (idx < 0) return;
  const s = AppState.dgSessions[idx];
  const novoInicio = Math.min(s.startAt, blockStartAt);
  const novoFim = Math.max(s.endAt || s.startAt, blockEndAt);

  // Esticar a janela não pode passar por cima de outra sessão: os drops dela passariam a contar
  // nas duas, e aí o total do dia mentiria. Melhor recusar e deixar você registrar como sessão
  // própria do que inventar uma atribuição dupla.
  const conflito = AppState.dgSessions.find((o, i) => i !== idx && o.startAt <= novoFim && (o.endAt || o.startAt) >= novoInicio);
  if (conflito) {
    alert(`Não dá pra esticar até lá: a sessão de ${conflito.dungeonName} (${new Date(conflito.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}) está no meio do caminho, e os drops dela acabariam contando duas vezes. Registre esse bloco como sessão própria.`);
    return;
  }
  if (AppState.activeDgSession && AppState.activeDgSession.startAt <= novoFim) {
    alert('Não dá pra esticar até lá: a sessão em andamento começa antes do fim desse trecho. Encerre ela primeiro.');
    return;
  }

  // Espalha o registro antigo por baixo pra não perder o que buildSessionRecord não conhece
  // (anotação, marcações manuais de runs).
  AppState.dgSessions[idx] = {
    ...s,
    ...buildSessionRecord({
      dungeonId: s.dungeonId,
      dungeonName: s.dungeonName,
      routeId: s.routeId,
      routeName: s.routeName,
      startAt: novoInicio,
      endAt: novoFim,
      runs: s.runs,
    }),
  };
  saveDgSessions();
  renderPage();
  showInfoToast(`Trecho juntado a ${s.dungeonName} — ${AppState.dgSessions[idx].dropCount} drops na sessão agora.`);
}

// Um botão só no painel: o alvo escolhido diz se é pra juntar a uma sessão já registrada
// ("s:<startAt>") ou abrir uma sessão nova na DG escolhida (o id da DG, sem prefixo).
export function applyUnclaimedWindow(target, blockStartAt, blockEndAt) {
  if (!target) return;
  if (target.startsWith('s:')) attachDropWindowToSession(target.slice(2), blockStartAt, blockEndAt);
  else recoverDropWindow(target, blockStartAt, blockEndAt);
}

// ── Dividir uma sessão que virou duas DGs ────────────────────────────────────────────────────
//
// Acontece: você encadeia duas DGs e só percebe depois que nunca encerrou a sessão no meio. O
// farme das duas fica num registro só, com o nome da primeira — e aí as duas médias mentem: a
// primeira ganha drops que não são dela, a segunda não existe naquele dia.
//
// Na mão não tem conserto sem perder dado: excluir e recriar joga fora runs, anotação e o vínculo
// com a rota. Mas como pertinência aqui é SEMPRE derivada da janela de tempo, "dividir" é só
// escolher um instante — tudo antes fica na sessão A, tudo depois vira a sessão B, e os dois
// registros são reconstruídos do log. Nada é somado na mão, então nada pode divergir dele.
//
// O difícil é achar o instante. São três evidências, e a mais forte que existir manda:
//
//   1. IDENTIFICADORES. Se o Cristal de Fogo (só Solo) aparece na primeira metade e o Cristal de
//      Terra (só Tumba) na segunda, a fronteira está entre o último de um e o primeiro do outro.
//      Isso não é palpite: é o cadastro "Onde dropa" afirmando de propósito. É de longe o melhor
//      sinal, e ainda diz QUAIS são as duas DGs — você não precisa lembrar.
//   2. TEMPO DE 20 RUNS. Sem identificador, e sabendo a primeira DG, o limite diário dela é o
//      relógio: 20 × o tempo/run que o seu histórico já mediu. Conta em tempo ATIVO, não de
//      relógio, senão uma pausa longa no meio empurraria o corte pra frente.
//   3. MAIOR PAUSA. Último recurso. Trocar de DG exige sair, teleportar e entrar, então costuma
//      deixar um buraco maior que o normal entre um drop e o outro.
//
// Nenhuma delas é infalível, e por isso o corte é SUGERIDO, não imposto: o painel mostra as duas
// metades prontas (drops, Alz, itens) e deixa você mover o corte pelos maiores intervalos antes
// de confirmar. Você reconhece o próprio farme melhor que qualquer heurística.

const chaveItemSessao = nome => normalizeForSearch(stripEnhancementSuffix(nome));

// Item → a ÚNICA DG que o cadastra, ou 'multi' quando mais de uma cadastra (aí não identifica
// nada). Mesmo critério de exclusividade do palpite de DG na abertura automática de sessão.
function mapaDeItensExclusivos() {
  const porItem = new Map();
  for (const dg of AppState.dungeonList) {
    for (const nome of getManualExpectedItemNames(dg.id)) {
      const k = chaveItemSessao(nome);
      porItem.set(k, porItem.has(k) ? 'multi' : dg);
    }
  }
  return porItem;
}

// Os intervalos sem drop dentro da sessão, do maior pro menor. Cada um é um corte possível: o
// instante fica no MEIO do buraco, que é o chute mais neutro sobre quando você trocou de DG.
function cortesCandidatos(t) {
  const gaps = [];
  for (let i = 1; i < t.length; i++) gaps.push({ i, gapMs: t[i] - t[i - 1], at: t[i - 1] + Math.floor((t[i] - t[i - 1]) / 2) });
  return gaps.sort((a, b) => b.gapMs - a.gapMs);
}

// Índice do primeiro drop que já passou de `alvoMs` de tempo ATIVO desde o início. Ativo, e não
// relógio, pelo mesmo motivo de activeDurationMs: parada longa não é farme, e contá-la aqui
// jogaria o corte pra depois do fim da primeira DG.
function indicePorTempoAtivo(t, alvoMs) {
  let ativo = 0;
  for (let i = 1; i < t.length; i++) {
    ativo += Math.min(t[i] - t[i - 1], ACTIVE_IDLE_CAP_MS);
    if (ativo >= alvoMs) return i;
  }
  return -1;
}

export function suggestSessionSplit(sessionStartAt, primeiraDgId) {
  const s = AppState.dgSessions.find(x => x.startAt === Number(sessionStartAt));
  if (!s) return null;
  const drops = sessionDrops(s.startAt, s.endAt || s.startAt).slice().sort((a, b) => a.timestamp - b.timestamp);
  // Com pouquíssimo drop não há duas DGs pra separar — e qualquer corte deixaria um lado com um
  // drop só, que não vira sessão nenhuma.
  if (drops.length < 4) return null;
  const t = drops.map(d => d.timestamp.getTime());
  const gaps = cortesCandidatos(t);

  // 1) Identificadores.
  const exclusivos = mapaDeItensExclusivos();
  const porDg = new Map(); // dg → { primeiro, ultimo } índices
  drops.forEach((d, i) => {
    const dg = exclusivos.get(chaveItemSessao(d.name));
    if (!dg || dg === 'multi') return;
    const reg = porDg.get(dg);
    if (reg) reg.ultimo = i;
    else porDg.set(dg, { primeiro: i, ultimo: i });
  });

  if (porDg.size === 2) {
    const [a, b] = [...porDg.entries()].sort((x, y) => x[1].primeiro - y[1].primeiro);
    // Só serve se as duas DGs estiverem SEPARADAS no tempo. Intercaladas, a evidência se
    // contradiz — pode ser cadastro errado, pode ser drop atribuído torto — e um corte inventado
    // no meio da confusão seria pior que cair na evidência seguinte.
    if (a[1].ultimo < b[1].primeiro) {
      const dentro = gaps.filter(g => g.i > a[1].ultimo && g.i <= b[1].primeiro);
      const corte = dentro[0] || { at: t[b[1].primeiro - 1] + Math.floor((t[b[1].primeiro] - t[b[1].primeiro - 1]) / 2) };
      return {
        splitAt: corte.at,
        firstDgId: a[0].id,
        secondDgId: b[0].id,
        motivo: 'identificadores',
        detalhe: `Os itens dizem: ${a[0].name} até aí, ${b[0].name} depois. É o cadastro "Onde dropa" falando, não estimativa.`,
        gaps,
      };
    }
  }

  // 2) Tempo de 20 runs da primeira DG.
  const dgId = primeiraDgId || s.dungeonId;
  const porRun = dgId ? suggestRunMinutes(dgId)?.minutes || 0 : 0;
  if (porRun > 0) {
    const alvo = DAILY_RUN_LIMIT * porRun * 60000;
    const idx = indicePorTempoAtivo(t, alvo);
    if (idx > 0 && idx < t.length) {
      // Encosta o corte no maior intervalo perto dali: a hora exata das 20 runs cai no meio de
      // qualquer lugar, e a troca de DG deixou um buraco. O buraco é mais verdadeiro que a conta.
      const perto = gaps.filter(g => Math.abs(g.i - idx) <= 3)[0];
      const corte = perto || { at: t[idx - 1] + Math.floor((t[idx] - t[idx - 1]) / 2), i: idx };
      const dgNome = AppState.dungeonList.find(d => d.id === dgId)?.name || 'a primeira DG';
      return {
        splitAt: corte.at,
        firstDgId: dgId,
        secondDgId: null,
        motivo: 'tempo de 20 runs',
        detalhe: `${DAILY_RUN_LIMIT} runs de ${dgNome} a ${String(porRun).replace('.', ',')}min cada dão ${Math.round(alvo / 60000)}min de farme — o corte caiu aí${perto ? ', encostado no maior intervalo sem drop por perto' : ''}. Confira as duas metades abaixo.`,
        gaps,
      };
    }
  }

  // 3) Maior pausa.
  const maior = gaps[0];
  if (!maior) return null;
  return {
    splitAt: maior.at,
    firstDgId: dgId || null,
    secondDgId: null,
    motivo: 'maior pausa',
    detalhe: `Não tenho identificador nem tempo/run dessa DG pra cravar, então usei o maior intervalo sem drop (${Math.round(maior.gapMs / 60000)}min) — trocar de DG costuma deixar esse buraco. Esse é o palpite mais fraco dos três: confira as metades e mova se precisar.`,
    gaps,
  };
}

// Como ficam os dois lados de um corte, pra você conferir ANTES de confirmar. Sem isso a divisão
// seria um salto no escuro — e desfazer uma divisão errada dá o mesmo trabalho que causou ela.
export function previewSessionSplit(sessionStartAt, splitAt) {
  const s = AppState.dgSessions.find(x => x.startAt === Number(sessionStartAt));
  if (!s) return null;
  const fim = s.endAt || s.startAt;
  const lado = (a, b) => {
    const drops = sessionDrops(a, b);
    const porItem = summarizeDropsByItem(drops);
    return {
      startAt: a,
      endAt: b,
      dropCount: drops.length,
      activeMs: activeDurationMs(drops),
      // Mesma conta que sessionRealizedAlzInfo fará depois — agrupado por item e a preço da
      // época. Somar drop a drop daria quase o mesmo número, mas "quase" num preview é veneno:
      // ele existe justamente pra você conferir, e conferir contra um valor que muda ao confirmar
      // é pior que não ter preview nenhum.
      totalAlz: porItem.reduce((soma, i) => soma + (isEventItem(i.name) ? 0 : getItemPriceOn(i.name, s.date).price * i.qty), 0),
      items: porItem.slice(0, 5).map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`),
    };
  };
  return { antes: lado(s.startAt, splitAt), depois: lado(splitAt + 1, fim) };
}

// Executa a divisão. A sessão original é reconstruída na primeira metade e uma nova nasce da
// segunda — as duas por buildSessionRecord, a partir do log, como qualquer outra.
//
// Runs: são repartidas na proporção do TEMPO ATIVO de cada lado, porque foi assim que elas
// aconteceram. Mas é estimativa, e o toast diz isso — as duas ficam editáveis na tabela.
export function splitSession(sessionStartAt, splitAt, firstDgId, secondDgId) {
  const idx = AppState.dgSessions.findIndex(x => x.startAt === Number(sessionStartAt));
  if (idx < 0) return;
  const s = AppState.dgSessions[idx];
  const fim = s.endAt || s.startAt;
  splitAt = Number(splitAt);
  if (!(splitAt > s.startAt && splitAt < fim)) {
    alert('O ponto de corte precisa cair dentro da sessão.');
    return;
  }
  const pre = previewSessionSplit(sessionStartAt, splitAt);
  if (!pre || !pre.antes.dropCount || !pre.depois.dropCount) {
    alert('Esse corte deixaria um dos lados sem nenhum drop — mova o ponto de divisão.');
    return;
  }

  const dgA = AppState.dungeonList.find(d => d.id === firstDgId) || null;
  const dgB = AppState.dungeonList.find(d => d.id === secondDgId) || null;

  const totalAtivo = pre.antes.activeMs + pre.depois.activeMs;
  const runsTotal = s.runs || 0;
  const runsA = totalAtivo > 0 ? Math.round(runsTotal * (pre.antes.activeMs / totalAtivo)) : Math.floor(runsTotal / 2);
  const runsB = runsTotal - runsA;

  // A segunda metade herda a rota só se for a MESMA DG da rota original — trocar de DG quase
  // sempre significa que você saiu da rota, e herdar o rótulo enfiaria farme avulso no total dela.
  const mesmaRota = dgB && dgB.id === s.dungeonId;

  const primeira = {
    ...s,
    ...buildSessionRecord({
      dungeonId: dgA?.id || null,
      dungeonName: dgA?.name || null,
      routeId: s.routeId,
      routeName: s.routeName,
      startAt: s.startAt,
      endAt: splitAt,
      runs: runsA,
    }),
  };
  const segunda = buildSessionRecord({
    dungeonId: dgB?.id || null,
    dungeonName: dgB?.name || null,
    routeId: mesmaRota ? s.routeId : null,
    routeName: mesmaRota ? s.routeName : null,
    startAt: splitAt + 1,
    endAt: fim,
    runs: runsB,
  });
  // A anotação fica só na primeira: ela foi escrita sobre um farme que agora são dois, e copiar
  // pros dois lados inventaria um contexto que ninguém afirmou.
  if (s.note) primeira.note = s.note;

  AppState.dgSessions.splice(idx, 1, primeira, segunda);
  AppState.dgSessions.sort((a, b) => a.startAt - b.startAt);
  AppState.sessionSplitDraft = null;
  saveDgSessions();
  renderPage();
  showInfoToast(`Dividida: ${dgA?.name || 'sem DG'} até ${new Date(splitAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}, ${dgB?.name || 'sem DG'} depois. Reparti as ${runsTotal} runs por tempo (${runsA}/${runsB}) — confira e corrija na tabela.`);
}

// Abre/fecha o painel de divisão. Ao abrir, já vem com a sugestão pronta: o trabalho de achar o
// corte é do app, não seu.
export function toggleSessionSplit(sessionStartAt) {
  const startAt = Number(sessionStartAt);
  if (AppState.sessionSplitDraft?.startAt === startAt) {
    AppState.sessionSplitDraft = null;
    renderPage();
    return;
  }
  const s = AppState.dgSessions.find(x => x.startAt === startAt);
  if (!s) return;
  const sug = suggestSessionSplit(startAt, s.dungeonId);
  if (!sug) {
    alert('Essa sessão tem drops de menos pra dividir — não dá pra separar duas DGs com tão pouca coisa. Se ela for mesmo de duas, o jeito é remover e recuperar cada trecho pelo painel de farme sem DG.');
    return;
  }
  AppState.sessionSplitDraft = {
    startAt,
    splitAt: sug.splitAt,
    firstDgId: sug.firstDgId || s.dungeonId || '',
    secondDgId: sug.secondDgId || '',
  };
  renderPage();
}

export function setSessionSplitPoint(value) {
  if (!AppState.sessionSplitDraft) return;
  AppState.sessionSplitDraft.splitAt = Number(value);
  renderPage();
}

export function setSessionSplitDungeon(qual, dungeonId) {
  if (!AppState.sessionSplitDraft) return;
  AppState.sessionSplitDraft[qual === 'segunda' ? 'secondDgId' : 'firstDgId'] = dungeonId || '';
  // Trocar a PRIMEIRA DG muda o tempo/run que alimenta a evidência nº 2, então vale recalcular a
  // sugestão — é exatamente o fluxo que o jogador pediu: "seleciono a DG e ele acha o corte".
  if (qual === 'primeira') {
    const sug = suggestSessionSplit(AppState.sessionSplitDraft.startAt, dungeonId);
    if (sug) AppState.sessionSplitDraft.splitAt = sug.splitAt;
  }
  renderPage();
}

export function confirmSessionSplit() {
  const d = AppState.sessionSplitDraft;
  if (!d) return;
  splitSession(d.startAt, d.splitAt, d.firstDgId, d.secondDgId);
}

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
// Quanto a sessão REALMENTE rendeu: cada item pelo preço que valia no dia dela.
//
// Par de sessionTotalAlz, e a diferença entre os dois é a diferença entre duas perguntas:
//
//   sessionRealizedAlz  → "quanto eu ganhei naquele dia?"    (contabilidade)
//   sessionTotalAlz     → "quanto isso valeria hoje?"        (comparação entre DGs)
//
// As duas estão certas, cada uma pra sua pergunta. O erro era usar uma no lugar da outra: o
// resultado do dia subtraía um custo histórico de uma receita a preços de hoje, e o passado
// mudava sozinho quando o mercado mexia.
//
// Preços de hoje continuam certos pra DECIDIR (Qual DG rende mais, rotas, reset, gerador): sem
// isso não dá pra comparar uma DG farmada em julho com uma de agosto — a diferença seria do
// mercado, não da DG.
//
// exact=false em algum item significa que faltou histórico e aquele item entrou pelo preço atual.
export function sessionRealizedAlzInfo(session) {
  if (!session.items) return { total: session.totalAlz || 0, exact: true };
  let total = 0;
  let exact = true;
  for (const [name, qty] of Object.entries(session.items)) {
    if (isExcludedGearItem(name) || isEventItem(name)) continue;
    const p = getItemPriceOn(name, session.date);
    if (!p.exact) exact = false;
    total += p.price * qty;
  }
  return { total, exact };
}

export function sessionRealizedAlz(session) {
  return sessionRealizedAlzInfo(session).total;
}

export function sessionTotalAlz(session) {
  if (!session.items) return session.totalAlz || 0;
  let total = 0;
  for (const [name, qty] of Object.entries(session.items)) {
    if (isExcludedGearItem(name) || isEventItem(name)) continue;
    total += getItemPrice(name) * qty;
  }
  return total;
}

// Custo de entrada de UMA run de uma DG (Alz direto + tickets×preço + gemas×preço) — a mesma
// conta que "Vale a pena resetar?" já fazia inline. Fatorado aqui pra "líquido" significar
// exatamente a mesma coisa em todo lugar que compara DG (comparação, reset, rotas), em vez de
// três fórmulas que podem divergir se uma mudar e as outras não.
// Mediana de uma lista de números, ou null se vazia. Existe porque quase todo número por run do
// app é derivado de "Runs feitas", que é digitado à mão — e uma sessão com runs erradas move a
// média muito mais do que move a mediana.
function medianaDe(valores) {
  const lista = valores.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!lista.length) return null;
  const meio = Math.floor(lista.length / 2);
  return lista.length % 2 ? lista[meio] : (lista[meio - 1] + lista[meio]) / 2;
}

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
  const ticketValue = getTicketPrice();

  const byDg = {};
  AppState.dgSessions.forEach(s => {
    if (sinceDate && s.date < sinceDate) return;
    // Sessão ainda sem DG não vira uma "DG" fantasma na comparação — ela fica fora de todas as
    // médias até você dizer qual era, que é o ponto de existir sem DG.
    if (!s.dungeonId) return;
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

      // Alz por run TÍPICO: mediana entre as sessões, e só entre as que têm "Runs feitas".
      //
      // Eram dois erros somados no `a.totalAlz / a.runs` de antes:
      //
      // 1) Sessão sem runs preenchidas entrava com o Alz dela no numerador e com ZERO no
      //    denominador — inflava a média. É o mesmo bug que findDropSources já tinha corrigido
      //    do lado da taxa de drop; aqui tinha passado.
      //
      // 2) Média ponderada dá mais peso justo à sessão com mais runs — e "mais runs" é
      //    exatamente onde o número erra mais, porque runs é digitado à mão (e o contador
      //    automático já falhou pra cima mais de uma vez). Uma sessão com runs infladas tem
      //    Alz/run baixo E peso grande: o dado pior é o que mais manda no resultado.
      //
      // Mediana entre sessões resolve os dois. Mesmo raciocínio já usado em suggestRunMinutes.
      const sessoesComRuns = a.sessionsList.filter(s => (s.runs || 0) > 0);
      const alzPerRun = medianaDe(sessoesComRuns.map(s => sessionTotalAlz(s) / s.runs));

      // Tempo por run pela mesma régua: mediana das sessões com runs, não o tempo total dividido
      // pelo total de runs (que também somava o tempo de sessões sem runs no numerador).
      const msPerRun = medianaDe(sessoesComRuns.map(s => (s.activeDurationMs ?? s.durationMs) / s.runs));

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
        // Mediana também aqui: a janela recente é comparada contra alzPerRun, que agora é mediana.
        // Comparar média contra mediana marcaria "esfriando" só pela troca de régua, não porque a
        // DG piorou — as duas pontas da conta têm que ser medidas do mesmo jeito.
        recentAlzPerRun = medianaDe(recentSessions.map(s => sessionTotalAlz(s) / s.runs));
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
        msPerRun,
        entryCostPerRun: costPerRun,
        netTotalAlz,
        // Derivados do Alz/run típico, não do total dividido — senão o líquido por run e o líquido
        // por hora continuariam contando a mesma média distorcida que o bruto acabou de deixar de
        // usar, e as duas metades da mesma tela discordariam entre si.
        netAlzPerRun: alzPerRun != null ? alzPerRun - costPerRun : null,
        netAlzPerHour: alzPerRun != null && msPerRun > 0 ? (alzPerRun - costPerRun) / (msPerRun / 3600000) : null,
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
// Histórico DIA A DIA de uma DG: quanto rendeu em cada dia que você a farmou.
//
// A comparação entre DGs já existe ("Qual DG rende mais"), mas ela responde com um número só por
// DG — e um número só esconde a variação, que é justamente o que decide se vale insistir. Duas
// DGs com o mesmo Alz/run médio podem ser uma constante e outra de sorte pura, e a média não
// distingue as duas.
//
// Usa o REALIZADO (preço da época): a pergunta é "qual dia me deu mais Alz", e isso é dinheiro que
// entrou, não uma reavaliação do passado. Ver sessionRealizedAlz.
export function computeDungeonDailyHistory(dungeonId, { limite = 30 } = {}) {
  if (!dungeonId) return [];
  const porDia = new Map();

  for (const s of AppState.dgSessions) {
    if (s.dungeonId !== dungeonId) continue;
    let dia = porDia.get(s.date);
    if (!dia) porDia.set(s.date, (dia = { date: s.date, runs: 0, alz: 0, dropCount: 0, activeMs: 0, sessoes: 0 }));
    dia.runs += s.runs || 0;
    dia.alz += sessionRealizedAlz(s);
    dia.dropCount += s.dropCount || 0;
    dia.activeMs += s.activeDurationMs ?? s.durationMs ?? 0;
    dia.sessoes++;
  }

  const dias = [...porDia.values()]
    .map(d => ({
      ...d,
      alzPerRun: d.runs > 0 ? d.alz / d.runs : null,
      alzPerHour: d.activeMs > MIN_ACTIVE_MS_FOR_RATE ? d.alz / (d.activeMs / 3600000) : null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Melhor dia pelo Alz/RUN, não pelo total: dia com mais runs rende mais por definição, e
  // "melhor" aí seria só "joguei mais", que você já sabe. Entre dias com runs preenchidas.
  const comRuns = dias.filter(d => d.alzPerRun != null);
  const melhorPorRun = comRuns.length ? Math.max(...comRuns.map(d => d.alzPerRun)) : null;
  const melhorTotal = dias.length ? Math.max(...dias.map(d => d.alz)) : null;

  return dias.slice(0, limite).map(d => ({
    ...d,
    ehMelhorPorRun: melhorPorRun != null && d.alzPerRun === melhorPorRun,
    ehMelhorTotal: melhorTotal != null && d.alz === melhorTotal,
  }));
}

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
  // Recorde é sobre o que ACONTECEU, então vale o preço da época. Com preços de hoje, um item que
  // valorizou promoveria retroativamente um dia antigo a "melhor dia" — e o recorde mudaria
  // sozinho sem você ter farmado nada, que é o oposto do que um recorde significa.
  AppState.dgSessions.forEach(s => {
    const valor = sessionRealizedAlz(s);
    byDate[s.date] = (byDate[s.date] || 0) + valor;
    if (!bestSession || valor > bestSession.valor) bestSession = { ...s, valor };
  });
  const [bestDate, bestDateTotal] = Object.entries(byDate).sort(([, a], [, b]) => b - a)[0];
  return {
    bestDay: { date: bestDate, totalAlz: bestDateTotal },
    bestSession: { date: bestSession.date, dungeonName: bestSession.dungeonName || 'Sem DG', totalAlz: bestSession.valor },
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
      sidebar.innerHTML = `<i class="ti ti-crosshair" style="color:var(--gold)"></i> ${esc(summary.dungeonName || 'Sem DG')} · ${clock} · <strong>${formatAlzGamer(summary.totalAlz)}</strong>`;
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
