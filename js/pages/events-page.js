import { AppState } from '../state/app-state.js';
import { computeAllEventStats } from '../features/events.js';
import { infoToggle } from '../features/ui-toggles.js';
import { formatNumber, formatAlzGamer, formatDateBR, renderAlzValue } from '../utils/formatting.js';
import { renderDateInputBR } from '../utils/date-input.js';
import { esc, escAttr } from '../utils/escape.js';

const num = v => Math.round(v || 0).toLocaleString('pt-BR');
const dec = v => (Math.round((v || 0) * 10) / 10).toLocaleString('pt-BR');

// Comparação entre eventos. É a razão de a página existir: um evento sozinho você acompanha no
// painel, mas "em qual eu farmei melhor" só se responde com os anteriores guardados.
//
// Compara por HORA e por RUN, nunca pelo total. Evento tem duração diferente e um deles quase
// sempre está pela metade — comparar totais aí é comparar quanto tempo passou, não quanto rendeu.
function comparativo(eventos) {
  const comparaveis = eventos.filter(e => e.fichas > 0);
  if (comparaveis.length < 2) return '';

  const melhorHora = Math.max(...comparaveis.map(e => e.fichasPorHora || 0));
  const melhorRun = Math.max(...comparaveis.map(e => e.fichasPorRun || 0));

  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-chart-bar" style="color:var(--gold)"></i>Qual evento rendeu mais</div>
  ${infoToggle('events-compare', 'Compara por <strong>ficha por hora</strong> e <strong>por run</strong>, não pelo total: evento tem duração diferente, e um deles quase sempre ainda está correndo. Por hora é a régua mais justa entre eventos (não depende de quanto você jogou); por run mede a mecânica em si. O <strong>Alz por hora</strong> só existe depois que você registra resgates — é ele que responde se valeu a pena priorizar o evento em vez do farme normal.')}
  <table class="t-cards"><thead><tr><th>Evento</th><th>Período</th><th>Fichas</th><th>Por hora</th><th>Por run</th><th>Alz/hora</th></tr></thead><tbody>
  ${comparaveis.map(e => `<tr>
    <td data-label="Evento" style="font-weight:500">${esc(e.nome)}${e.emAndamento ? ' <span class="badge badge-acc">em andamento</span>' : ''}</td>
    <td data-label="Período" style="color:var(--muted)">${e.dias} dia${e.dias > 1 ? 's' : ''}</td>
    <td data-label="Fichas">${num(e.fichas)}${e.emAndamento ? '<span style="color:var(--muted)"> (parcial)</span>' : ''}</td>
    <td data-label="Por hora" style="font-weight:600;color:${e.fichasPorHora === melhorHora && melhorHora > 0 ? 'var(--ok)' : 'var(--txt)'}">${e.fichasPorHora != null ? dec(e.fichasPorHora) : '—'}</td>
    <td data-label="Por run" style="font-weight:600;color:${e.fichasPorRun === melhorRun && melhorRun > 0 ? 'var(--ok)' : 'var(--txt)'}">${e.fichasPorRun != null ? dec(e.fichasPorRun) : '—'}</td>
    <td data-label="Alz/hora" style="color:var(--gold);font-weight:700">${e.alzPorHora != null ? formatAlzGamer(e.alzPorHora) + '/h' : '<span style="color:var(--muted);font-weight:400">sem resgate</span>'}</td>
  </tr>`).join('')}
  </tbody></table>
</div>`;
}

function cardEvento(e) {
  const dgsComMult = AppState.dungeonList.filter(d => e.multipliers?.[d.id]);
  return `
<div class="card${e.emAndamento ? ' card-featured' : ''}">
  <div class="sh">
    <div class="ctitle" style="margin:0"><i class="ti ti-gift" style="color:var(--gold)"></i>${esc(e.nome)}
      ${e.emAndamento ? '<span class="badge badge-acc" style="margin-left:8px">em andamento</span>' : `<span class="badge badge-muted" style="margin-left:8px">encerrado</span>`}</div>
    <button aria-label="Excluir evento ${esc(e.nome)}" title="Excluir evento" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteEvent('${escAttr(e.id)}')"><i class="ti ti-trash"></i></button>
  </div>

  <div class="row" style="align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
    <div style="flex:1;min-width:170px"><label class="lbl">Nome</label>
      <input class="inp inp-sm" value="${escAttr(e.nome)}" onchange="setEventField('${escAttr(e.id)}', 'nome', this.value)"></div>
    <div style="flex:1;min-width:170px"><label class="lbl">Item do evento</label>
      <input class="inp inp-sm" list="evItens" value="${escAttr(e.itemName)}" onchange="setEventField('${escAttr(e.id)}', 'itemName', this.value)">
      <div class="hint">Casa por trecho do nome.</div></div>
    <div style="width:140px"><label class="lbl">Início</label>
      <input class="inp inp-sm" type="text" inputmode="numeric" placeholder="DD/MM/AAAA" value="${e.inicio ? formatDateBR(e.inicio) : ''}"
        onfocus="this.value = this.value.replace(/\\D/g,'')" oninput="this.value = maskDateInputBR(this.value)"
        onchange="setEventField('${escAttr(e.id)}', 'inicio', parseDateInputBR(this.value))"></div>
    ${/* Fim vazio é o estado NORMAL no começo: o servidor costuma anunciar o término depois que o
         evento já começou. Por isso o campo não é obrigatório e o texto diz isso, em vez de
         parecer um dado que faltou preencher. */''}
    <div style="width:140px"><label class="lbl">Fim ${e.fim ? '' : '<span style="font-weight:400;color:var(--muted)">— sem data</span>'}</label>
      <input class="inp inp-sm" type="text" inputmode="numeric" placeholder="quando anunciarem" value="${e.fim ? formatDateBR(e.fim) : ''}"
        onfocus="this.value = this.value.replace(/\\D/g,'')" oninput="this.value = maskDateInputBR(this.value)"
        onchange="setEventField('${escAttr(e.id)}', 'fim', parseDateInputBR(this.value))"></div>
  </div>

  <div class="g3" style="margin-bottom:12px">
    <div class="kpi"><div class="kpi-lbl">Fichas${e.emAndamento ? ' (parcial)' : ''}</div>
      <div class="kpi-val" style="color:var(--gold)">${num(e.fichas)}</div>
      <div class="kpi-sub">de ${num(e.fichasBrutas)} drops${e.foraDeMultiplicador ? ` · ${num(e.foraDeMultiplicador)} em DG sem multiplicador` : ''}</div></div>
    <div class="kpi"><div class="kpi-lbl">Por hora / por run</div>
      <div class="kpi-val">${e.fichasPorHora != null ? dec(e.fichasPorHora) : '—'}<span style="font-size:13px;color:var(--muted)"> / ${e.fichasPorRun != null ? dec(e.fichasPorRun) : '—'}</span></div>
      <div class="kpi-sub">${e.runs} runs · ${dec(e.horas)}h em ${e.dias} dia(s)</div></div>
    <div class="kpi"><div class="kpi-lbl">Sobrando pra trocar</div>
      <div class="kpi-val" style="color:${e.fichasDisponiveis > 0 ? 'var(--ok)' : 'var(--muted)'}">${num(e.fichasDisponiveis)}</div>
      <div class="kpi-sub">${num(e.fichasGastas)} já usadas em resgates</div></div>
  </div>

  <label class="lbl">Quanto cada DG vale por drop</label>
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
    ${dgsComMult.map(d => `<span style="display:flex;align-items:center;gap:6px;background:var(--surf2);border:1px solid var(--border);border-radius:8px;padding:5px 10px;font-size:var(--fs-sm)">
      ${esc(d.name)} <span style="color:var(--muted)">×</span>
      <input class="inp inp-sm" type="number" min="0" value="${e.multipliers[d.id]}" style="width:56px" onchange="setEventDgMultiplier('${escAttr(e.id)}', '${escAttr(d.id)}', this.value)">
    </span>`).join('')}
    ${!dgsComMult.length ? '<span style="font-size:11px;color:var(--muted)">Nenhuma DG marcada — sem isso as fichas não são contadas, porque o log não diz de qual DG o item veio.</span>' : ''}
  </div>
  <div class="row" style="align-items:flex-end;margin-bottom:14px">
    <div style="flex:1;max-width:280px"><label class="lbl">Adicionar DG</label>
      <select class="inp inp-sm" onchange="if(this.value){setEventDgMultiplier('${escAttr(e.id)}', this.value, 1);this.value=''}">
        <option value="">Escolher DG…</option>
        ${AppState.dungeonList.filter(d => !e.multipliers?.[d.id]).map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}
      </select></div>
  </div>

  ${!e.porDg.length ? '' : `<table class="t-cards" style="margin-bottom:14px"><thead><tr><th>DG</th><th>Drops</th><th>Vale</th><th>Conta como</th><th>Fichas/run</th></tr></thead><tbody>
    ${e.porDg.map(l => `<tr>
      <td data-label="DG" style="font-weight:500">${esc(l.dungeonName)}</td>
      <td data-label="Drops">${num(l.bruto)}×</td>
      <td data-label="Vale" style="color:var(--muted)">×${l.mult}</td>
      <td data-label="Conta como" style="color:var(--gold);font-weight:700">${num(l.contado)}</td>
      <td data-label="Fichas/run">${l.runs > 0 ? dec(l.contado / l.runs) : '<span style="color:var(--muted)">— runs</span>'}</td>
    </tr>`).join('')}
  </tbody></table>`}

  ${/* Resgates: é o que transforma "juntei 4.800 fichas" em "o evento me rendeu X". A contagem
       sozinha não responde se valeu a pena — a ficha só vira valor quando você troca. */''}
  <div style="padding-top:12px;border-top:1px solid var(--border)">
    <div class="sh" style="margin-bottom:8px">
      <label class="lbl" style="margin:0">Resgates — o que você trocou pelas fichas</label>
      ${e.valorResgatado ? `<span style="font-size:12px">Total: <strong style="color:var(--gold)">${formatAlzGamer(e.valorResgatado)}</strong>${e.alzPorFicha ? ` <span style="color:var(--muted)">· ${formatAlzGamer(e.alzPorFicha)} por ficha</span>` : ''}</span>` : ''}
    </div>
    ${!e.resgates.length ? '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Nada resgatado ainda. Sem isso o evento tem contagem, mas não tem valor — e é o valor que responde se valeu a pena.</div>' : `
    <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px">
      ${e.resgates.map((r, i) => `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);flex-wrap:wrap">
        <span style="color:var(--ok);font-weight:600">${formatAlzGamer(r.valorUnitario * r.quantidade)}</span>
        <span style="color:var(--txt2)">${esc(r.recompensa)}${r.quantidade > 1 ? ` ×${r.quantidade}` : ''}</span>
        ${r.custoFichas ? `<span>por ${num(r.custoFichas)} fichas</span>` : ''}
        <span>${formatDateBR(r.data)}</span>
        <button aria-label="Remover resgate" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:12px;padding:0;margin-left:auto" onclick="removeEventRedemption('${escAttr(e.id)}', ${i})"><i class="ti ti-x"></i></button>
      </div>`).join('')}
    </div>`}
    <div class="row" style="align-items:flex-end;flex-wrap:wrap">
      <div style="flex:1;min-width:150px"><label class="lbl" style="font-size:10px">Recompensa</label>
        <input class="inp inp-sm" id="rg-nome-${e.id}" placeholder="ex: Caixa do evento"></div>
      <div style="width:80px"><label class="lbl" style="font-size:10px">Qtd</label>
        <input class="inp inp-sm" id="rg-qtd-${e.id}" type="number" min="1" value="1"></div>
      <div style="width:130px"><label class="lbl" style="font-size:10px">Valor total (Alz)</label>
        <input class="inp inp-sm" id="rg-val-${e.id}" type="text" inputmode="numeric" placeholder="Alz" oninput="maskAlzInputLive(this)"></div>
      <div style="width:110px"><label class="lbl" style="font-size:10px">Custou (fichas)</label>
        <input class="inp inp-sm" id="rg-fic-${e.id}" type="number" min="0" placeholder="ex: 500"></div>
      <div><label class="lbl" style="font-size:10px">&nbsp;</label>
        <button class="btn btn-p btn-sm" onclick="addEventRedemption('${escAttr(e.id)}', { recompensa: document.getElementById('rg-nome-${e.id}').value, quantidade: document.getElementById('rg-qtd-${e.id}').value, valorTexto: document.getElementById('rg-val-${e.id}').value, custoFichas: document.getElementById('rg-fic-${e.id}').value })"><i class="ti ti-plus"></i>Registrar</button></div>
    </div>
    <div style="font-size:10px;color:var(--muted);margin-top:6px">Vendeu a recompensa depois? Registre a venda normalmente em Vendas — aqui entra o valor que ela tinha pra você na hora da troca.</div>
  </div>
</div>`;
}

export function renderEventsPage() {
  const eventos = computeAllEventStats();
  const itens = [...new Set(AppState.knownItemNames || [])];

  return `
<div class="pg-title"><i class="ti ti-gift" style="color:var(--acc)"></i>Eventos</div>
<div class="pg-sub">Cada evento guardado por conta própria, com o que ele rendeu — pra você saber em qual farmou melhor quando o próximo chegar.</div>
<datalist id="evItens">${itens.map(n => `<option value="${esc(n)}">`).join('')}</datalist>

<div class="card">
  <div class="ctitle"><i class="ti ti-plus"></i>Novo evento</div>
  ${infoToggle('events-new', `O item do evento <strong>não conta como Alz</strong> em nenhuma parte do app enquanto o evento estiver em andamento: ele é ficha de troca, e o valor aparece quando você registra o resgate. Isso também impede que a DG do evento suba no ranking agora e afunde quando ele acabar — o histórico não é apagado, então o pico ficaria na média pra sempre.<br><br>A <strong>data de fim fica vazia</strong> até você saber: é o normal, o servidor costuma anunciar o término depois. Enquanto ela estiver vazia o evento conta como em andamento e os totais dele são parciais.<br><br>Criar um evento novo <strong>encerra o anterior</strong> na véspera, pra dois eventos não disputarem os mesmos drops.`)}
  <div class="row" style="align-items:flex-end;flex-wrap:wrap">
    <div style="flex:1;min-width:160px"><label class="lbl">Nome do evento</label>
      <input class="inp" id="newEventName" placeholder="ex: Caça ao Fragmento"></div>
    <div style="flex:1;min-width:160px"><label class="lbl">Item do evento</label>
      <input class="inp" id="newEventItem" list="evItens" placeholder="ex: Fragmento Prismático"></div>
    <div style="width:150px"><label class="lbl">Início</label>
      ${renderDateInputBR({ id: 'newEventStart', value: '' })}</div>
    <div><label class="lbl">&nbsp;</label>
      <button class="btn btn-p" onclick="createEvent({ nome: document.getElementById('newEventName').value, itemName: document.getElementById('newEventItem').value, inicio: parseDateInputBR(document.getElementById('newEventStart').value) })"><i class="ti ti-plus"></i>Criar evento</button></div>
  </div>
</div>

${comparativo(eventos)}
${!eventos.length ? '<div class="card"><div class="empty" style="padding:40px">Nenhum evento registrado ainda. Crie um quando o próximo começar — a partir daí o FarmHub conta as fichas sozinho, pelas suas sessões.</div></div>' : eventos.map(cardEvento).join('')}`;
}
