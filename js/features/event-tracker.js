import { AppState } from '../state/app-state.js';
import { saveEventConfig } from '../state/persistence.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { renderPage } from '../router.js';

// Eventos do servidor às vezes dão um item de evento em quantidade DIFERENTE por DG: o log
// registra "caiu 1 fragmento", mas naquela DG aquele 1 vale 3, e em outra vale 5. Contar as
// linhas do log dá o número errado — e é justamente esse número que decide se você já tem o
// suficiente pra trocar pela recompensa.
//
// A multiplicação só é possível onde a DG é conhecida, e o log cru não sabe: quem sabe é o
// histórico de SESSÕES. Por isso a contagem aqui é sempre por sessão — o que caiu fora de
// qualquer sessão marcada fica de fora, e o painel diz isso na cara em vez de omitir.
//
// Fica num painel próprio de propósito: evento é temporário, então nada disso contamina os
// números permanentes do app (Top itens, Relatório, Alz total). Acabou o evento, desliga e some.

// Multiplicadores padrão do evento atual, por NOME de DG (casado sem acento/maiúscula, porque a
// lista de DGs pode ter sido editada). Servem só como ponto de partida — tudo é editável na tela.
const MULTIPLICADORES_PADRAO = [
  { nome: 'C1', mult: 3 },
  { nome: 'Siena 1SS', mult: 3 },
  { nome: 'Siena 2SS', mult: 3 },
  { nome: 'C1D', mult: 5 },
  { nome: 'C2D', mult: 5 },
  { nome: 'Crista Ilusória', mult: 5 },
];

export function buildDefaultEventMultipliers() {
  const porId = {};
  for (const { nome, mult } of MULTIPLICADORES_PADRAO) {
    const alvo = normalizeForSearch(nome);
    const dg = AppState.dungeonList.find(d => normalizeForSearch(d.name) === alvo);
    if (dg) porId[dg.id] = mult;
  }
  return porId;
}

export function getEventConfig() {
  const c = AppState.eventConfig || {};
  return {
    enabled: !!c.enabled,
    itemName: c.itemName || '',
    since: c.since || '',
    multipliers: c.multipliers && Object.keys(c.multipliers).length ? c.multipliers : buildDefaultEventMultipliers(),
  };
}


function salvar(patch) {
  AppState.eventConfig = { ...getEventConfig(), ...patch };
  saveEventConfig().catch(err => console.error('Falha ao salvar evento:', err));
  renderPage();
}

export function setEventEnabled(enabled) { salvar({ enabled: !!enabled }); }
export function setEventItemName(name) { salvar({ itemName: (name || '').trim() }); }
export function setEventSince(date) { salvar({ since: date || '' }); }

export function setEventMultiplier(dungeonId, value) {
  const mult = Math.max(0, parseInt(value, 10) || 0);
  const multipliers = { ...getEventConfig().multipliers };
  if (mult > 0) multipliers[dungeonId] = mult;
  else delete multipliers[dungeonId];
  salvar({ multipliers });
}

// Conta o item do evento no histórico de sessões, aplicando o multiplicador da DG de cada uma.
// Casa o nome por "contém" normalizado: o log costuma trazer sufixos/variações no nome do item,
// e exigir igualdade exata faria a contagem dar zero sem explicar por quê.
export function computeEventProgress() {
  const cfg = getEventConfig();
  if (!cfg.enabled || !cfg.itemName) return null;
  const alvo = normalizeForSearch(cfg.itemName);

  const porDg = new Map();
  let totalBruto = 0;
  let totalContado = 0;
  let brutoForaDeMultiplicador = 0;

  for (const session of AppState.dgSessions) {
    if (cfg.since && session.date < cfg.since) continue;
    for (const [nome, qty] of Object.entries(session.items || {})) {
      if (!normalizeForSearch(nome).includes(alvo)) continue;
      const mult = cfg.multipliers[session.dungeonId] || 0;
      totalBruto += qty;
      if (!mult) { brutoForaDeMultiplicador += qty; continue; }

      const linha = porDg.get(session.dungeonId) || { dungeonId: session.dungeonId, dungeonName: session.dungeonName, bruto: 0, mult, contado: 0 };
      linha.bruto += qty;
      linha.contado += qty * mult;
      porDg.set(session.dungeonId, linha);
      totalContado += qty * mult;
    }
  }

  return {
    itemName: cfg.itemName,
    since: cfg.since,
    totalBruto,
    totalContado,
    brutoForaDeMultiplicador,
    porDg: [...porDg.values()].sort((a, b) => b.contado - a.contado),
  };
}
