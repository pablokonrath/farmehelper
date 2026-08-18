import { AppState } from '../state/app-state.js';
import { computeAccountComparison, COMPARISON_DAYS, getLastPublishAt } from '../features/linked-accounts.js';
import { formatAlzGamer, getAlzTierColor, formatDateBR, formatDateTimeBR } from '../utils/formatting.js';
import { infoToggle } from '../features/ui-toggles.js';
import { esc } from '../utils/escape.js';

// Comparar o farme diário de duas contas do mesmo jogador. Ver linked-accounts.js pro desenho
// (por que duas contas de verdade em vez de "personagem", e por que só o resumo atravessa).

function hora(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Célula de um lado do dia. O lado da outra conta pode simplesmente NÃO existir — e isso não é
// zero. "Não publicou" e "farmou zero" são coisas diferentes, e a tela tem que dizer qual é.
function celulaDia(lado, ausenteHtml) {
  if (!lado) return `<td colspan="3" style="color:var(--muted);font-size:11px;font-style:italic">${ausenteHtml}</td>`;
  return `
    <td style="color:${getAlzTierColor(lado.farmed)};font-weight:600;font-variant-numeric:tabular-nums">${formatAlzGamer(lado.farmed)}</td>
    <td style="color:var(--muted);font-variant-numeric:tabular-nums">${lado.spent ? '−' + formatAlzGamer(lado.spent) : '—'}</td>
    <td style="color:${lado.net >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:700;font-variant-numeric:tabular-nums">${lado.net >= 0 ? '+' : '−'}${formatAlzGamer(Math.abs(lado.net))}</td>`;
}

function cardVincular() {
  const code = AppState.accountLinkCode;
  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-users-plus" style="color:var(--gold)"></i>Vincular a conta secundária</div>
  <div style="font-size:13px;color:var(--txt2);line-height:1.7;margin-bottom:14px">
    Cada conta continua sendo dona do próprio farme — sessões, drops, preços, vendas e gasto de rush
    <strong>não se misturam</strong>. O vínculo abre uma porta estreita: a outra conta passa a ver
    <strong>só o resumo do dia</strong> desta, e vice-versa.
  </div>
  ${infoToggle('link-como', `
    <strong>Como fazer, na ordem:</strong><br>
    1. Entre na conta <strong>secundária</strong> e clique em "Gerar código" aqui nesta página.<br>
    2. Copie o código, saia, e entre na conta <strong>principal</strong>.<br>
    3. Cole o código no campo abaixo e confirme.<br><br>
    O código vale por 30 minutos e serve uma vez só. É ele que faz as vezes de autorização: sem ter
    o código em mãos, ninguém consegue se vincular à sua conta e ler o seu farme. Gerar um novo
    código invalida o anterior.<br><br>
    O vínculo é <strong>mútuo</strong> — depois de pronto, a comparação abre nos dois logins. São as
    duas contas da mesma pessoa; deixar só um lado enxergando criaria a situação esquisita de a
    secundária ter autorizado o vínculo e não poder usá-lo.
  `)}
  <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:14px">
    <div style="flex:1;min-width:250px;background:var(--surf2);border:1px solid var(--border);border-radius:10px;padding:14px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:700;margin-bottom:10px">Estou na conta secundária</div>
      ${code
        ? `<div style="font-family:monospace;font-size:26px;font-weight:700;letter-spacing:4px;color:var(--gold);background:var(--surf);border:1px dashed var(--gold);border-radius:8px;padding:12px;text-align:center">${esc(code.code)}</div>
           <div style="font-size:11px;color:var(--muted);margin-top:8px">Vale por ${code.expiresInMinutes} minutos e serve uma vez. Copie, entre na conta principal e cole lá.</div>
           <button class="btn btn-d btn-sm" style="margin-top:10px" onclick="copyAccountLinkCode()"><i class="ti ti-copy"></i>Copiar código</button>`
        : `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Gere um código e cole ele na conta principal.</div>
           <button class="btn btn-p" onclick="generateAccountLinkCode()"><i class="ti ti-key"></i>Gerar código</button>`}
    </div>
    <div style="flex:1;min-width:250px;background:var(--surf2);border:1px solid var(--border);border-radius:10px;padding:14px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:700;margin-bottom:10px">Estou na conta principal</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Cole aqui o código que a outra conta gerou.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="inp" id="accountLinkCodeInput" style="flex:1;min-width:140px;font-family:monospace;letter-spacing:2px;text-transform:uppercase" maxlength="12" placeholder="A1B2C3D4"
          onkeydown="if(event.key==='Enter')redeemAccountLinkCode(this.value)">
        <button class="btn btn-p" onclick="redeemAccountLinkCode(document.getElementById('accountLinkCodeInput').value)"><i class="ti ti-link"></i>Vincular</button>
      </div>
    </div>
  </div>
</div>`;
}

function cardComparacao() {
  const c = computeAccountComparison();
  const outra = c.conta;
  const publicado = getLastPublishAt();

  // Sem nenhum dia em comum, comparar não é possível — e inventar um "empate" ou mostrar a minha
  // coluna sozinha faria a página parecer que respondeu a pergunta.
  const semDadosDela = !outra || !c.diasComparaveis;

  const diff = c.totalMeuNosDiasComuns - c.totalDela;
  const pct = c.totalDela !== 0 ? Math.round((c.totalMeuNosDiasComuns / c.totalDela - 1) * 100) : null;

  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-scale" style="color:var(--gold)"></i>Farme diário — você × ${esc(outra?.username || 'conta vinculada')}</div>

  ${semDadosDela
    ? `<div style="font-size:12px;color:var(--warn);background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:8px;padding:12px">
        <i class="ti ti-hourglass"></i> <strong>Ainda não há dia em comum pra comparar.</strong>
        A conta ${esc(outra?.username || 'vinculada')} precisa abrir o FarmHub pelo menos uma vez com farme registrado —
        é ela que publica o próprio resumo, com os preços dela. Enquanto isso não acontece, não tem
        o que comparar, e mostrar a sua coluna sozinha ao lado de um vazio só faria parecer que ela
        não farmou.
      </div>`
    : `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">
        <div style="flex:1;min-width:200px;background:var(--surf2);border:1px solid var(--border);border-radius:10px;padding:14px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700">Você (${esc(AppState.currentUsername)})</div>
          <div style="font-size:22px;font-weight:700;color:${c.totalMeuNosDiasComuns >= 0 ? 'var(--ok)' : 'var(--err)'};margin-top:6px;font-variant-numeric:tabular-nums">${c.totalMeuNosDiasComuns >= 0 ? '+' : '−'}${formatAlzGamer(Math.abs(c.totalMeuNosDiasComuns))}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">líquido nos ${c.diasComparaveis} dia${c.diasComparaveis > 1 ? 's' : ''} em comum</div>
        </div>
        <div style="flex:1;min-width:200px;background:var(--surf2);border:1px solid var(--border);border-radius:10px;padding:14px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700">${esc(outra.username)}</div>
          <div style="font-size:22px;font-weight:700;color:${c.totalDela >= 0 ? 'var(--ok)' : 'var(--err)'};margin-top:6px;font-variant-numeric:tabular-nums">${c.totalDela >= 0 ? '+' : '−'}${formatAlzGamer(Math.abs(c.totalDela))}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">mesmos ${c.diasComparaveis} dia${c.diasComparaveis > 1 ? 's' : ''}</div>
        </div>
        <div style="flex:1;min-width:200px;background:var(--gold-bg);border:1px solid var(--gold);border-radius:10px;padding:14px">
          <div style="font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.4px;font-weight:700">Diferença</div>
          <div style="font-size:22px;font-weight:700;color:var(--gold);margin-top:6px;font-variant-numeric:tabular-nums">${diff >= 0 ? '+' : '−'}${formatAlzGamer(Math.abs(diff))}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">${diff >= 0 ? 'a favor da sua conta' : `a favor de ${esc(outra.username)}`}${pct != null ? ` · ${pct >= 0 ? '+' : ''}${pct}%` : ''}</div>
        </div>
      </div>`}

  ${c.diasSoMeus > 0 && !semDadosDela ? `<div style="font-size:11px;color:var(--muted);margin-bottom:10px"><i class="ti ti-info-circle"></i> Os totais acima usam só os <strong>${c.diasComparaveis} dias em comum</strong>. Você tem mais ${c.diasSoMeus} dia(s) com farme que ${esc(outra.username)} não publicou — somar eles daria uma vantagem inventada pro seu lado.</div>` : ''}

  ${c.linhas.length ? `
  <div style="overflow-x:auto">
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="vertical-align:bottom">Dia</th>
        <th colspan="3" style="text-align:center;border-bottom:1px solid var(--border)">Você</th>
        <th colspan="3" style="text-align:center;border-bottom:1px solid var(--border)">${esc(outra?.username || '—')}</th>
        <th rowspan="2" style="vertical-align:bottom">Quem rendeu mais</th>
      </tr>
      <tr>
        <th style="font-weight:400;font-size:10px">Farmado</th><th style="font-weight:400;font-size:10px">Rush</th><th style="font-weight:400;font-size:10px">Líquido</th>
        <th style="font-weight:400;font-size:10px">Farmado</th><th style="font-weight:400;font-size:10px">Rush</th><th style="font-weight:400;font-size:10px">Líquido</th>
      </tr>
    </thead>
    <tbody>
    ${c.linhas.map(l => {
      const vencedor = !l.dela ? null : (l.meu.net === l.dela.net ? 'empate' : (l.meu.net > l.dela.net ? 'meu' : 'dela'));
      return `<tr>
        <td data-label="Dia" style="white-space:nowrap">${formatDateBR(l.date)}${l.meu.runs || l.dela?.runs ? `<div style="font-size:10px;color:var(--muted)">${l.meu.runs} × ${l.dela ? l.dela.runs : '—'} runs</div>` : ''}</td>
        ${celulaDia(l.meu, 'sem farme')}
        ${celulaDia(l.dela, 'não publicado')}
        <td data-label="Quem rendeu mais" style="font-size:11px;font-weight:700;white-space:nowrap">${
          vencedor === null ? '<span style="color:var(--muted);font-weight:400">—</span>'
          : vencedor === 'empate' ? '<span style="color:var(--muted)">empate</span>'
          : vencedor === 'meu' ? `<span style="color:var(--ok)"><i class="ti ti-arrow-up"></i> você</span>`
          : `<span style="color:var(--acc)"><i class="ti ti-arrow-up"></i> ${esc(outra.username)}</span>`
        }</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>
  </div>` : '<div class="empty">Nenhum farme registrado nos últimos ' + COMPARISON_DAYS + ' dias.</div>'}

  <div style="font-size:11px;color:var(--muted);margin-top:12px;line-height:1.7;border-top:1px solid var(--border);padding-top:10px">
    <i class="ti ti-info-circle"></i> <strong>De onde vem cada coluna.</strong>
    A sua é calculada agora, do seu próprio histórico, com os seus preços — vale pra qualquer dia.
    A da outra conta é o resumo que <em>ela</em> publicou, com os preços dela: é a única versão
    que bate com o que aquele jogador vê na tela dele.${outra?.days?.[0]?.updatedAt ? ` Última publicação dela: <strong>${formatDateTimeBR(outra.days[0].updatedAt)}</strong>.` : ''}
    ${publicado ? `A sua foi publicada às <strong>${hora(publicado)}</strong> — vai de novo a cada 2 minutos enquanto o app estiver aberto.` : ''}
  </div>
</div>`;
}

function cardVinculadas() {
  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-users" style="color:var(--acc)"></i>Contas vinculadas</div>
  ${AppState.linkedAccounts.map(a => `
    <div class="sh" style="padding:10px 0">
      <div>
        <div style="font-weight:600;font-size:13px">${esc(a.username)}</div>
        <div style="font-size:11px;color:var(--muted)">vinculada em ${formatDateTimeBR(a.linkedAt)}</div>
      </div>
      ${/* Só o id vai pro handler: enfiar o nome numa string JS dentro de um atributo HTML quebra
             no primeiro apóstrofo, e escapar isso direito exige três camadas. O nome é buscado
             lá dentro, onde já existe. */''}
      <button class="btn btn-d btn-sm" onclick="unlinkAccount(${a.userId})"><i class="ti ti-unlink"></i>Desvincular</button>
    </div>`).join('')}
</div>`;
}

export function renderAccountsPage() {
  const temVinculo = AppState.linkedAccounts.length > 0;
  return `
<div class="pg-title"><i class="ti ti-users" style="color:var(--acc)"></i>Contas</div>
<div class="pg-sub">Joga com mais de uma conta? Vincule as duas e compare o farme diário lado a lado, sem misturar nada entre elas.</div>

${temVinculo ? cardComparacao() : ''}
${temVinculo ? cardVinculadas() : ''}
${cardVincular()}

<div class="card">
  <div class="ctitle"><i class="ti ti-shield-lock" style="color:var(--muted)"></i>O que a outra conta vê</div>
  <div style="font-size:13px;color:var(--txt2);line-height:1.75">
    Só o <strong>resumo do dia</strong>: quanto farmou, quanto gastou de rush, quanto vendeu, quantas
    runs, quanto tempo, e qual DG rendeu mais. Nada além disso atravessa.
    <div style="margin-top:10px;color:var(--muted);font-size:12px">
      Continuam sendo <strong>só seus</strong>: o log de drops, cada sessão, os preços que você
      cadastrou, o carrinho e o histórico de rush, as vendas, o cofre e as metas, os alertas e o
      Telegram. Duas contas vinculadas não viram uma conta só — elas trocam um número por dia.
    </div>
  </div>
</div>`;
}
