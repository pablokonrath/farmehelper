import { AppState } from '../state/app-state.js';
import { getItemPrice } from './drops.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';
const LIVE_POLL_INTERVAL_MS = 10000; // celular puxa a cada 10s (só com a página aberta)
const MAX_LIVE_BUFFER = 200;         // teto do buffer na memória do consumidor

// PRODUTOR (roda no PC que lê o log): chamado toda vez que caem drops NOVOS (ver file-source.js).
// Empurra pro servidor só os que têm valor cadastrado — é o que interessa acompanhar no celular e
// corta o volume. Best-effort igual ao sync do ranking: uma falha aqui não pode travar o farme (o
// log local continua sendo a fonte de verdade). Não é chamado no full-reload (drops antigos do
// jogo reiniciado não devem reaparecer no feed ao vivo), só nas linhas realmente novas.
export async function pushLiveDrops(newDrops) {
  // A DG marcada em Sessões de farme no momento do drop (null se farmando sem marcar nenhuma) —
  // permite a página "Ao vivo" separar por DG. Mesmo valor pra todo o lote (o intervalo entre
  // linhas do log é de segundos, não dá pra trocar de DG no meio de um lote na prática).
  const dungeonName = AppState.activeDgSession?.dungeonName || null;
  const notable = [];
  for (const d of newDrops) {
    const alz = getItemPrice(d.name);
    if (alz > 0) {
      notable.push({ name: d.name, quantity: 1, alz, droppedAt: d.timestamp?.getTime() || Date.now(), dungeonName });
    }
  }
  if (!notable.length) return; // nada com valor nesse lote — não gasta requisição

  try {
    await fetch(`${API_BASE}/live-drops.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drops: notable }),
    });
  } catch {
    // sem conexão nesse instante — o próximo lote de drops tenta de novo; não é crítico
  }
}

// CONSUMIDOR (qualquer aparelho da mesma conta): puxa o que entrou depois do cursor. Como o cursor
// (id) só cresce, nunca rebusca o que já tem — sem duplicata. Re-renderiza só se a página "Ao vivo"
// estiver aberta.
export async function loadLiveDrops() {
  try {
    const response = await fetch(`${API_BASE}/live-drops.php?since=${AppState.liveDropsCursor}`, {
      credentials: 'same-origin',
    });
    if (!response.ok) return;
    const data = await response.json();
    const drops = Array.isArray(data.drops) ? data.drops : [];
    AppState.liveActiveDg = data.activeDg || null;
    if (drops.length) {
      AppState.liveDrops = [...AppState.liveDrops, ...drops].slice(-MAX_LIVE_BUFFER);
      AppState.liveDropsCursor = data.cursor || AppState.liveDropsCursor;
    }
    if (AppState.currentPage === 'live') renderPage();
  } catch {
    // falha pontual de rede — tenta de novo no próximo tick
  }
}

// Só busca com a página "Ao vivo" aberta — sem isso não faz sentido gastar requisição (é o dial de
// carga que a gente conversou). setInterval comum basta: se a aba estiver em segundo plano o
// navegador só atrasa um pouco o tick, e o feed ao vivo não precisa da precisão de segundos que os
// alertas precisam (por isso os alertas usam Worker e este não).
export function startLiveDropPolling() {
  setInterval(() => {
    if (AppState.currentPage === 'live') loadLiveDrops();
  }, LIVE_POLL_INTERVAL_MS);
}
