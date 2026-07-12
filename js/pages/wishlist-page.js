import { AppState } from '../state/app-state.js';
import { formatDateTimeBR, formatAlzGamer } from '../utils/formatting.js';

export function renderWishlistPage() {
  const matches = AppState.wishlistMatches;
  const offers = AppState.wishlistOffers;

  const itemsCard = `
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
</div>`;

  const mailboxCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-mail"></i>Correio</div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-d btn-xs" onclick="markAllWishlistMatchesSeen()"><i class="ti ti-check"></i>Marcar como visto</button>
    <button class="btn btn-xs" style="background:var(--err-bg);color:var(--err);border:none" onclick="clearWishlistMatches()"><i class="ti ti-trash"></i>Limpar</button>
  </div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Alguém dropou um item da sua lista? Faça uma proposta com valor — a pessoa recebe (e um aviso no Telegram, se ela vincular) e te chama no jogo pra fechar.</div>
  ${AppState.isWishlistMatchesLoading ? '<div class="empty">Carregando...</div>' :
    !matches.length ? '<div class="empty">Nenhum aviso ainda. Assim que alguém dropar um item da sua lista, aparece aqui.</div>' : `
  <table><thead><tr><th>Data / Hora</th><th>Item</th><th>Quem dropou</th><th>Guild</th><th>Status</th><th style="width:110px"></th></tr></thead><tbody>
  ${matches.map(m => `<tr>
    <td>${formatDateTimeBR(m.ts)}</td>
    <td>${m.itemName}</td>
    <td><span style="display:inline-flex;align-items:center;gap:6px">${m.dropperUsername}<button title="Copiar nick pra chamar no chat do jogo" style="background:transparent;border:none;color:var(--acc);cursor:pointer;font-size:13px;padding:0;display:flex" onclick="copyNick('${m.dropperUsername}')"><i class="ti ti-copy"></i></button></span></td>
    <td>${m.dropperGuild || '<span style="color:var(--muted)">—</span>'}</td>
    <td>${m.seen ? '<span class="badge badge-muted">Visto</span>' : '<span class="badge badge-acc">Novo</span>'}</td>
    <td>${AppState.offeringMatchId === m.id
      ? '<button class="btn btn-d btn-xs" onclick="cancelOffer()"><i class="ti ti-x"></i>Cancelar</button>'
      : `<button class="btn btn-p btn-xs" onclick="startOffer(${m.id})"><i class="ti ti-coin"></i>Propor</button>`}</td>
  </tr>${AppState.offeringMatchId === m.id ? `<tr><td colspan="6" style="background:var(--surf2);padding:12px 16px">
    <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><label class="lbl">Sua proposta (Alz) pelo "${m.itemName}"</label>
        <input class="inp" id="offerPriceInput" type="text" inputmode="numeric" placeholder="ex: 500.000.000" oninput="maskAlzInputLive(this)"></div>
      <button class="btn btn-p" onclick="sendWishlistOffer()"><i class="ti ti-send"></i>Enviar proposta</button>
    </div>
  </td></tr>` : ''}`).join('')}
  </tbody></table>`}
</div>`;

  const unseenOffers = offers.filter(o => !o.seen).length;
  const offersCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-coins"></i>Propostas recebidas ${unseenOffers ? `<span class="badge badge-acc" style="margin-left:4px">${unseenOffers} nova(s)</span>` : ''}</div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-d btn-xs" onclick="markOffersSeen()"><i class="ti ti-check"></i>Marcar como visto</button>
    <button class="btn btn-xs" style="background:var(--err-bg);color:var(--err);border:none" onclick="clearOffers()"><i class="ti ti-trash"></i>Limpar</button>
  </div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Quando você dropa um item que alguém deseja, a proposta de compra aparece aqui. Copie o nick e chame a pessoa no jogo pra fechar.</div>
  ${AppState.isWishlistOffersLoading ? '<div class="empty">Carregando...</div>' :
    !offers.length ? '<div class="empty">Nenhuma proposta recebida ainda.</div>' : `
  <table><thead><tr><th>Data / Hora</th><th>Item</th><th>Comprador</th><th>Guild</th><th>Oferta</th><th>Status</th></tr></thead><tbody>
  ${offers.map(o => `<tr>
    <td>${formatDateTimeBR(o.ts)}</td>
    <td>${o.itemName}</td>
    <td><span style="display:inline-flex;align-items:center;gap:6px">${o.buyerUsername}<button title="Copiar nick pra chamar no chat do jogo" style="background:transparent;border:none;color:var(--acc);cursor:pointer;font-size:13px;padding:0;display:flex" onclick="copyNick('${o.buyerUsername}')"><i class="ti ti-copy"></i></button></span></td>
    <td>${o.buyerGuild || '<span style="color:var(--muted)">—</span>'}</td>
    <td style="font-weight:700;color:var(--gold)" title="${o.offerPrice.toLocaleString('pt-BR')} Alz">${formatAlzGamer(o.offerPrice)}</td>
    <td>${o.seen ? '<span class="badge badge-muted">Visto</span>' : '<span class="badge badge-acc">Novo</span>'}</td>
  </tr>`).join('')}
  </tbody></table>`}
</div>`;

  return `
<div class="pg-title"><i class="ti ti-gift" style="color:var(--acc)"></i>Lista de desejos</div>
<div class="pg-sub">Marque itens que você quer comprar; quando alguém dropar, faça uma proposta com valor. E veja aqui as propostas que você recebeu pelos itens que dropou.</div>
${itemsCard}
${mailboxCard}
${offersCard}`;
}
