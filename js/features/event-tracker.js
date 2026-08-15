import { AppState } from '../state/app-state.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { getActiveEvent } from './events.js';

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

// A configuração "do evento atual" agora é uma VISTA do evento em andamento na lista (ver
// features/events.js). Quem consome isto — o filtro de Alz (isEventItem), o painel da Visão geral
// e a contagem — continua vendo a mesma forma de antes e não precisou saber que virou histórico.
//
// AppState.eventConfig segue existindo como fallback pra quem ainda não tem evento na lista: é o
// dado antigo, e a migração acontece na primeira vez que a página de Eventos é aberta.
export function getEventConfig() {
  const ativo = getActiveEvent();
  if (ativo) {
    return {
      enabled: true,
      itemName: ativo.itemName || '',
      since: ativo.inicio || '',
      multipliers: ativo.multipliers && Object.keys(ativo.multipliers).length ? ativo.multipliers : buildDefaultEventMultipliers(),
    };
  }
  const c = AppState.eventConfig || {};
  return {
    enabled: !!c.enabled,
    itemName: c.itemName || '',
    since: c.since || '',
    multipliers: c.multipliers && Object.keys(c.multipliers).length ? c.multipliers : buildDefaultEventMultipliers(),
  };
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
