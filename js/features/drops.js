import { AppState } from '../state/app-state.js';
import { stripEnhancementSuffix, normalizeForSearch, todayISODate } from '../utils/parsing.js';
import { formatNumber, formatAlzGamer, getAlzTierColor } from '../utils/formatting.js';

// Preço de um item, em duas camadas — o SEU vale por cima do da comunidade.
//
// A camada de referência (mediana do que todas as contas cadastraram, ver api/reference-prices.php)
// existe porque conta nova começava do zero: o app contava os drops mas não sabia quanto valiam,
// então tudo aparecia como 0 até a pessoa cadastrar item por item. Agora ela já entra com valor
// utilizável no que a comunidade conhece e só ajusta o que discordar.
//
// Editar um preço grava sempre em itemPrices (seu) — a referência é imutável pelo app. Ninguém
// muda o número que os outros veem.
export function getItemPrice(itemName) {
  const base = stripEnhancementSuffix(itemName);
  return AppState.itemPrices[itemName]
    ?? AppState.itemPrices[base]
    ?? getReferencePrice(itemName)
    ?? 0;
}

// Quanto o item valia NUMA DATA, pelo histórico de preços (recordPriceChange grava 1 ponto por
// dia sempre que você muda um preço — é uma função degrau, exatamente o que se precisa aqui).
//
// Existe porque o app tinha uma inconsistência de contabilidade: o "líquido do dia" subtraía um
// custo HISTÓRICO (o rush salvo daquele dia, congelado) de uma receita reavaliada aos preços de
// HOJE. Se um item dobrou de preço, o líquido de um dia antigo subia sozinho, sem o custo daquele
// dia mexer — o dia passava a parecer melhor do que foi, e o total do mês herdava isso.
//
// Devolve { price, exact }. exact=false quando não há ponto histórico até aquela data (item
// precificado depois, ou antes do histórico existir): aí cai no preço atual, mas AVISADO — número
// estimado apresentado como fato é pior que número faltando.
export function getItemPriceOn(itemName, dateISO) {
  const base = stripEnhancementSuffix(itemName);
  const hist = AppState.priceHistory?.[itemName] || AppState.priceHistory?.[base];
  if (hist?.length && dateISO) {
    let encontrado = null;
    // A lista é cronológica (recordPriceChange sempre empurra no fim) — o último ponto com data
    // menor ou igual é o preço que estava valendo naquele dia.
    for (const ponto of hist) {
      if (ponto.date <= dateISO) encontrado = ponto.price;
      else break;
    }
    if (encontrado !== null) return { price: encontrado, exact: true };
  }
  return { price: getItemPrice(itemName), exact: false };
}

export function getReferencePrice(itemName) {
  const ref = AppState.referenceItemPrices;
  return (ref[itemName] ?? ref[stripEnhancementSuffix(itemName)])?.price ?? null;
}

// Você já definiu esse preço, ou está usando o da comunidade?
export function hasPersonalPrice(itemName) {
  return AppState.itemPrices[itemName] !== undefined || AppState.itemPrices[stripEnhancementSuffix(itemName)] !== undefined;
}

// Existe um valor utilizável pra esse item — seu ou da comunidade. É o que decide se ele entra no
// aviso de "itens sem preço": item coberto pela referência não é uma pendência sua.
//
// Diferente de getItemPrice > 0: um item cadastrado como 0 de propósito (lixo que ainda cai, mas
// não vale nada) TEM preço registrado — só vale 0. getItemPrice sozinho não distingue "decidi que
// é 0" de "nunca decidi nada" (os dois retornam 0), o que fazia o aviso de "itens sem preço" (ver
// pricing-page.js) cobrar pra sempre um item que o jogador já resolveu.
export function hasRegisteredPrice(itemName) {
  return hasPersonalPrice(itemName) || getReferencePrice(itemName) != null;
}

// Categoria de um item. Duas camadas, e a PESSOAL ganha da global — mesma lógica de curadoria já
// usada em raridade (o que você marca vale por cima do que a estatística diz).
//
// A camada global é do admin mestre e serve de base comum ("Núcleos", "Joias"). A pessoal existe
// porque categorizar é preferência de organização de cada um: quem quer separar "meus insumos de
// craft" ou "guardar pro set" não deveria depender de outra pessoa pra organizar o próprio farme.
// Esse nome corresponde a algo que você realmente dropou? Cruza com o log carregado, os drops
// manuais antigos e o histórico arquivado (que guarda nome de item mais velho que a janela de ~30
// dias do log). Compara sem acento/maiúscula e sem o sufixo +N.
//
// Serve pra pegar erro de digitação no cadastro de preço — nome digitado à mão é a única fonte de
// lixo no catálogo compartilhado (ver api/reference-prices.php), e o log, escrito pelo próprio
// jogo, é a referência canônica do que existe de verdade.
export function findDroppedNameMatch(itemName) {
  const alvo = normalizeForSearch(stripEnhancementSuffix(itemName || '').trim());
  if (!alvo) return null;
  for (const nome of getDroppedItemNames()) {
    if (normalizeForSearch(nome) === alvo) return nome;
  }
  return null;
}

// Nome mais parecido entre os que você dropou — pra sugerir "quis dizer X?" em vez de só barrar.
// Heurística simples de substring (um contém o outro): pega o caso comum de letra faltando/sobrando
// e de nome parcial, sem o custo e a imprevisibilidade de distância de edição.
export function suggestDroppedName(itemName) {
  const alvo = normalizeForSearch(stripEnhancementSuffix(itemName || '').trim());
  if (alvo.length < 4) return null;
  let melhor = null;
  for (const nome of getDroppedItemNames()) {
    const n = normalizeForSearch(nome);
    if (n.includes(alvo) || alvo.includes(n)) {
      if (!melhor || Math.abs(n.length - alvo.length) < Math.abs(normalizeForSearch(melhor).length - alvo.length)) melhor = nome;
    }
  }
  return melhor;
}

// Todo nome de item que já passou pelo seu histórico — log atual + manuais + arquivo permanente.
export function getDroppedItemNames() {
  const nomes = new Set();
  for (const d of getAllDrops()) nomes.add(stripEnhancementSuffix(d.name));
  for (const r of AppState.dropSnapshot) nomes.add(stripEnhancementSuffix(r.name));
  return nomes;
}

export function getItemCategory(itemName) {
  const base = stripEnhancementSuffix(itemName);
  const pessoal = AppState.personalCategoryAssignments;
  return pessoal[itemName] ?? pessoal[base]
    ?? AppState.itemCategoryAssignments[itemName] ?? AppState.itemCategoryAssignments[base] ?? null;
}

// Todas as categorias disponíveis pra escolher: as globais mais as suas. Sem duplicar nome que
// exista nas duas listas — pro seletor não mostrar a mesma opção duas vezes.
export function getAllCategoryNames() {
  return [...new Set([...AppState.itemCategories, ...AppState.personalCategories])].sort((a, b) => a.localeCompare(b));
}

// Itens cujo valor é tabelado pelo próprio jogo (ex: joia trocável em NPC por preço fixo), não
// pelo mercado entre jogadores — diferente de todo resto do itemPrices, que é estimativa própria
// de cada um. Curado à mão (não tem como derivar isso do nome sozinho) — usado só pra SILENCIAR
// o aviso de "preço desatualizado" nesses itens (ver daysSincePriceUpdate em sales.js): o preço
// nunca muda, então "sem revisar há muito tempo" não é sinal de nada errado.
const FIXED_PRICE_ITEMS = new Set(['Joia Enfraquecida'].map(normalizeForSearch));

export function isFixedPriceItem(itemName) {
  return FIXED_PRICE_ITEMS.has(normalizeForSearch(stripEnhancementSuffix(itemName)));
}

// Item de evento fica FORA de toda conta de Alz do app.
//
// O painel de evento já era separado de propósito ("evento é temporário, nada disso contamina os
// números permanentes" — ver event-tracker.js), mas isso valia só pro painel: o item continuava
// sendo valorizado como drop comum no Alz farmado, no Alz/run e no líquido do dia.
//
// Duas razões pra excluir. Primeira: ele não é Alz — é ficha de troca, e o valor só existe quando
// você resgata a recompensa. Contar o preço dele agora e o prêmio depois seria contar duas vezes.
// Segunda: ele estraga a comparação entre DGs. DG com multiplicador de evento sobe no ranking
// enquanto o evento dura e afunda quando acaba — e como o histórico nunca é purgado, aquele pico
// fica no meio da média pra sempre.
//
// Mesmo tratamento do equipamento genérico: continua no log e nos itens da sessão (o painel de
// evento conta a partir deles), só não vale Alz.
//
// Mora aqui, e não em event-tracker.js, pra não criar ciclo de import: event-tracker depende do
// router, e o router carrega as páginas, que dependem deste módulo. A configuração é lida direto
// do AppState, que é o mesmo dado.
let eventoAlvoCache = null;
let eventoItensCache = new Map();

export function isEventItem(name) {
  const cfg = AppState.eventConfig;
  if (!cfg?.enabled || !cfg.itemName) return false;
  const alvo = normalizeForSearch(cfg.itemName);
  // Trocar o item do evento (ou desligar e ligar com outro) invalida o cache — senão o app
  // continuaria excluindo o item do evento anterior depois da configuração mudar.
  if (alvo !== eventoAlvoCache) {
    eventoAlvoCache = alvo;
    eventoItensCache = new Map();
  }
  let hit = eventoItensCache.get(name);
  if (hit === undefined) {
    // "Contém" e não igualdade, mesmo critério de computeEventProgress: o log traz variações e
    // sufixos no nome, e exigir igualdade exata faria o filtro não pegar nada, calado.
    hit = normalizeForSearch(name).includes(alvo);
    eventoItensCache.set(name, hit);
  }
  return hit;
}

// Peças de equipamento genéricas (armadura/arma básica por classe) — caem aos montes em toda
// DG, não têm valor de venda e só incham "o que caiu" em cada sessão. Excluídas de vez, não
// precisam aparecer em lugar nenhum do app (pedido explícito do jogador).
// São duas famílias com regras diferentes, e a diferença importa: em nenhum dos casos a palavra
// sozinha basta. "Cristal da Terra" e "Disco" sumiam do app inteiro só por carregarem uma palavra
// que também nomeia arma — o pior tipo de erro aqui, porque some calado e você só descobre indo
// procurar. Cada família tem um segundo sinal obrigatório.

// 1) Peça de armadura: exige a SIGLA DA CLASSE no nome ("Armadura GU").
const ARMOR_KEYWORDS = [
  'greva', 'manopla', 'armadura', 'elmo', 'punho', 'luva', 'quimono', 'traje', 'coturno',
  'sapatilha', 'sapato', 'mascara', 'visor',
].map(kw => normalizeForSearch(kw));

// A sigla é casada como PALAVRA INTEIRA, nunca como pedaço. São siglas de duas letras: procurar
// por trecho faria "ma" casar dentro de "arMAdura", "at" dentro de "chAkram" e por aí vai —
// qualquer nome viraria equipamento.
const ARMOR_CLASS_TOKENS = /(^|[^a-z0-9])(gu|ga|du|ea|gl|ma|mn|aa|at)([^a-z0-9]|$)/;

// 2) Arma: "<tipo> de <material>" ("Katana de Mithril"). Arma não traz sigla de classe — o
// próprio tipo já diz a classe —, então o sinal aqui é outro.
//
// "disco" fica de fora dos tipos: é material, não arma.
//
// A regra é ESTRUTURAL, não uma lista de materiais. Arma é "<tipo> de <material>" — e o material
// pode ser qualquer coisa: Orichalcum, SIGMetal, Mithril, Aquamarina, e o que o servidor inventar
// no próximo patch.
//
// A primeira versão listava os materiais conhecidos, e isso era jogo de gato e rato: cada material
// novo fazia todas as armas dele escaparem e virarem "raridade" da DG (o detector considera raro
// tudo que não é equipamento e cai pouco por run). Duas rodadas de correção, dois materiais
// faltando — o problema era o formato da regra, não a lista.
//
// Invertido: "<tipo> de <qualquer coisa>" É arma, EXCETO quando o que vem depois é elemento ou
// atributo. Essa lista de exceções é curta, fechada e estável — ao contrário da de materiais, que
// cresce com o jogo. E é o que protege os itens que dão nome a DG (Cristal de Fogo no Solo
// Flamejante, Cristal de Terra na Tumba), que sem ela seriam confundidos com arma.
const NOT_WEAPON_SUFFIXES = [
  'fogo', 'terra', 'gelo', 'vento', 'ar', 'agua', 'alma', 'luz', 'trevas', 'sombra',
  'sangue', 'caos', 'divino', 'sagrado', 'essencia', 'poder',
].map(kw => normalizeForSearch(kw));

// <tipo de arma> + de/do/da + <palavra>. A primeira palavra depois da preposição é o que decide.
const WEAPON_PATTERN = new RegExp(
  `(^|[^a-z0-9])(${['montante', 'espada', 'daikatana', 'katana', 'orbe', 'orb', 'cristal', 'chakram', 'chakran'].join('|')})\\s+(?:de|do|da|dos|das)\\s+([a-z0-9]+)`
);

// A que família o item pertence — e por qual "família de segundo nível" ele agrupa: sigla da
// classe pra armadura, material pra arma. Retorna null pro que não é equipamento nenhum.
export function getGearKind(name) {
  const normalized = normalizeForSearch(name);
  if (ARMOR_KEYWORDS.some(kw => normalized.includes(kw))) {
    const m = normalized.match(ARMOR_CLASS_TOKENS);
    if (m) return { familia: 'armadura', grupo: m[2].toUpperCase() };
  }
  // Arma: "<tipo> de <material>", com o material lido do próprio nome — assim material novo do
  // jogo já entra agrupado certo, sem ninguém precisar cadastrar nada.
  const m = normalized.match(WEAPON_PATTERN);
  if (m && !NOT_WEAPON_SUFFIXES.includes(m[3])) {
    return { familia: 'arma', grupo: m[3].charAt(0).toUpperCase() + m[3].slice(1) };
  }
  return null;
}

// Cache nome -> é equipamento genérico? O log tem dezenas de milhares de drops mas pouquíssimos
// nomes DISTINTOS (o mesmo item cai centenas de vezes), e essa checagem roda por drop em toda
// varredura (getAllDrops é chamado ~5x por render da Visão geral, que re-renderiza a cada lote
// de drops ao vivo). Sem cache, a normalização Unicode do mesmo nome era refeita milhares de
// vezes — medido: 15x mais lento num log de 96 mil drops.
const excludedGearCache = new Map();

export function isExcludedGearItem(name) {
  let cached = excludedGearCache.get(name);
  if (cached === undefined) {
    cached = !!getGearKind(name);
    excludedGearCache.set(name, cached);
  }
  return cached;
}

// Drops vêm do log do jogo (AppState.drops, recarregado por inteiro a cada upload/conexão
// de arquivo) + itens adicionados manualmente (AppState.manualDrops, persistidos à parte
// porque um novo upload de arquivo substitui AppState.drops inteiro). Ponto único de filtro
// de equipamento genérico — filtrar aqui já cobre todo mundo que consome getAllDrops()
// (sessões de DG, Onde dropa, Cálculo de farme, Vendas, Visão geral).
export function getAllDrops() {
  return [...AppState.drops, ...AppState.manualDrops].filter(d => !isExcludedGearItem(d.name));
}

// Aplica o filtro "Filtrar apenas itens rastreados" (Cálculo de farme) quando ativo — usado
// tanto pela lista principal de drops quanto pelo comparador de dias, pra manter os dois
// consistentes com a mesma lista de palavras rastreadas.
// Predicado por NOME (não pelo objeto de drop) — o histórico agregado (drop-history.js) guarda
// só nome+quantidade, então precisa do mesmo critério sem ter um drop inteiro em mãos.
export function matchesTrackedKeywordFilter(name) {
  if (!AppState.filterByTrackedKeywords || !AppState.trackedKeywords.length) return true;
  const normalized = normalizeForSearch(name);
  return AppState.trackedKeywords.some(kw => normalized.includes(normalizeForSearch(kw.word)));
}

export function applyTrackedKeywordFilter(drops) {
  if (!AppState.filterByTrackedKeywords || !AppState.trackedKeywords.length) return drops;
  return drops.filter(d => matchesTrackedKeywordFilter(d.name));
}

export function getFilteredDrops() {
  let drops = getAllDrops();
  if (AppState.dateFrom) drops = drops.filter(d => d.date >= AppState.dateFrom);
  if (AppState.dateTo) drops = drops.filter(d => d.date <= AppState.dateTo);
  return applyTrackedKeywordFilter(drops);
}

export function summarizeDropsByItem(drops) {
  const itemsByName = {};
  drops.forEach(drop => {
    const key = stripEnhancementSuffix(drop.name);
    const price = getItemPrice(drop.name);
    if (!itemsByName[key]) itemsByName[key] = { name: key, qty: 0, price, total: 0 };
    itemsByName[key].qty++;
    itemsByName[key].total += price;
  });
  return Object.values(itemsByName).sort((a, b) => b.total - a.total);
}

// Valor total farmado HOJE (drops do log + manuais), a mesma base do "Total de farme" do
// sidebar — usada também pela meta de farme (farm-goal.js) pra medir o progresso do dia.
// Item de evento fica fora: é ficha de troca, não Alz farmado (ver isEventItem acima).
export function getTodayFarmedAlz() {
  const today = todayISODate();
  return getAllDrops()
    .filter(drop => drop.date === today && !isEventItem(drop.name))
    .reduce((sum, drop) => sum + getItemPrice(drop.name), 0);
}

// Rendimento (Alz/hora) da janela de farme de hoje, calculado a partir dos horários reais dos
// drops do LOG (não os manuais, que entram todos como 00:00 e distorceriam a janela). Retorna
// null quando não há base suficiente (menos de 2 drops ou janela menor que 1 min).
export function getTodayFarmRate() {
  const today = todayISODate();
  const logDrops = AppState.drops.filter(d => d.date === today && d.timestamp && !isExcludedGearItem(d.name));
  if (logDrops.length < 2) return null;
  const times = logDrops.map(d => d.timestamp.getTime());
  const activeMs = Math.max(...times) - Math.min(...times);
  if (activeMs < 60000) return null;
  const totalAlz = logDrops.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  return { alzPerHour: totalAlz / (activeMs / 3600000), activeMs };
}

// O sidebar mostra só o balanço de hoje, não o histórico inteiro — reflete o que o jogador
// farmou/gastou na sessão do dia, que é o número que importa pra decidir se compensa continuar.
export function updateBalanceSidebar() {
  const today = todayISODate();
  const totalFarmed = getTodayFarmedAlz();
  const totalRushSpent = AppState.rushHistory[today]?.total || 0;
  const net = totalFarmed - totalRushSpent;

  const farmedEl = document.getElementById('bF');
  const netEl = document.getElementById('bL');
  const rushEl = document.getElementById('bR');

  if (farmedEl) {
    farmedEl.textContent = formatAlzGamer(totalFarmed);
    farmedEl.title = formatNumber(totalFarmed) + ' Alz';
    farmedEl.style.color = getAlzTierColor(totalFarmed);
  }
  if (rushEl) {
    rushEl.textContent = formatAlzGamer(totalRushSpent);
    rushEl.title = formatNumber(totalRushSpent) + ' Alz';
  }
  if (netEl) {
    netEl.textContent = formatAlzGamer(net);
    netEl.title = formatNumber(net) + ' Alz';
    netEl.style.color = getAlzTierColor(net);
  }
}
