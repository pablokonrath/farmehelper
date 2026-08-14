import { AppState } from '../state/app-state.js';
import { computeDgComparison, computeRunsDoneToday, DAILY_RUN_LIMIT } from './dg-session.js';
import { getCostPerGem, getTicketPrice, getTicketCraftCost } from './rush-cart.js';
import { showInfoToast } from './alerts.js';

// Exporta o seu histórico num texto que dá pra colar numa IA e pedir montagem de rota.
//
// Por que isso existe, se o app já sugere rota por tempo (suggestRouteForTime): a sugestão de
// dentro resolve UM cenário por vez, com um critério fixo. A IA não é melhor na conta — a conta
// daqui é feita sobre os seus números reais e a dela seria chute — mas ela compara vários
// cenários de uma vez, entende restrição que não tem campo na tela ("hoje quero priorizar
// tickets", "só tenho 40min e amanhã 3h") e explica o porquê da escolha.
//
// O perigo do uso é a IA inventar DG, taxa ou custo que não existem, e apresentar com a mesma
// confiança do resto. Todo o formato abaixo é desenhado contra isso: unidades explícitas em toda
// linha, tamanho de amostra ao lado de cada média, o que é regra do jogo separado do que é medição
// sua, e uma instrução no fim proibindo usar qualquer número que não esteja no texto.

// Nº grande legível pra IA: sem separador de milhar (que ela pode ler como decimal) e sem "kk".
const num = v => Math.round(v || 0).toString();

function linhaDaDg(c, dungeon) {
  const partes = [
    `- ${c.dungeonName}`,
    `  Alz por run (bruto): ${num(c.alzPerRun)}`,
    `  Alz por run (líquido, já descontando o custo de entrada): ${num(c.netAlzPerRun)}`,
    `  Tempo por run: ${c.msPerRun ? (c.msPerRun / 60000).toFixed(1) : '?'} min`,
    `  Custo por entrada: ${num(dungeon?.alzCost)} Alz + ${dungeon?.ticketsPerRun || 0} ticket(s) + ${dungeon?.gemsPerRun || 0} gema(s)`,
    `  Baseado em: ${c.runs} run(s) registradas em ${c.sessions} sessão(ões)`,
  ];
  // Amostra pequena vira aviso explícito. Sem isso a IA trata "2 runs" com o mesmo peso de "300",
  // e recomenda com convicção uma DG que você farmou duas vezes.
  if (c.runs < 20) partes.push(`  ATENÇÃO: amostra pequena, esses números ainda podem mudar bastante`);
  if (c.cooling) {
    partes.push(`  ATENÇÃO: rendendo menos que a média ultimamente (${num(c.recentAlzPerRun)} Alz/run nas últimas sessões)`
      + (c.coolingCause?.tipo === 'volume' ? ' — está dropando menos itens por run' : c.coolingCause?.tipo === 'composicao' ? ' — dropa a mesma quantidade, mas de itens mais baratos' : ''));
  }
  const feitasHoje = computeRunsDoneToday(c.dungeonName);
  partes.push(`  Runs feitas hoje: ${feitasHoje} de ${DAILY_RUN_LIMIT} (restam ${Math.max(0, DAILY_RUN_LIMIT - feitasHoje)})`);
  return partes.join('\n');
}

export function buildAiRouteBriefing() {
  const comparacao = computeDgComparison().filter(c => c.alzPerRun != null && c.msPerRun != null);
  const custoGema = getCostPerGem();
  const precoTicket = getTicketPrice();

  const blocos = [];

  blocos.push(
    'Sou jogador de Cabal Online e quero montar rotas de farme ("rush") aproveitando melhor meu tempo.',
    'Abaixo estão os dados REAIS do meu histórico, exportados do meu app de controle de farme.',
    '',
    '## Como o jogo funciona (regras fixas, não são medições minhas)',
    `- "Run" = uma entrada na masmorra (DG). Cada DG tem limite de ${DAILY_RUN_LIMIT} runs por dia.`,
    '- Cada entrada custa Alz, e algumas custam também tickets e/ou gemas.',
    '- Dá pra resetar o limite diário gastando gemas, mas só compensa se o líquido por run cobrir o custo do reset.',
    '- Alz é a moeda do jogo.',
    '',
    '## Meus preços de hoje',
    `- Custo por gema: ${num(custoGema)} Alz`,
    `- Preço do ticket: ${precoTicket > 0 ? num(precoTicket) + ' Alz' + (getTicketCraftCost() ? ' (eu FABRICO meus tickets — esse e o custo de fabricacao, nao o preco de mercado)' : '') : 'não informado'}`,
    '',
    '## Minhas DGs, medidas pelo meu próprio histórico',
    'Todos os valores por run são MÉDIAS do que eu de fato farmei, não valores oficiais do jogo.',
    'O Alz é calculado com os preços de venda que eu mesmo cadastrei.',
    '',
  );

  if (!comparacao.length) {
    blocos.push('(Ainda não tenho sessão registrada com runs preenchidas — sem dado pra comparar.)');
  } else {
    comparacao.forEach(c => {
      blocos.push(linhaDaDg(c, AppState.dungeonList.find(d => d.id === c.dungeonId)));
      blocos.push('');
    });
  }

  // Rotas já montadas: sem isso a IA propõe do zero o que já existe, e você não consegue comparar
  // a sugestão dela com o que já vinha fazendo.
  if (AppState.rushRoutes.length) {
    blocos.push('## Rotas que eu já tenho montadas');
    AppState.rushRoutes.forEach(r => {
      const itens = r.items
        .map(it => {
          const dg = AppState.dungeonList.find(d => d.id === it.dungeonId);
          return dg ? `${dg.name} x${it.repetitions}` : null;
        })
        .filter(Boolean);
      blocos.push(`- ${r.name}: ${itens.join(', ') || '(vazia)'}`);
    });
    blocos.push('');
  }

  blocos.push(
    '## O que eu quero de você',
    'Monte rotas de farme para diferentes tempos disponíveis: 30 minutos, 1 hora, 2 horas, 3 horas e 4 horas.',
    '',
    'Para cada rota, me diga:',
    '- Quais DGs entrar e quantas runs de cada',
    '- Quanto tempo a rota leva no total',
    '- Quanto Alz líquido devo esperar (e deixe claro que é média, não garantia)',
    '- Quantos tickets e gemas ela consome',
    '- Por que essa ordem, em uma linha',
    '',
    'Regras importantes:',
    `- Respeite o limite de ${DAILY_RUN_LIMIT} runs por dia por DG, descontando as que eu já fiz hoje.`,
    '- Use SOMENTE as DGs e os números que estão neste texto. Não invente DG, taxa de drop, custo ou preço.',
    '- Se algum dado que você precisaria não está aqui, diga o que falta em vez de estimar.',
    '- Dê mais peso ao Alz líquido por run do que ao bruto: é o que sobra depois do custo de entrada.',
    '- Trate com desconfiança as DGs marcadas com ATENÇÃO e me avise quando uma recomendação depender delas.',
  );

  return blocos.join('\n');
}

export function copyAiRouteBriefing() {
  const texto = buildAiRouteBriefing();
  navigator.clipboard?.writeText(texto)
    .then(() => showInfoToast('Relatório copiado — cole numa IA e peça as rotas'))
    .catch(() => showInfoToast('Não consegui copiar — seu navegador bloqueou'));
}
