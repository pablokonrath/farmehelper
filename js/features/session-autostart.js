import { AppState } from '../state/app-state.js';
import { startDgSession, endDgSession, discardActiveDgSession, resumeDgSession, setActiveSessionDungeon, getActiveSessionSummary, unclaimedDropsSince, burstStartAt, suggestRunMinutes } from './dg-session.js';
import { getExpectedItemNamesForDungeon, getManualExpectedItemNames } from './item-dungeon-sources.js';
import { showGoalToast } from './alerts.js';
import { relaySessionToTelegram } from './telegram.js';
import { saveAutoSessionEnabled, saveSessionIdleCloseMinutes } from '../state/persistence.js';
import { stripEnhancementSuffix, normalizeForSearch } from '../utils/parsing.js';
import { formatAlzGamer } from '../utils/formatting.js';
import { renderPage } from '../router.js';

// A maior fonte de buraco no histórico é humana: esquecer de apertar "Iniciar" antes de entrar
// na DG. Todo o farme daquele período existe no log, mas fica fora de qualquer sessão — e é a
// sessão que alimenta "Qual DG rende mais", tempo/run, Onde dropa e o resto.
//
// Este módulo fecha isso: quando drops começam a cair sem nenhuma sessão aberta, ele abre uma
// sozinho, retroagindo o início pro primeiro drop. O palpite da DG usa o cadastro "Onde dropa"
// (itens que só caem em certas DGs); se não der pra cravar, a sessão abre SEM DG e você escolhe
// quando quiser — sessão sem DG fica fora de todas as médias, então não contamina nada enquanto
// espera. Antes ela caía na última DG farmada, o que enfiava drops na média da DG errada.

// Quantos drops precisam cair sem sessão antes de abrir uma. Agora é 1: o primeiro drop já abre.
//
// Era 5 porque a sessão nascia obrigada a ter uma DG, e 1 drop é pouco pra chutar qual. Só que o
// preço disso era perder os primeiros minutos de todo farme — e em DG que dropa devagar, "5
// drops" podia levar vários minutos, deixando um pedaço inteiro fora da sessão pra você juntar
// na mão depois. Como agora a sessão pode nascer SEM DG (ver startDgSession), não há mais nada
// pra esperar: abre no primeiro drop e a DG se resolve sozinha logo em seguida.
const MIN_DROPS_TO_DETECT = 1;

// Abaixo disso, uma sessão sem DG que chega ao fim não vale uma linha no histórico — provavelmente
// foi um drop perdido, não um farme. Ela é descartada no encerramento e os drops voltam pro painel
// de "farme sem DG", onde você resolve se quiser. Sessão que ganhou DG é sempre guardada.
const MIN_DROPS_TO_KEEP_UNASSIGNED = 3;
// Só considera drops recentes — um lote antigo relido do arquivo não deve abrir sessão.
const RECENT_WINDOW_MS = 10 * 60 * 1000;

// Chave de comparação: sem +N, sem acento, minúscula. O catálogo é digitado à mão, então casar
// string crua faria "cristal de fogo" não reconhecer o "Cristal de Fogo" do log — e o cadastro
// pareceria simplesmente não funcionar, sem nenhum sinal de por quê.
const chaveItem = nome => normalizeForSearch(stripEnhancementSuffix(nome));

// Só conta item EXCLUSIVO: o que aparece na lista de uma única DG. Item que cai em tudo é
// ignorado em vez de virar voto — antes ele pontuava pra todas as DGs e, no empate, vencia a
// primeira da lista, ou seja, a ordem do cadastro decidia a DG. Palpite errado por desempate
// arbitrário é pior que palpite nenhum, porque vem com a mesma cara de certeza.
//
// E se dois exclusivos apontarem pra DGs diferentes, a evidência se contradiz e não há palpite —
// a sessão fica sem DG, que hoje é uma resposta perfeitamente boa.
function votarPorExclusivos(names, listaEsperadaDe) {
  const dgsPorItem = new Map();
  for (const dg of AppState.dungeonList) {
    const expected = new Set([...listaEsperadaDe(dg.id)].map(chaveItem));
    if (!expected.size) continue;
    for (const name of names) {
      if (!expected.has(name)) continue;
      if (!dgsPorItem.has(name)) dgsPorItem.set(name, []);
      dgsPorItem.get(name).push(dg);
    }
  }

  const votos = new Map();
  for (const [, dgs] of dgsPorItem) {
    if (dgs.length !== 1) continue; // cai em mais de uma DG: não identifica nada
    votos.set(dgs[0], (votos.get(dgs[0]) || 0) + 1);
  }
  if (votos.size !== 1) return null; // nenhum item exclusivo, ou exclusivos brigando entre si

  const [dg, score] = [...votos][0];
  return { dg, score };
}

function guessDungeonFromDrops(drops) {
  const names = new Set(drops.map(d => chaveItem(d.name)));

  // 1) Catálogo curado primeiro, SOZINHO. É o cadastro "Itens × DGs", onde alguém afirmou de
  //    propósito que aquele item sai daquela DG — Cristal de Fogo no Solo Flamejante, Cristal de
  //    Terra na Tumba, e assim por diante. Isso é a ferramenta de identificação por excelência.
  //
  //    Precisa vir sozinho porque a lista combinada mistura curadoria com inferência: basta o
  //    Cristal de Fogo ter caído uma vez numa sessão marcada com a DG errada pra ele entrar como
  //    "raro estatístico" de outra DG também — e aí deixa de ser exclusivo e é DESCARTADO. Um
  //    acidente no histórico anulava a afirmação deliberada. Curadoria ganha de coincidência.
  const curado = votarPorExclusivos(names, getManualExpectedItemNames);
  if (curado) return curado;

  // 2) Sem catálogo que resolva, cai no que o histórico sugere ser raro daquela DG.
  return votarPorExclusivos(names, getExpectedItemNamesForDungeon);
}

export function toggleAutoSessionStart(enabled) {
  AppState.autoSessionEnabled = !!enabled;
  saveAutoSessionEnabled().catch(err => console.error('Falha ao salvar detecção automática:', err));
}

export function setSessionIdleCloseMinutes(value) {
  AppState.sessionIdleCloseMinutes = Math.max(1, parseInt(value, 10) || 5);
  saveSessionIdleCloseMinutes().catch(err => console.error('Falha ao salvar limite de inatividade:', err));
  renderPage();
}

function idleCloseMs() {
  return Math.max(1, +AppState.sessionIdleCloseMinutes || 5) * 60000;
}

// O limite de inatividade é UM SÓ: o que você configurou. Nada de derivar da DG.
//
// Já tentamos derivar (metade de uma run sem drop, metade disso depois das 20 runs) partindo de
// que fechar cedo custaria pouco, porque a retomada religaria a mesma sessão. Na prática não
// custa pouco: a retomada exige evidência POSITIVA de que o farme é o mesmo (ver pareceMesmoFarme)
// e, quando não tem essa evidência, ela abre sessão nova em vez de retomar — de propósito, porque
// juntar farme de duas DGs é o erro caro. O resultado era fechar no meio da DG e picar o farme em
// várias sessões.
//
// Entre um número que você escolhe e entende e um número derivado que erra sozinho, o seu ganha.

// Sessão encerrada há pouco que provavelmente é o MESMO farme: você parou 5 minutos (foi vender,
// trocou de canal, andou até a próxima entrada) e voltou. Retomar em vez de abrir outra é o que
// permite o limite de inatividade ser curto sem custo — sem isso, um limite de 5min picaria um
// farme de 3 horas em muitas sessões, inflando a contagem e fragmentando o recorde de melhor
// sessão. A janela é 3× o limite: se ficou muito mais tempo que isso parado, aí é farme novo.
// Os drops que voltaram são a continuação DAQUELA sessão, ou você trocou de DG na pausa?
//
// Exige evidência POSITIVA de que é o mesmo farme. A primeira versão retomava quando o palpite de
// DG era nulo — e "não sei qual DG" foi tratado como "é a mesma", que é errado justamente no caso
// que importa: quem parou o Solo Flamejante e foi pra Tumba Ancestral tinha a sessão do Solo
// reaberta, e os drops da Tumba entravam somados aos do Solo, sob a DG errada.
//
// A assimetria dos erros manda aqui. Não retomar quando era o mesmo farme parte uma sessão em
// duas: contagem de sessões inflada, chato e reversível. Retomar quando NÃO era mistura o farme de
// duas DGs num registro só: corrompe o Alz/run das duas, o tempo/run, e o "o que essa DG dropa" em
// Onde dropa — tudo que o app usa pra decidir. Na dúvida, não retoma.
function pareceMesmoFarme(anterior, recentes, guess) {
  // 1) Os itens raros que caíram apontam pra essa mesma DG. É o sinal mais forte.
  if (guess) return guess.dg.id === anterior.dungeonId;

  // 2) Sem palpite: aceita só se TUDO que está caindo agora já caía naquela sessão. Um nome
  //    inédito é indício de que a DG mudou — e como o custo de errar é alto, um indício basta
  //    pra desistir. Exige a sessão anterior ter registro de itens pra comparar contra.
  const itensAntes = anterior.items ? Object.keys(anterior.items) : [];
  if (!itensAntes.length) return false;
  const conhecidos = new Set(itensAntes.map(n => stripEnhancementSuffix(n)));
  return recentes.every(d => conhecidos.has(stripEnhancementSuffix(d.name)));
}

// "3min" / "1,5min" — o limite derivado raramente cai em minuto redondo.
function formatMinutos(ms) {
  const min = ms / 60000;
  return `${(Math.round(min * 10) / 10).toString().replace('.', ',')}min`;
}

function recentlyClosedSession() {
  if (!AppState.dgSessions.length) return null;
  const janela = idleCloseMs() * 3;
  let ultima = null;
  for (const s of AppState.dgSessions) {
    if (!ultima || (s.endAt || 0) > (ultima.endAt || 0)) ultima = s;
  }
  if (!ultima?.endAt) return null;
  return Date.now() - ultima.endAt <= janela ? ultima : null;
}

// Chamada a cada lote de drops novos do log (ver file-source.js). Barata: sai logo de cara no
// caso comum (sessão já aberta).
// Sessão aberta sem DG: continua olhando os itens que caem e crava a DG assim que o cadastro
// "Onde dropa" permitir. É a metade adiada do auto-start — abrir é urgente, identificar não é, e
// esperar aqui custa zero porque o tempo já está sendo contado.
function resolveUnassignedDungeon() {
  const s = AppState.activeDgSession;
  if (!s || s.dungeonId) return;
  const summary = getActiveSessionSummary();
  if (!summary?.items?.length) return;
  const guess = guessDungeonFromDrops(summary.items);
  if (!guess) return;

  setActiveSessionDungeon(guess.dg.id, { auto: true });
  showGoalToast(
    '🎯 DG identificada',
    `Os itens que caíram são de ${guess.dg.name} — marquei a sessão. Se não for, é só trocar no seletor do card.`
  );
}

export function checkAutoStartSession() {
  if (!AppState.autoSessionEnabled) return;
  if (AppState.activeDgSession) { resolveUnassignedDungeon(); return; }
  if (!AppState.dungeonList.length) return;

  const recent = unclaimedDropsSince(RECENT_WINDOW_MS);
  if (!recent.length) return;

  const guess = guessDungeonFromDrops(recent);

  // Antes de abrir uma sessão nova: os drops voltaram logo depois de um encerramento automático?
  // Então é a continuação do mesmo farme — retoma aquela sessão. Só não retoma se os itens que
  // caíram apontam com confiança pra uma DG DIFERENTE (você trocou de DG na pausa): aí é farme
  // novo mesmo, e retomar atribuiria drops da DG nova à antiga.
  const anterior = recentlyClosedSession();
  if (anterior && pareceMesmoFarme(anterior, recent, guess)) {
    resumeDgSession(anterior);
    showGoalToast(
      '▶️ Sessão retomada',
      `Os drops voltaram, então continuei a sessão de ${anterior.dungeonName} em vez de abrir outra — o intervalo parado não conta no tempo. Trocou de DG? Corrija no seletor que eu separo as duas.`
    );
    return;
  }

  if (recent.length < MIN_DROPS_TO_DETECT) return;

  // Só assume uma DG quando os itens apontam pra ela. Sem isso a sessão nasce SEM DG em vez de
  // herdar a última farmada: um palpite errado aqui contamina a média e o "Onde dropa" daquela
  // outra DG, e o custo de arrumar é maior que o de escolher depois.
  const dungeon = guess?.dg || null;

  // Retroage pro início do bloco de farme atual (mesmo critério do início manual) — não pro drop
  // mais antigo da janela, que pode ser de antes de uma pausa.
  const startAt = burstStartAt(recent);
  // Tempo por run vem do histórico da própria DG — é o que faz a contagem de runs funcionar sem
  // o jogador precisar informar nada. Sem DG ainda não há o que sugerir; quando ela for definida,
  // setActiveSessionDungeon reaplica a sugestão.
  const sugestao = dungeon ? suggestRunMinutes(dungeon.id) : null;
  startDgSession(dungeon?.id || null, sugestao?.minutes || 0, { startAt, auto: true });

  const sobreRuns = sugestao
    ? ` Contando as runs sozinho a ~${sugestao.minutes.toString().replace('.', ',')}min por run (sua média nessa DG).`
    : '';
  showGoalToast(
    '▶️ Sessão iniciada sozinha',
    (dungeon
      ? `Detectei farme em ${dungeon.name} (pelos itens que caíram). Se não for essa DG, troque no seletor do card.`
      : 'O tempo já está contando. Ainda não dá pra saber qual DG é — escolha no card, ou espere: se cair um item que só existe numa DG, eu marco sozinho.') + sobreRuns
  );
}

// Encerra a sessão sozinho quando os drops param. Sem isso, sair do PC com a sessão aberta faz o
// tempo parado entrar na duração e afundar a média de tempo/run daquela DG PRA SEMPRE (é o que o
// próprio histórico avisa). Fecha no horário do último drop, não no "agora" — o intervalo morto
// não conta. Chamado no heartbeat do worker (~5s), com ou sem drop novo.
//
// O limite agora é seu (AppState.sessionIdleCloseMinutes, padrão 5min). Era fixo em 20min porque
// encerrar cedo picava um farme longo em várias sessões; com a retomada automática acima isso
// deixou de ser problema — voltar a dropar dentro da janela continua a MESMA sessão.
export function checkAutoEndSession() {
  if (!AppState.autoSessionEnabled) return;
  if (!AppState.activeDgSession) return;

  const summary = getActiveSessionSummary();
  // Sem nenhum drop ainda: mede a inatividade desde a abertura, senão uma sessão aberta por
  // engano (ou um auto-start que não vingou) ficaria aberta pra sempre.
  const referencia = summary?.lastDropAt || AppState.activeDgSession.startAt;
  const limite = idleCloseMs();
  if (Date.now() - referencia < limite) return;

  const nome = AppState.activeDgSession.dungeonName;
  const total = summary?.totalAlz || 0;

  // Nunca ganhou DG e mal dropou: era drop perdido, não farme. Descarta em vez de sujar o
  // histórico com uma linha "sem DG" de 1 drop. Nada se perde — os drops seguem no log e
  // reaparecem no painel de farme sem DG, em Sessões.
  if (!AppState.activeDgSession.dungeonId && (summary?.dropCount || 0) < MIN_DROPS_TO_KEEP_UNASSIGNED) {
    discardActiveDgSession({ silent: true });
    return;
  }

  endDgSession({ endAt: referencia });

  // Vai pro Telegram também: "parou de dropar" quase sempre significa que o helper travou, você
  // morreu ou a run acabou sem você perceber — e é a hora em que saber rápido vale mais, porque
  // cada minuto parado é entrada do dia que não vai ser usada. Na tela, você já não está olhando.
  relaySessionToTelegram(
    `⏹️ Sessão encerrada — ${nome || 'sem DG'}\n`
    + `Ficou ${formatMinutos(limite)} sem drop nenhum.\n`
    + `Farmado na sessão: ${formatAlzGamer(total)}${summary?.dropCount ? ` em ${summary.dropCount} drops` : ''}.\n`
    + 'Se você não parou de propósito, provavelmente travou.'
  );

  showGoalToast(
    '⏹️ Sessão encerrada sozinha',
    `${nome || 'Sessão sem DG'} ficou ${formatMinutos(limite)} sem drop, então encerrei no horário do último — o tempo parado não entrou na conta.${nome ? '' : ' Ela está no histórico esperando você dizer qual DG era.'} Se os drops voltarem logo, eu retomo esta mesma sessão. Total: ${formatAlzGamer(total)}.`
  );
}
