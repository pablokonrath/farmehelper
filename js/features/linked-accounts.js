import { AppState } from '../state/app-state.js';
import { computeDaySummary } from './dg-session.js';
import { todayISODate } from '../utils/parsing.js';
import { showInfoToast } from './alerts.js';
import { renderPage } from '../router.js';

// Comparar o farme de duas contas do MESMO jogador (a principal e uma secundária).
//
// A escolha de fundo foi manter duas contas de verdade em vez de virar "personagem" dentro de
// uma só. Cada conta tem o próprio gasto de rush, o próprio estoque, os próprios preços e a
// própria lista de DGs — fundir isso exigiria uma coluna nova em quase todas as tabelas e ainda
// somaria coisas que são legitimamente separadas.
//
// O que atravessa o vínculo é SÓ o resumo do dia. Sessão, drop, preço e venda continuam
// estritamente isolados por conta, como sempre foram. E o resumo atravessa já calculado, não como
// matéria-prima: farmado sai a preço da época, e quem sabe os preços daquela conta é ela mesma.
// Recalcular deste lado daria um número diferente do que aquele jogador vê na tela dele — e duas
// verdades pro mesmo dia é pior que uma.

const API = 'api';

// De quantos dias pra trás a comparação olha.
export const COMPARISON_DAYS = 30;

export async function loadLinkedAccounts() {
  try {
    const r = await fetch(`${API}/account-link.php`, { credentials: 'same-origin' });
    if (!r.ok) return;
    const data = await r.json();
    AppState.linkedAccounts = data.accounts || [];
  } catch {
    // sem rede: a página mostra o estado vazio e o botão de tentar de novo
  }
}

export async function loadLinkedSummaries() {
  if (!AppState.linkedAccounts.length) {
    AppState.linkedSummaries = [];
    return;
  }
  try {
    const r = await fetch(`${API}/daily-summary.php?days=${COMPARISON_DAYS}`, { credentials: 'same-origin' });
    if (!r.ok) return;
    const data = await r.json();
    AppState.linkedSummaries = data.accounts || [];
  } catch {
    // idem
  }
}

// ── Publicar o meu resumo ─────────────────────────────────────────────────────────────────────
//
// A outra conta só enxerga o que esta aqui publicou. Publicar é barato (uma linha por dia,
// upsert), mas não pode ser a cada drop — daí a assinatura: só vai pro servidor quando algum
// número do dia realmente mudou.
let ultimaAssinatura = '';
let ultimaPublicacaoAt = 0;

function montarResumo(dateISO) {
  const d = computeDaySummary(dateISO);
  return {
    date: dateISO,
    farmed: Math.round(d.farmed),
    // spentOnDone, não spent: publica o rush que foi RODADO, a mesma base do líquido que aparece
    // na tela dessa conta. Comparar "quem rendeu mais" cobrando de um lado entradas que ficaram
    // no estoque puniria justamente quem comprou adiantado — e as duas contas ficariam medindo
    // coisas diferentes sem nada indicar.
    spent: Math.round(d.spentOnDone),
    sold: Math.round(d.sold),
    runs: d.runs,
    activeMs: d.activeMs,
    sessionCount: d.sessionCount,
    topDg: d.topDg?.name || '',
  };
}

export async function publishDaySummary({ force = false } = {}) {
  // Sem nenhuma conta vinculada não há ninguém pra ler — não faz sentido gravar.
  if (!AppState.linkedAccounts.length) return;

  const resumo = montarResumo(todayISODate());
  const assinatura = JSON.stringify(resumo);
  if (!force && assinatura === ultimaAssinatura) return;

  try {
    const r = await fetch(`${API}/daily-summary.php`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: assinatura,
    });
    if (!r.ok) return;
    ultimaAssinatura = assinatura;
    ultimaPublicacaoAt = Date.now();
  } catch {
    // rede fora: a assinatura não avança, então a próxima passada tenta de novo
  }
}

export function getLastPublishAt() {
  return ultimaPublicacaoAt;
}

// Publica de tempos em tempos em vez de reagir a cada evento (drop novo, sessão encerrada,
// venda). Um timer só cobre TODOS os caminhos que mexem no resumo, inclusive os que ainda nem
// existem — e evita que este módulo tenha que ser chamado de meia dúzia de lugares, cada um
// virando uma dependência nova em cima de dg-session.
const PUBLISH_INTERVAL_MS = 2 * 60 * 1000;

export function startDaySummaryPublisher() {
  publishDaySummary();
  setInterval(() => publishDaySummary(), PUBLISH_INTERVAL_MS);
}

// ── Vincular ──────────────────────────────────────────────────────────────────────────────────

export async function generateAccountLinkCode() {
  try {
    const r = await fetch(`${API}/account-link.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    });
    const data = await r.json();
    if (!r.ok) return showInfoToast(data.message || 'Não consegui gerar o código.');
    AppState.accountLinkCode = { code: data.code, expiresInMinutes: data.expiresInMinutes };
    renderPage();
  } catch {
    showInfoToast('Erro de conexão ao gerar o código.');
  }
}

export async function redeemAccountLinkCode(code) {
  const limpo = (code || '').trim().toUpperCase();
  if (!limpo) return showInfoToast('Cole o código gerado na outra conta.');
  try {
    const r = await fetch(`${API}/account-link.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', code: limpo }),
    });
    const data = await r.json();
    if (!r.ok) return showInfoToast(data.message || 'Não consegui vincular.');
    AppState.linkedAccounts = data.accounts || [];
    AppState.accountLinkCode = null;
    // Publica na hora: sem isso a conta recém-vinculada apareceria vazia até o próximo ciclo do
    // publicador, e "vazio" numa comparação se lê como "não farmou".
    await publishDaySummary({ force: true });
    await loadLinkedSummaries();
    renderPage();
    showInfoToast('Contas vinculadas — a comparação já está disponível nas duas.');
  } catch {
    showInfoToast('Erro de conexão ao vincular.');
  }
}

export async function unlinkAccount(userId) {
  const username = AppState.linkedAccounts.find(a => a.userId === Number(userId))?.username || 'essa conta';
  if (!confirm(`Desvincular ${username}? As duas contas param de ver a comparação uma da outra. Nenhum farme é apagado — só o vínculo.`)) return;
  try {
    const r = await fetch(`${API}/account-link.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlink', userId }),
    });
    const data = await r.json();
    if (!r.ok) return showInfoToast('Não consegui desvincular.');
    AppState.linkedAccounts = data.accounts || [];
    AppState.linkedSummaries = [];
    renderPage();
  } catch {
    showInfoToast('Erro de conexão ao desvincular.');
  }
}

export function copyAccountLinkCode() {
  const code = AppState.accountLinkCode?.code;
  if (!code) return;
  navigator.clipboard?.writeText(code)
    .then(() => showInfoToast('Código copiado'))
    .catch(() => showInfoToast('Não consegui copiar — anote o código na mão'));
}

// ── A comparação ──────────────────────────────────────────────────────────────────────────────
//
// O MEU lado é sempre calculado agora, do estado local: é a fonte exata, com os meus preços, e
// vale pra qualquer dia do histórico. O lado DELA é sempre o que foi publicado, e vem com a hora
// da última publicação — porque um resumo pode estar velho.
//
// Essa assimetria é de propósito e precisa aparecer na tela. Se a conta secundária não abriu o
// app hoje, o dia dela não existe aqui — e mostrar isso como "0" faria a comparação afirmar que
// ela não farmou, que é uma conclusão que este app não tem como sustentar.
export function computeAccountComparison(days = COMPARISON_DAYS) {
  const conta = AppState.linkedSummaries[0] || null;
  const publicadoPorDia = new Map((conta?.days || []).map(d => [d.date, d]));

  // todayISODate(data) e não toISOString(): converter pra UTC muda o dia à noite no Brasil, e a
  // comparação passaria a alinhar dias trocados entre as duas contas (ver parsing.js).
  const hoje = new Date(todayISODate() + 'T00:00:00').getTime();
  const linhas = [];
  for (let i = 0; i < days; i++) {
    const dateISO = todayISODate(new Date(hoje - i * 86400000));
    const meu = computeDaySummary(dateISO);
    const dela = publicadoPorDia.get(dateISO) || null;
    // Dia em que nenhuma das duas fez nada não vira linha — encheria 30 linhas de zero em quem
    // acabou de vincular.
    if (!meu.hasAnything && !dela) continue;
    linhas.push({
      date: dateISO,
      // Base executada dos dois lados: o que a outra conta publica é o rush RODADO dela (ver
      // montarResumo). Usar meu.spent aqui compararia compra contra consumo.
      meu: { farmed: meu.farmed, spent: meu.spentOnDone, net: meu.netOnDone, runs: meu.runs, activeMs: meu.activeMs, exact: meu.farmedExact && meu.spentOnDoneExact, topDg: meu.topDg?.name || null },
      dela: dela ? { farmed: dela.farmed, spent: dela.spent, net: dela.farmed - dela.spent, runs: dela.runs, activeMs: dela.activeMs, topDg: dela.topDg || null, updatedAt: dela.updatedAt } : null,
    });
  }

  const comAmbos = linhas.filter(l => l.dela);
  const totalMeu = linhas.reduce((s, l) => s + l.meu.net, 0);
  const totalDela = comAmbos.reduce((s, l) => s + l.dela.net, 0);
  // O total das duas só é comparável nos dias em que as DUAS têm número. Somar todos os meus dias
  // contra os poucos dias publicados dela daria uma vantagem inventada pra mim.
  const totalMeuNosDiasComuns = comAmbos.reduce((s, l) => s + l.meu.net, 0);

  return {
    conta,
    linhas,
    diasComparaveis: comAmbos.length,
    totalMeu,
    totalDela,
    totalMeuNosDiasComuns,
    diasSoMeus: linhas.length - comAmbos.length,
  };
}
