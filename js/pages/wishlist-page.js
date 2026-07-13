import { AppState } from '../state/app-state.js';
import { formatDateTimeBR, formatAlzGamer } from '../utils/formatting.js';
import { esc, escAttr } from '../utils/escape.js';

const DASH = '<span style="color:var(--muted)">—</span>';
// Orientação de troca segura, mostrada quando uma proposta é aceita (nos dois lados).
const SAFE_TRADE_HINT = 'Combine a troca no jogo (sussurro/troca direta) ou use o <strong>Seguro Neo</strong> com a assistência do GM pra evitar golpe.';

// Nick com botão de copiar (pra sussurrar no chat do jogo).
const nickCell = nick => `<span style="display:inline-flex;align-items:center;gap:6px">${esc(nick)}<button title="Copiar nick pra chamar no chat do jogo" style="background:transparent;border:none;color:var(--acc);cursor:pointer;font-size:13px;padding:0;display:flex" onclick="copyNick('${escAttr(nick)}')"><i class="ti ti-copy"></i></button></span>`;

function offerStatusBadge(status) {
  if (status === 'accepted') return '<span class="badge badge-ok">Aceita</span>';
  if (status === 'rejected') return '<span class="badge" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err-border)">Recusada</span>';
  return '<span class="badge badge-warn">Aguardando</span>';
}

export function renderWishlistPage() {
  const matches = AppState.wishlistMatches;
  const offers = AppState.wishlistOffers;
  const sent = AppState.wishlistSentOffers;

  const itemsCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-list"></i>Meus itens desejados</div>
  ${!AppState.wishlistItems.length ? '<div class="empty" style="padding:14px 0">Nenhum item na lista ainda.</div>' : `
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
  ${AppState.wishlistItems.map(name => `<span class="badge badge-acc" style="display:flex;align-items:center;gap:6px">${esc(name)}<button style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0;display:flex" onclick="removeWishlistItem('${escAttr(name)}')"><i class="ti ti-x"></i></button></span>`).join('')}
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
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Alguém dropou um item da sua lista? Faça uma proposta com valor — a pessoa recebe (e um aviso no Telegram, se ela vincular) e responde aceitando ou recusando.</div>
  ${AppState.isWishlistMatchesLoading ? '<div class="empty">Carregando...</div>' :
    !matches.length ? '<div class="empty">Nenhum aviso ainda. Assim que alguém dropar um item da sua lista, aparece aqui.</div>' : `
  <table><thead><tr><th>Data / Hora</th><th>Item</th><th>Quem dropou</th><th>Guild</th><th>Status</th><th style="width:110px"></th></tr></thead><tbody>
  ${matches.map(m => `<tr>
    <td>${formatDateTimeBR(m.ts)}</td>
    <td>${esc(m.itemName)}</td>
    <td>${nickCell(m.dropperUsername)}</td>
    <td>${m.dropperGuild ? esc(m.dropperGuild) : DASH}</td>
    <td>${m.seen ? '<span class="badge badge-muted">Visto</span>' : '<span class="badge badge-acc">Novo</span>'}</td>
    <td>${AppState.offeringMatchId === m.id
      ? '<button class="btn btn-d btn-xs" onclick="cancelOffer()"><i class="ti ti-x"></i>Cancelar</button>'
      : `<button class="btn btn-p btn-xs" onclick="startOffer(${m.id})"><i class="ti ti-coin"></i>Propor</button>`}</td>
  </tr>${AppState.offeringMatchId === m.id ? `<tr><td colspan="6" style="background:var(--surf2);padding:12px 16px">
    <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><label class="lbl">Sua proposta (Alz) pelo "${esc(m.itemName)}"</label>
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
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Quando você dropa um item que alguém deseja, a proposta aparece aqui. <strong>Aceite</strong> ou <strong>recuse</strong> — o comprador recebe o retorno e a orientação de fechar a troca com segurança.</div>
  ${AppState.isWishlistOffersLoading ? '<div class="empty">Carregando...</div>' :
    !offers.length ? '<div class="empty">Nenhuma proposta recebida ainda.</div>' : `
  <table><thead><tr><th>Data / Hora</th><th>Item</th><th>Comprador</th><th>Guild</th><th>Oferta</th><th>Status</th><th style="width:170px">Ação</th></tr></thead><tbody>
  ${offers.map(o => `<tr>
    <td>${formatDateTimeBR(o.ts)}</td>
    <td>${esc(o.itemName)}</td>
    <td>${nickCell(o.buyerUsername)}</td>
    <td>${o.buyerGuild ? esc(o.buyerGuild) : DASH}</td>
    <td style="font-weight:700;color:var(--gold)" title="${o.offerPrice.toLocaleString('pt-BR')} Alz">${formatAlzGamer(o.offerPrice)}</td>
    <td>${offerStatusBadge(o.status)}${!o.seen ? ' <span class="badge badge-acc">Novo</span>' : ''}</td>
    <td>${o.status === 'pending'
      ? `<div style="display:flex;gap:6px">
          <button class="btn btn-s btn-xs" onclick="respondToOffer(${o.id},'accepted')"><i class="ti ti-check"></i>Aceitar</button>
          <button class="btn btn-xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err-border)" onclick="respondToOffer(${o.id},'rejected')"><i class="ti ti-x"></i>Recusar</button>
        </div>`
      : '<span style="color:var(--muted);font-size:12px">Respondida</span>'}</td>
  </tr>${o.status === 'accepted' ? `<tr><td colspan="7" style="background:var(--ok-bg);padding:8px 16px;font-size:12px;color:var(--ok)"><i class="ti ti-shield-check"></i> ${SAFE_TRADE_HINT}</td></tr>` : ''}`).join('')}
  </tbody></table>`}
</div>`;

  const unseenResponses = sent.filter(o => o.status !== 'pending' && !o.buyerSeen).length;
  const sentCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-send"></i>Minhas propostas enviadas ${unseenResponses ? `<span class="badge badge-acc" style="margin-left:4px">${unseenResponses} resposta(s)</span>` : ''}</div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-d btn-xs" onclick="markSentOffersSeen()"><i class="ti ti-check"></i>Marcar como visto</button>
  </div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Propostas que você enviou pra quem dropou. Quando o vendedor aceitar, combine a troca no jogo ou pelo Seguro Neo com o GM.</div>
  ${AppState.isWishlistSentOffersLoading ? '<div class="empty">Carregando...</div>' :
    !sent.length ? '<div class="empty">Você ainda não enviou nenhuma proposta. Faça uma no correio quando alguém dropar um item da sua lista.</div>' : `
  <table><thead><tr><th>Data / Hora</th><th>Item</th><th>Vendedor</th><th>Oferta</th><th>Status</th></tr></thead><tbody>
  ${sent.map(o => `<tr>
    <td>${formatDateTimeBR(o.ts)}</td>
    <td>${esc(o.itemName)}</td>
    <td>${o.status === 'accepted' ? nickCell(o.sellerUsername) : esc(o.sellerUsername)}</td>
    <td style="font-weight:700;color:var(--gold)" title="${o.offerPrice.toLocaleString('pt-BR')} Alz">${formatAlzGamer(o.offerPrice)}</td>
    <td>${offerStatusBadge(o.status)}${o.status !== 'pending' && !o.buyerSeen ? ' <span class="badge badge-acc">Nova</span>' : ''}</td>
  </tr>${o.status === 'accepted' ? `<tr><td colspan="5" style="background:var(--ok-bg);padding:8px 16px;font-size:12px;color:var(--ok)"><i class="ti ti-shield-check"></i> ${SAFE_TRADE_HINT} Chame <strong>${esc(o.sellerUsername)}</strong> no jogo.</td></tr>` : ''}`).join('')}
  </tbody></table>`}
</div>`;

  return `
<div class="pg-title"><i class="ti ti-gift" style="color:var(--acc)"></i>Lista de desejos</div>
<div class="pg-sub">Marque itens que você quer comprar; quando alguém dropar, faça uma proposta com valor. O vendedor aceita ou recusa, e você acompanha o retorno aqui.</div>
${itemsCard}
${mailboxCard}
${offersCard}
${sentCard}`;
}
