import { AppState } from '../state/app-state.js';
import { getExpectedItemNamesForDungeon, getManualExpectedItemNames, getItemRateInDungeon } from './item-dungeon-sources.js';
import { getItemPrice, isExcludedGearItem } from './drops.js';

// Histórico de raridades: o farme normal é volume, mas o que a gente lembra (e caça) são os
// drops raros. Esses ficam diluídos no meio de milhares de itens comuns nas listas gerais —
// aqui eles têm lugar próprio, com quando caiu, em qual DG, e há quanto tempo não repete.
//
// A fonte é o histórico de SESSÕES (não o log): é ele que sabe em qual DG cada item caiu, e
// fica salvo pra sempre. Drop fora de sessão não tem DG conhecida, então não entra.

// Cada ocorrência de item raro nas sessões, da mais recente pra mais antiga.
export function getRareDropHistory(limit = 20) {
  const ocorrencias = [];
  const raridadesPorDg = new Map(); // cache: a checagem varre o histórico inteiro por DG

  for (const session of AppState.dgSessions) {
    if (!session.items) continue;
    // Sessão sem DG definida ainda: não dá pra saber se o item era raro ALI, e agrupar todas as
    // sem-DG juntas inventaria uma raridade que não existe.
    if (!session.dungeonId) continue;
    let raras = raridadesPorDg.get(session.dungeonId);
    if (!raras) {
      raras = getExpectedItemNamesForDungeon(session.dungeonId);
      raridadesPorDg.set(session.dungeonId, raras);
    }
    for (const [name, qty] of Object.entries(session.items)) {
      // Sessões antigas ainda guardam equipamento genérico no registro — filtra na hora de ler.
      if (isExcludedGearItem(name) || !raras.has(name)) continue;
      ocorrencias.push({
        name,
        qty,
        dungeonId: session.dungeonId,
        dungeonName: session.dungeonName,
        date: session.date,
        at: session.startAt,
        value: getItemPrice(name) * qty,
      });
    }
  }

  ocorrencias.sort((a, b) => b.at - a.at);
  return { itens: ocorrencias.slice(0, limit), total: ocorrencias.length };
}

// "Há quanto tempo não cai" de cada raridade que você caça. É aqui que o cadastro manual de
// Onde dropa se paga: um item tão raro que NUNCA caiu é invisível pra detecção estatística
// (quantidade zero não aparece no histórico), mas aparece aqui como "nunca caiu" se você
// cadastrou. Ordena pelo mais esperado primeiro (mais tempo sem cair / nunca caiu).
export function getRarityDroughts() {
  const ultimaVez = new Map(); // "dgId\nitem" -> timestamp
  for (const session of AppState.dgSessions) {
    if (!session.items) continue;
    for (const name of Object.keys(session.items)) {
      const chave = session.dungeonId + '\n' + name;
      const anterior = ultimaVez.get(chave);
      if (!anterior || session.startAt > anterior) ultimaVez.set(chave, session.startAt);
    }
  }

  const linhas = [];
  for (const dg of AppState.dungeonList) {
    // Só as raridades CADASTRADAS: as detectadas por estatística, por definição, caem de vez em
    // quando — quem interessa acompanhar "há quanto tempo não vem" é o que você marcou caçar.
    for (const name of getManualExpectedItemNames(dg.id)) {
      const at = ultimaVez.get(dg.id + '\n' + name) || null;
      linhas.push({
        name,
        dungeonId: dg.id,
        dungeonName: dg.name,
        ultimaVezAt: at,
        diasSem: at ? Math.floor((Date.now() - at) / 86400000) : null,
        taxa: getItemRateInDungeon(dg.id, name),
      });
    }
  }

  // Nunca caiu vai pro topo (diasSem null = espera infinita), depois os mais atrasados.
  linhas.sort((a, b) => (b.diasSem ?? Infinity) - (a.diasSem ?? Infinity));
  return linhas;
}
