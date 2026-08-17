import { todayISODate } from '../utils/parsing.js';

// Lista oficial de DGs de rush usada pelo jogador (importada do painel de referência em 2026-07-08).
// alzCost = Alz por run, ticketsPerRun = tickets consumidos por run, gemsPerRun = gemas de entrada
// consumidas por run (cobradas ao custo por gema atual, getCostPerGem() em rush-cart.js) — distinto
// das gemas de reset, que são opcionais e configuradas por item ao adicionar ao carrinho.
export const DEFAULT_DUNGEONS = [
  { id: 'd1', name: 'Parte do Mapa', alzCost: 31000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd2', name: 'Estação Ruína', alzCost: 31000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd3', name: 'Selo da Escuridão', alzCost: 500000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd4', name: 'Dragona dos Mortos 1SS', alzCost: 31000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd5', name: 'Dragona dos Mortos 2SS', alzCost: 500000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd6', name: 'Templo Esquecido 1SS', alzCost: 500000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd7', name: 'Ilha Proibida', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd8', name: 'Siena 1SS', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd9', name: 'C1', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd10', name: 'DX Premium da Terra', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 15 },
  { id: 'd11', name: 'DX Premium do Fogo', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 15 },
  { id: 'd12', name: 'DX Premium do Gelo', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 15 },
  { id: 'd13', name: 'DX Premium do Ar', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 15 },
  { id: 'd14', name: 'DX da Terra (Desperto)', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd15', name: 'DX do Fogo (Desperto)', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd16', name: 'DX do Gelo (Desperto)', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd17', name: 'DX do Ar (Desperto)', alzCost: 500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd18', name: 'Pandemônio', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd19', name: 'Moinho Sagrado', alzCost: 1500000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd20', name: 'Templo Esquecido 2SS', alzCost: 0, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd21', name: 'Siena 2SS', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd22', name: 'Posto das Máquinas', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd23', name: 'Torre dos Mortos 3SS', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd24', name: 'Templo Esquecido 2SS (Desperto)', alzCost: 2000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd25', name: 'Vale Tempestuoso (Desperto)', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd26', name: 'Torre dos Mortos 3SS (Parte 2)', alzCost: 1500000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd27', name: 'C1D', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd28', name: 'C2D', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd29', name: 'Crista Ilusória', alzCost: 2000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd30', name: 'Arena Acheron', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd31', name: 'Torre Diabólica', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd32', name: 'Torre Diabólica (Parte 2)', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd33', name: 'Keldrasil Sagrado', alzCost: 2000000, ticketsPerRun: 0, gemsPerRun: 0 },
  { id: 'd34', name: 'C2', alzCost: 1000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd35', name: 'Cidade Abandonada', alzCost: 2000000, ticketsPerRun: 1, gemsPerRun: 0 },
  { id: 'd36', name: 'Templo Esquecido 3SS', alzCost: 3000000, ticketsPerRun: 3, gemsPerRun: 0 },
  { id: 'd37', name: 'Ilha da Miragem', alzCost: 2000000, ticketsPerRun: 3, gemsPerRun: 0 },
  { id: 'd38', name: 'Solo Flamejante', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd39', name: 'Tumba Ancestral', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd40', name: 'Desfiladeiro Congelado', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd41', name: 'Terminus Machina', alzCost: 1000000, ticketsPerRun: 2, gemsPerRun: 0 },
  { id: 'd42', name: 'Celestia', alzCost: 3000000, ticketsPerRun: 3, gemsPerRun: 0 },
];

const DEFAULT_TRACKED_KEYWORD_WORDS = ['Fatal', 'Chocante', 'Dragona', 'Anel', 'Brinco', 'Amuleto', 'Extensor', 'Nucleo', 'Set'];

function buildDefaultTrackedKeywords() {
  return DEFAULT_TRACKED_KEYWORD_WORDS.map(word => ({ word, alertEnabled: false }));
}

export const DEFAULT_ALERT_SETTINGS = {
  enabled: true,
  soundEnabled: true,
  repeatSoundWhileOpen: false,
  volume: 0.7,
  popupDurationSeconds: 5,
  groupingWindowSeconds: 30,
  noDropThresholdMinutes: 1,
  itemSilenceThresholdMinutes: 60,
  // Desligado por padrão de propósito: o watchdog (sem drop nenhum / item sumiu) só deveria
  // rodar quando o usuário está de fato usando um helper/macro — farmar manual tem pausas
  // normais (navegar menu, andar, lutar mob mais forte) que não são "helper travado".
  watchdogEnabled: false,
  // Ligados por padrão — preferência pessoal pra receber (ou não) o pop-up/som de TG e World
  // Boss; o horário em si continua só do admin (ver event-schedule.js).
  tgNotificationsEnabled: true,
  worldbossNotificationsEnabled: true,
  // Canal que entrega TG/World Boss com o navegador fechado (ver cron-check-events.php) —
  // desligado por padrão, exige vincular o Telegram.
  telegramChatId: null,
  // Envia o drop rastreado pro Telegram na hora que cai (só com o FarmHub aberto — quem detecta
  // o drop é a aba lendo o log, ver telegram-relay-drop.php). Opt-in, desligado por padrão.
  telegramDropRelayEnabled: false,
  // Manda o alerta do watchdog (helper travado / item sumiu) pro Telegram — pra saber que travou
  // mesmo longe do PC. Opt-in, desligado. Só com o FarmHub aberto (quem detecta é a aba).
  telegramWatchdogRelayEnabled: false,
  // Avisos da rotina de farme (DG completou as runs do dia, sessão encerrada por falta de drop).
  // Opt-in, desligado. Separado do watchdog: aquilo é alerta de problema, isto é acompanhamento.
  telegramSessionRelayEnabled: false,
};

// Créditos de macro: dá 1h de uso de macro cada, usável em qualquer DG (não é por-DG como
// tickets/gemas). Custo de cada unidade tem duas partes bem diferentes:
// - Fixa (Alz + tickets) — regra do jogo, só muda se a equipe do servidor decidir. Não é algo
//   que o jogador digita: é constante (ver CREDIT_TIER_COSTS).
// - Variável — 1 unidade de um item específico por categoria, comprado em Alz, com preço que
//   muda todo dia (mercado dos jogadores). Esse sim precisa de dado fresco — mas se o item
//   estiver vinculado (rushCreditItemNames) E já tiver preço cadastrado em Cálculo de farme,
//   o preço é puxado sozinho em vez de digitado nesta tela (ver getCreditItemPrice em rush-cart).
export const CREDIT_CATEGORIES = [
  { id: 'iniciante', name: 'Iniciante' },
  { id: 'intermediario', name: 'Intermediário' },
  { id: 'avancado', name: 'Avançado' },
];

export const CREDIT_TIER_COSTS = {
  iniciante: { fixedAlz: 3000000, fixedTickets: 3 },
  intermediario: { fixedAlz: 5000000, fixedTickets: 5 },
  avancado: { fixedAlz: 10000000, fixedTickets: 10 },
};

// Limite de compra por categoria, por dia — igual pras 3 faixas.
export const CREDIT_DAILY_LIMIT = 8;

export function buildDefaultRushCredits() {
  const credits = {};
  CREDIT_CATEGORIES.forEach(cat => (credits[cat.id] = { quantity: 0, marketPrice: 0 }));
  return credits;
}

export const AppState = {
  drops: [],
  manualDrops: [],
  isManualDropsOpen: false,
  // "Qual DG rende mais" na Visão geral — recolhido por padrão: é tabela longa e a página já é
  // a mais densa do app. Não persiste; começar fechado a cada visita é o certo.
  isDgComparisonOpen: false,
  itemPrices: {},
  editingItemPriceName: null,
  // UI da tabela "Itens cadastrados" em Cálculo de farme — busca e ordenação. Não persiste (mesmo
  // espírito de priceHistoryItem/dateFrom): é um jeito de olhar a mesma lista, não um dado em si.
  pricingSearchQuery: '',
  pricingSortBy: 'name', // 'name' | 'price' | 'updated'
  pricingSortDir: 'asc',
  // "Itens sem preço" no topo da página só mostra os primeiros 6 por padrão (a lista pode ter
  // dezenas) — esse botão expande pra ver todos. Também não persiste.
  pricingShowAllMissing: false,
  // Registro de vendas reais: [{ id, itemName, qty, unitPrice, date }] — guardado em app_settings.
  salesLog: [],
  // Histórico de preço por item: { item: [{ date, price }] } — 1 ponto por dia, atualizado quando
  // o preço muda (ver recordPriceChange em sales.js). Também em app_settings, sem migração.
  priceHistory: {},
  priceHistoryItem: '',
  // Id da venda sendo editada no formulário de Vendas (null = formulário em modo "nova venda").
  // Só UI, não persiste.
  editingSaleId: null,
  // Filtro De/Até de Vendas — comanda os totais e a lista, igual ao filtro da Visão geral. Não
  // persiste (sempre abre sem filtro). Cofres e Histórico de preço ignoram de propósito: cofre é
  // sobre acumulado desde a criação, histórico de preço é sobre tendência de sempre.
  salesDateFrom: '',
  salesDateTo: '',
  // Baixa manual do radar "Possível estoque não vendido" (ver computeLikelyUnsoldInventory em
  // sales.js): { [itemName]: { qty, reason: 'vendido'|'colecao'|'craft', date } }. `qty` é o total
  // já "resolvido" até a última baixa — some do que aparece como não vendido; se cair mais desse
  // item depois, só o excedente NOVO volta a aparecer. Guardado por nome (mesma chave sem +N que
  // o resto do módulo de vendas), em app_settings.
  unsoldInventoryDismissals: {},
  // Teto mensal de gasto em rush. Existe líquido do dia e retorno por bloco, mas nada acumulado —
  // e é justamente num mês ruim que o gasto tende a subir (tentar compensar rushando mais). 0 =
  // sem teto. Ver rushSpentThisMonth em rush-page.js.
  rushMonthlyBudgetAlz: 0,
  rushHistory: {},
  // Rotas de DGs reutilizáveis (molde de rush, sem data fixa) — [{id, name, items: [{dungeonId,
  // repetitions}]}]. Ver rush-routes.js.
  rushRoutes: [],
  // Calculadora "quanto tempo eu tenho hoje" em Sessões de farme — puramente client-side, não
  // persiste (mesmo espírito de dropSourceTargetQty).
  timeAvailableHours: '',
  // Rotas aplicadas hoje no carrinho (ver applyRushRoute) — pode ter mais de uma, já que aplicar
  // SOMA ao carrinho em vez de substituir (pra dar pra combinar duas rotas no mesmo dia). Sessão
  // iniciada numa DG que faz parte de alguma delas herda o rótulo da rota, pra distinguir farme
  // "de rota" de farme avulso no histórico. Persiste (ver saveAppliedRoutes) pra sobreviver a um
  // F5 no meio do dia.
  appliedRouteIds: [],
  // Rota carregada no carrinho pra EDIÇÃO (ver startEditingRushRoute) — enquanto setado, salvar
  // sobrescreve essa rota em vez de criar uma nova.
  editingRouteId: null,
  trackedKeywords: buildDefaultTrackedKeywords(),
  filterByTrackedKeywords: false,
  currentPage: 'overview',
  // Piso padrão do filtro "De" da Visão geral. Antes era uma data fixa em código ('2026-07-25' —
  // o dia em que o dono do app passou a gerar sessão diária; antes disso era teste). Decisão
  // pessoal de UM usuário embutida em código que roda pra todos: qualquer outra conta com
  // histórico mais antigo abria com parte do próprio farme escondida, sem explicação. Agora vem
  // de defaultDateFrom (por conta, ver persistence.js); vazio = sem piso, mostra tudo.
  dateFrom: '',
  // Valor salvo do piso acima — o jogador define uma vez no filtro da Visão geral.
  defaultDateFrom: '',
  // 'painel' (padrão) ou 'completo'. A Visão geral acumulou 13 cartões, e o jogador abre ela pra
  // ver UM número. Nenhum cartão é supérfluo isoladamente — o errado é todos serem igualmente
  // proeminentes o tempo todo. "Painel" mostra só o que responde "como estou agora"; "completo"
  // abre a análise. Nada é removido, muda só o que aparece primeiro. Persiste por conta.
  overviewMode: 'painel',
  dateTo: '',
  // Busca da página "Onde dropa" — ver drop-source.js.
  dropSourceQuery: '',
  // Qual grupo ("armadura"/"arma") e qual classe estão abertos na tabela "O que uma DG dropa".
  // Só de tela, não persiste — o certo é começar tudo recolhido a cada visita.
  dropSourceGearOpen: null,
  dropSourceGearClass: null,
  // Lista do catálogo de identificadores: aberta/fechada e o filtro de busca. Só UI, não persiste
  // — são centenas de nomes, e o certo é começar recolhida.
  isCatalogListOpen: false,
  dropSourceCatalogQuery: '',
  dropSourceTargetQty: '',
  // Direção oposta da busca acima ("o que essa DG dropa", não "onde esse item dropa") — mesma
  // página, ferramenta independente. Não persiste, mesmo espírito das outras duas acima.
  dropSourceDungeonId: '',
  // Duas DGs escolhidas pra comparação lado a lado ("qual dessas duas eu rodo hoje") — o ranking
  // sozinho responde "qual é a melhor de todas", que não é como a escolha acontece na prática.
  dropSourceCompareA: '',
  dropSourceCompareB: '',
  // DG escolhida em "Onde dropa" (botão "Ir farmar aqui") pra pré-selecionar no formulário de
  // iniciar sessão em Sessões de farme — fecha o ciclo "achei onde farmar" → "vou farmar lá" sem
  // precisar procurar a mesma DG de novo num seletor com dezenas de opções. Consumido uma vez (o
  // botão "Iniciar" limpa depois de usar) — não persiste.
  pendingSessionDungeonId: '',
  // Histórico permanente de drops, agregado por dia+item ([{date, name, qty}]) — o log do jogo
  // só guarda ~30 dias, então sem isso todo farme mais antigo sumia. Ver drop-history.js.
  dropSnapshot: [],
  // Abrir sessão sozinho quando drops começam a cair sem nenhuma marcada. Ligado por padrão:
  // esquecer de marcar é a maior fonte de buraco no histórico. Ver session-autostart.js.
  autoSessionEnabled: true,
  // Lixeira de sessões excluídas. O desfazer do toast dura segundos — pouco pra um registro que é
  // farme de verdade, e que some pra sempre se você piscar. Aqui as últimas ficam guardadas até
  // você decidir. Cap em DELETED_SESSIONS_LIMIT (ver dg-session.js) porque é rede de segurança
  // pra arrependimento recente, não um segundo histórico.
  deletedSessions: [],
  // Fim da sessão mais recente que você EXCLUIU. Serve de piso pra "drops sem sessão" (ver
  // unclaimedDropsSince): apagar uma sessão devolvia os drops dela pro limbo, e a próxima sessão
  // iniciada os varria de volta — não havia como descartar um trecho ruim de farme de verdade.
  // Minutos sem nenhum drop até a sessão encerrar sozinha. Configurável (não mais fixo em código)
  // porque o número certo depende de como VOCÊ farma: quem rusha com macro sem parar quer curto;
  // quem alterna DG, vende no meio e volta quer folgado. Ver session-autostart.js — encerrar curto
  // é seguro porque a sessão é RETOMADA se os drops voltarem logo, em vez de virar duas.
  sessionIdleCloseMinutes: 5,
  // "Considero raro o que cai em até X% das runs" — mesma unidade que a taxa por run exibida em
  // Onde dropa, pra as duas telas falarem a mesma língua. Ajustável porque o que é raro depende
  // da economia do servidor. Ver item-dungeon-sources.js (DEFAULT_RARITY_MAX_PERCENT).
  rarityMaxPercent: 2,
  // Itens que você marcou como "não é raro pra mim", mesmo o histórico dizendo que são. Vale por
  // cima da detecção automática. Ver item-dungeon-sources.js.
  rarityDismissed: [],
  // O outro lado da mesma decisão: itens que você confirmou serem raros. Existe pra a triagem
  // parar de perguntar depois de decidida — só o descarte esvaziava a fila antes.
  rarityConfirmed: [],
  // Lista de decisões de raridade aberta/fechada. Só UI, não persiste — começar fechada é o
  // certo: são dezenas de nomes que quase nunca se consulta.
  isRarityDecisionsOpen: false,
  // Período do card "Sua evolução" (7 ou 30 dias). Só UI, não persiste — volta pro mês ao
  // recarregar, que é a visão mais útil no dia a dia.
  trendPeriodDays: 30,
  // Bruto (valor dos drops) ou líquido (drops − gasto em rush) no card "Sua evolução". Só UI,
  // mesmo motivo do trendPeriodDays acima.
  trendShowNet: false,
  // Janela do card "Sua consistência" (7 ou 30 dias). Só UI, mesmo motivo do trendPeriodDays.
  consistencyPeriodDays: 30,
  // Evento temporário do servidor: item que vale quantidade diferente por DG. Fica isolado num
  // painel próprio pra não contaminar os números permanentes. Ver event-tracker.js.
  eventConfig: { enabled: false, itemName: '', since: '', multipliers: {} },
  liveFileHandle: null,
  liveFilePollWorker: null,
  lastReadFileSize: 0,
  pendingLineBuffer: '',
  rushCartDate: todayISODate(),
  rushTicketPrice: '',
  // Receita de fabricação do ticket, pra quem faz os próprios em vez de comprar. Guarda a RECEITA
  // (item, quanto consome, quantos tickets sai), nunca o preço: o custo do ticket é recalculado a
  // partir do preço atual do item em Cálculo de farme, então acompanha o mercado sozinho.
  ticketCraft: { itemName: '', itemQty: 0, ticketsProduced: 0, enabled: true },
  rushCardCashPrice: '',
  rushCart: [],
  rushCredits: buildDefaultRushCredits(),
  // Nome do item vinculado a cada categoria, pra puxar o preço sozinho de Cálculo de farme em
  // vez de digitar todo dia (vazio = ainda não configurado, cai no preço manual de rushCredits).
  rushCreditItemNames: { iniciante: '', intermediario: '', avancado: '' },
  isCreditsManagerOpen: false,
  dungeonList: DEFAULT_DUNGEONS.map(dg => ({ ...dg })),
  isDungeonManagerOpen: false,
  editingDungeonId: null,
  alertSettings: { ...DEFAULT_ALERT_SETTINGS },
  alertHistory: [],
  alertHistoryFilter: '',
  pendingAlertGroups: {},
  // Relógios do alerta de inatividade (watchdog) — resetados a cada (re)conexão do arquivo
  // ao vivo, ver startLiveFilePolling() em file-source.js.
  lastAnyDropAt: null,
  // Quando o alerta de "sem nenhum drop" foi disparado pela última vez — null = não disparado
  // nesse período de silêncio. Guarda o timestamp (não um booleano) pra dar pra repetir o aviso
  // a cada X min enquanto o helper continuar travado, em vez de avisar uma vez só.
  lastNoDropAlertAt: null,
  lastSeenByKeyword: {},
  staleKeywordAlerted: {},
  isAdmin: false,
  isMasterAdmin: false,
  currentUsername: '',
  currentUserId: null,
  // Categorias GLOBAIS (do admin mestre) — base comum pra todo mundo.
  itemCategories: [],
  itemCategoryAssignments: {},
  // Categorias PESSOAIS, só suas — valem por cima da global (ver getItemCategory em drops.js).
  // Categorizar é preferência de organização de cada jogador; depender do admin pra separar
  // "meus insumos de craft" tornava o Relatório inútil pra quem não é o admin.
  personalCategories: [],
  personalCategoryAssignments: {},
  // Cadastro manual "em quais DGs este item pode cair" (item → [dungeonId, ...]), curado —
  // diferente de dgSessions/Onde Dropa, que é estatístico. Usado pra destacar em Sessões de
  // farme os itens esperados da DG.
  itemDungeonSources: {},
  // Atalho no Relatório pra gerenciar categoria sem sair da página (mesma lista global do
  // Admin) — colapsado por padrão.
  isCategoryManagerOpen: false,
  isPersonalCategoryManagerOpen: false,
  // Busca na tabela de "atribuir categoria aos itens já cadastrados" — pode ter dezenas de linhas,
  // uma por item conhecido. Não persiste (mesmo espírito de pricingSearchQuery).
  categoryAssignSearchQuery: '',
  // Modo guiado (assistente passo a passo). action: null|'venda'|'meta'|'sessao'; step: número do
  // passo ou 'done'/'done-start'/'done-end'; data: campos coletados no caminho; error: aviso inline.
  quickMode: { action: null, step: 0, data: {}, error: '' },
  // Vira true só quando o estado do usuário terminou de carregar do servidor. Enquanto false,
  // nenhum save é enviado — rede de segurança pra não sobrescrever dado bom com o default vazio
  // caso o carregamento falhe.
  persistedStateLoaded: false,
  eventSchedule: { tg: [], worldboss: [] },
  alertSounds: {},
  knownItemNames: [],
  // Preço de referência da comunidade por item: { nome: { price, accounts } } — mediana do que
  // todas as contas cadastraram (ver api/reference-prices.php). Só leitura: serve de PADRÃO pra
  // quem ainda não cadastrou o item. Editar o preço grava em itemPrices (seu), nunca aqui —
  // ninguém muda o número que os outros veem. Ver getItemPrice em drops.js.
  referenceItemPrices: {},
  telegramLinkCode: null,
  telegramBotLink: null,
  // Meta de farme do dia (Alz), guardada em app_settings. 0 = sem meta definida. Ver farm-goal.js.
  dailyGoalAlz: 0,
  // Data em que a meta de hoje já foi comemorada (in-memory) — evita repetir o parabéns a cada
  // drop depois de bater, e evita comemorar de novo ao recarregar com a meta já batida.
  goalCelebratedForDate: null,
  // Metas de semana/mês (Alz), mesmo conceito da diária mas sobre o período calendário em curso —
  // exibidas dentro do card "Sua evolução". Sempre bruto, igual a meta diária. Ver farm-goal.js.
  weeklyGoalAlz: 0,
  monthlyGoalAlz: 0,
  // Cofres de Alz em Vendas (nome na UI; campo interno segue "salesGoals") — "envelopes" com %
  // fixa do que você vende: toda venda registrada DEPOIS que o cofre foi criado contribui esse %
  // pro total acumulado dele. Vários cofres podem coexistir (a soma das % não precisa fechar
  // 100 — o resto fica livre, sem cofre nenhum). Renomeado de "Meta de Alz" pra não confundir
  // com a Meta de farme do dia (pools diferentes: uma é farmado, esta é vendido de fato).
  // [{id, name, targetAlz, percentage, createdAt}]. Ver sales-goals.js.
  salesGoals: [],
  // Metas de ITEM ("preciso de 300 Núcleos") — [{id, itemName, targetQty, createdAt, sinceDate}].
  // Ver item-goals.js: conta drops a partir da criação, igual aos Cofres de Alz.
  itemGoals: [],
  // Sessão de DG em andamento (opcional): { dungeonId, dungeonName, startAt }. Os drops do log
  // que caem na janela [startAt, agora] são atribuídos a esse DG. Persistida em app_settings pra
  // sobreviver a um reload. null = não está marcando DG (farme normal). Ver dg-session.js.
  activeDgSession: null,
  // Histórico de sessões de DG já encerradas (também em app_settings, sem tabela nova).
  dgSessions: [],
  // Qual dia o histórico de sessões (Sessões de farme) está mostrando — só UI, não persiste,
  // sempre volta pra hoje ao recarregar. Ver setSessionsHistoryDate em sessions-page.js.
  sessionsHistoryDate: todayISODate(),
  // Quais sessões do histórico estão com a lista de itens expandida (só UI, não persiste).
  expandedDgSessions: {},
  // Quais rotas (Planejamento de Rush) estão com a lista de DGs expandida — cada rota fecha/abre
  // por conta própria, sem afetar as outras. Só UI, não persiste.
  expandedRushRoutes: {},
  // Quais textos explicativos de card ("Como funciona") estão abertos — em qualquer página, não
  // só Sessões. Só UI, não persiste (volta tudo fechado ao recarregar). Ver ui-toggles.js.
  openInfoBoxes: {},
  // Quais cards colapsáveis estão abertos (Raridades, Evento, Recorde). Só UI, não persiste —
  // volta fechado ao recarregar, que é o estado que mantém a página curta. Ver ui-toggles.js.
  openCards: {},
  // Painel de "recuperar sessão esquecida" (Sessões de farme) aberto ou não — só UI, não persiste.
  forgottenSessionRecoveryOpen: false,
  // Rascunho da divisão de uma sessão que virou duas DGs (encadeou sem encerrar no meio):
  // { startAt, splitAt, firstDgId, secondDgId }. Só UI, não persiste — nada muda no histórico até
  // você confirmar. Ver splitSession em dg-session.js.
  sessionSplitDraft: null,
  // Parâmetros do cálculo "vale a pena resetar?" (guardados em app_settings): só o custo do reset
  // em si (gemas) e quantas runs cada reset devolve. Valor da gema/ticket em Alz NÃO mora aqui —
  // vem de rushCardCashPrice/rushTicketPrice (Parâmetros do dia), a mesma fonte que o carrinho de
  // rush usa de verdade. Antes existia um segundo par de campos aqui (gemValueAlz/ticketValueAlz)
  // que duplicava isso e podia divergir do que o carrinho realmente cobrava pela mesma DG.
  resetConfig: { resetCostGems: 500, runsPerReset: 1 },
  // Bruto ou líquido (desconta custo de entrada) na tabela "Qual DG rende mais". Só UI, não
  // persiste — mesmo motivo do trendShowNet da Visão geral.
  dgComparisonShowNet: false,
  // Janela de "Qual DG rende mais": null/0 = histórico inteiro (padrão), 30 = só os últimos 30
  // dias. Só UI, não persiste. O histórico completo nunca é purgado (de propósito), então sem
  // essa janela uma DG que rendia bem há meses continua no topo mesmo que o mercado já tenha
  // mudado — este toggle deixa o ranking reagir sem esperar a média de longo prazo se mover.
  dgComparisonPeriodDays: 0,
};

export function resetTrackedKeywordsToDefault() {
  AppState.trackedKeywords = buildDefaultTrackedKeywords();
}
