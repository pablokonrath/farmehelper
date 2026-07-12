import { AppState } from '../state/app-state.js';
import { formatDateTimeBR } from '../utils/formatting.js';

export function renderWishlistPage() {
  const matches = AppState.wishlistMatches;

  return `
<div class="pg-title"><i class="ti ti-gift" style="color:var(--acc)"></i>Lista de desejos</div>
<div class="pg-sub">Marque um item que você quer comprar — quando qualquer outro jogador da guild dropar, você recebe um aviso com o nick de quem dropou. A negociação (preço, forma de pagamento) fica por fora do app, direto com a pessoa.</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-list"></i>Meus itens desejados</div>
  ${!AppState.wishlistItems.length ? '<div class="empty" style="padding:14px 0">Nenhum item na lista ainda.</div>' : `
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
  ${AppState.wishlistItems.map(name => `<span class="badge badge-acc" style="display:flex;align-items:center;gap:6px">${name}<button style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0;display:flex" onclick="removeWishlistItem('${name}')"><i class="ti ti-x"></i></button></span>`).join('')}
  </div>`}
  <div class="row">
    <div style="flex:1"><label class="lbl">Adicionar item</label><input class="inp" id="newWishlistItem" placeholder="ex: Nucleo Arcano (Altissimo)"></div>
    <button class="btn btn-p" onclick="addWishlistItem()"><i class="ti ti-plus"></i>Adicionar</button>
  </div>
</div>

<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-mail"></i>Correio</div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-d btn-xs" onclick="markAllWishlistMatchesSeen()"><i class="ti ti-check"></i>Marcar como visto</button>
    <button class="btn btn-xs" style="background:var(--err-bg);color:var(--err);border:none" onclick="clearWishlistMatches()"><i class="ti ti-trash"></i>Limpar</button>
  </div></div>
  ${AppState.isWishlistMatchesLoading ? '<div class="empty">Carregando...</div>' :
    !matches.length ? '<div class="empty">Nenhum aviso ainda. Assim que alguém dropar um item da sua lista, aparece aqui.</div>' : `
  <table><thead><tr><th>Data / Hora</th><th>Item</th><th>Quem dropou</th><th>Guild</th><th>Status</th></tr></thead><tbody>
  ${matches.map(m => `<tr>
    <td>${formatDateTimeBR(m.ts)}</td>
    <td>${m.itemName}</td>
    <td><span style="display:inline-flex;align-items:center;gap:6px">${m.dropperUsername}<button title="Copiar nick pra chamar no chat do jogo" style="background:transparent;border:none;color:var(--acc);cursor:pointer;font-size:13px;padding:0;display:flex" onclick="copyNick('${m.dropperUsername}')"><i class="ti ti-copy"></i></button></span></td>
    <td>${m.dropperGuild || '<span style="color:var(--muted)">—</span>'}</td>
    <td>${m.seen ? '<span class="badge badge-muted">Visto</span>' : '<span class="badge badge-acc">Novo</span>'}</td>
  </tr>`).join('')}
  </tbody></table>`}
</div>`;
}
