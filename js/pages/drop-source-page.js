import { AppState } from '../state/app-state.js';
import { findDropSources, findDungeonDrops, getKnownSessionItemNames, computeRouteItemYield } from '../features/drop-source.js';
import { findKnownSourcesForQuery } from '../features/item-dungeon-sources.js';
import { computeItemGoalsProgress } from '../features/item-goals.js';
import { infoToggle } from '../features/ui-toggles.js';
import { DAILY_RUN_LIMIT, computeDgComparison } from '../features/dg-session.js';
import { formatDateBR, renderAlzValue, formatAlzGamer, formatDuration } from '../utils/formatting.js';
import { esc, escAttr } from '../utils/escape.js';
import { expectedCountRange } from '../utils/stats.js';

// Cadastro manual (curado) de quais DGs cada item pode dropar — diferente da busca acima, que é
// estatística. Alimenta o destaque de "item esperado" em Sessões de farme, E complementa a busca
// desta página quando o histórico pessoal ainda não tem dado (ver findKnownSourcesForQuery). Só
// admin mestre edita (mesmo padrão de Relatório → Gerenciar categorias).
function renderItemDungeonSourcesCard() {
  if (!AppState.isMasterAdmin) return '';
  const entries = Object.entries(AppState.itemDungeonSources).sort((a, b) => a[0].localeCompare(b[0]));
  return `
<div class="card">
  <div class="ctitle" style="margin-bottom:4px"><i class="ti ti-list-check"></i>Itens × DGs (cadastro manual)</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Cadastre quais DGs cada item pode dropar — diferente da busca acima (que é baseada no seu histórico), isto é curado por você e serve pra destacar os itens esperados em Sessões de farme, além de complementar a busca acima quando ainda não há sessão registrada.</div>
  <div class="row" style="margin-bottom:14px">
    <div style="flex:1"><input class="inp" id="newItemDungeonSource" placeholder="Nome do item" list="dsSugg" onkeydown="if(event.key==='Enter')addItemDungeonSourceItem()"></div>
    <button class="btn btn-p" onclick="addItemDungeonSourceItem()"><i class="ti ti-plus"></i>Adicionar</button>
  </div>
  ${!entries.length ? '<div class="empty" style="padding:14px 0">Nenhum item cadastrado ainda.</div>' : `
  <div style="display:flex;flex-direction:column;gap:10px">
  ${entries.map(([itemName, dungeonIds]) => `
    <div style="padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="flex:1;font-weight:600;font-size:13px">${esc(itemName)}</span>
        <button aria-label="Remover ${esc(itemName)}" title="Remover item" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeItemDungeonSourceItem('${escAttr(itemName)}')"><i class="ti ti-trash"></i></button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${dungeonIds.map(id => {
          const dg = AppState.dungeonList.find(d => d.id === id);
          return `<span class="badge badge-acc" style="display:flex;align-items:center;gap:6px">${esc(dg ? dg.name : id)}<button aria-label="Desvincular ${esc(dg ? dg.name : id)} de ${esc(itemName)}" style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0;display:flex" onclick="toggleItemDungeonSourceDg('${escAttr(itemName)}', '${escAttr(id)}')"><i class="ti ti-x"></i></button></span>`;
        }).join('')}
        <select class="inp inp-sm" style="width:170px" onchange="if(this.value){toggleItemDungeonSourceDg('${escAttr(itemName)}', this.value);this.value=''}">
          <option value="">+ Adicionar DG...</option>
          ${AppState.dungeonList.filter(d => !dungeonIds.includes(d.id)).map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}
        </select>
      </div>
    </div>`).join('')}
  </div>`}
</div>`;
}

// Mais casas decimais quanto menor a taxa — item raro costuma ficar abaixo de 1%, e "0%"
// arredondado não diz nada útil.
function formatDropRate(rate) {
  const pct = rate * 100;
  if (pct >= 10) return pct.toFixed(0) + '%';
  if (pct >= 1) return pct.toFixed(1) + '%';
  return pct.toFixed(2) + '%';
}

// Abaixo de 1 por run, "1 a cada N runs" é mais intuitivo (item raro). A partir de 1, um run
// nunca dropa uma fração de item — mostra a faixa inteira mais próxima (chão/teto da média) em
// vez de um número quebrado tipo "1,60 por run", que não corresponde a nenhum resultado real
// possível.
function formatAvgPerRun(rate) {
  if (rate < 1) return `≈1 a cada ${Math.round(1 / rate).toLocaleString('pt-BR')} runs`;
  const low = Math.floor(rate);
  const high = Math.ceil(rate);
  return low === high ? `≈${low} por run` : `≈${low} a ${high} por run`;
}

// "Alz esperado/run" é média de longo prazo, e pra item que cai menos de uma vez por run ela
// descreve um resultado que NUNCA acontece: a jóia de 180kk com 4,7% de taxa vira "8,49kk por
// run", número que você não recebe em run nenhuma. Ou ela cai e você leva os 180kk, ou não cai e
// leva zero.
//
// A média fica, porque é ela que ordena a tabela e responde "onde rende mais" — trocar por outra
// coisa faria o melhor drop da DG afundar pro fim da lista.
//
// A segunda linha NÃO é mais "1 a cada N runs": aquilo se lia como agenda, como se na run 21
// fosse cair. Virou a faixa que de fato acontece numa leva de 20 runs (o limite diário, que é a
// unidade em que o jogador raciocina): "0 a 3". Sair zero numa leva inteira e sair três na
// seguinte é o comportamento NORMAL dessa taxa, não sinal de que a conta está errada.
function expectedAlzCell(entry) {
  if (!entry.expectedAlzPerRun) return '<td><span style="color:var(--muted)">—</span></td>';
  const tudoOuNada = entry.dropRate != null && entry.dropRate < 1 && entry.price > 0;
  const faixa = tudoOuNada ? expectedCountRange(entry.dropRate, DAILY_RUN_LIMIT) : null;
  return `<td style="color:var(--gold);font-weight:700">${renderAlzValue(Math.round(entry.expectedAlzPerRun))}${faixa
    ? `<div style="font-size:11px;font-weight:400;color:var(--muted)" title="Tudo ou nada: quando cai, vem o valor cheio (${formatAlzGamer(entry.price)}). Em ${DAILY_RUN_LIMIT} runs a média é ${faixa.media.toFixed(1).replace('.', ',')}, mas o resultado varia nessa faixa — zero numa leva e três na outra é normal.">${formatAlzGamer(entry.price)} quando cai · <strong>${faixa.min}–${faixa.max}</strong> a cada ${DAILY_RUN_LIMIT} runs</div>`
    : ''}</td>`;
}

// Faixa provável (min–max) ao lado da taxa pontual — só quando a amostra já é boa o bastante pra
// a faixa dizer algo útil (amostra "baixa" produz uma faixa larga demais, que mais atrapalha do
// que ajuda; nesse caso já tem o ícone de alerta separado avisando).
function rateWithConfidence(entry) {
  if (entry.dropRate == null) return '<span style="color:var(--muted)" title="Nenhuma sessão desta DG tem \'Runs feitas\' preenchido">— sem runs</span>';
  const range = entry.rateRange && entry.confidence.nivel !== 'baixa'
    ? ` <span style="color:var(--muted);font-size:11px">(${formatDropRate(entry.rateRange.min)}–${formatDropRate(entry.rateRange.max)})</span>`
    : '';
  const warn = entry.confidence.nivel === 'baixa'
    ? ` <i class="ti ti-alert-triangle" style="color:var(--warn)" title="${entry.confidence.rotulo} — poucos drops registrados ainda, taxa pouco confiável"></i>`
    : '';
  return `≈${formatDropRate(entry.dropRate)}${range}${warn}`;
}

export function renderDropSourcePage() {
  const query = AppState.dropSourceQuery || '';
  const suggestions = getKnownSessionItemNames();
  const results = findDropSources(query);
  const routeYield = query ? computeRouteItemYield(query) : [];
  const targetQty = Number(AppState.dropSourceTargetQty) || 0;

  // Cadastro curado (global) que ainda não tem sessão sua correspondente — só entra aqui o que
  // NÃO já apareceu nos resultados estatísticos acima, pra não duplicar linha.
  const resultDgIds = new Set(results.map(r => r.dungeonId));
  const knownExtra = query ? findKnownSourcesForQuery(query).filter(d => !resultDgIds.has(d.id)) : [];

  // Sem escolha explícita, cai na DG da sessão ativa (se houver uma) — pousa na página já
  // mostrando "o que essa DG me dá" enquanto você tá farmando nela, sem escolher nada.
  const reverseDgId = AppState.dropSourceDungeonId || AppState.activeDgSession?.dungeonId || '';
  const reverseResult = reverseDgId ? findDungeonDrops(reverseDgId) : null;

  return `
<div class="pg-title"><i class="ti ti-compass" style="color:var(--acc)"></i>Onde dropa</div>
<div class="pg-sub">Digite o nome (completo ou parte dele) de um item e veja em quais DGs ele já caiu — com base no seu histórico de sessões de farme, ordenado pela DG que mais dropa por run.</div>

<div class="card">
  <label class="lbl">Item</label>
  <div class="row" style="align-items:stretch">
    <div style="flex:1;position:relative"><i class="ti ti-search" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:14px"></i>
    <input class="inp" id="dsQuery" style="padding-left:30px" placeholder="ex: nucleo, anel, joia..." value="${esc(query)}" onkeydown="if(event.key==='Enter')searchDropSource()" list="dsSugg"></div>
    <button class="btn btn-p" onclick="searchDropSource()"><i class="ti ti-search"></i>Buscar</button>
  </div>
  <datalist id="dsSugg">${suggestions.map(name => `<option value="${esc(name)}">`).join('')}</datalist>
  <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
    <label class="lbl">Quero calcular pra quantas unidades? <span style="font-weight:400;color:var(--muted)">(opcional)</span></label>
    <input class="inp" id="dsTargetQty" style="width:160px" type="number" min="0" placeholder="ex: 1000" value="${targetQty || ''}" onchange="setDropSourceTargetQty(this.value)">
  </div>
</div>

<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-map-pin"></i>Fontes encontradas</div>${results.length ? `<span class="badge badge-acc">${results.length} DG${results.length > 1 ? 's' : ''}</span>` : ''}</div>
  ${!AppState.dgSessions.length
    ? '<div class="empty">Você ainda não tem sessões de DG encerradas — marque um DG em Sessões de farme pra começar a construir esse histórico.</div>'
    : !query
      ? '<div class="empty">Digite o nome (completo ou parte) de um item e aperte Enter ou "Buscar" pra ver de quais DGs ele já caiu.</div>'
      : !results.length
        ? `<div class="empty">Nenhuma sessão registrou "${esc(query)}" até agora.</div>`
        : `<table><thead><tr><th style="width:36px">#</th><th>DG</th><th>Sessões</th><th>Quantidade</th><th>Última vez</th><th>Taxa por run</th><th>Média/run</th>${targetQty > 0 ? `<th>Runs p/ ${targetQty.toLocaleString('pt-BR')}×</th>` : ''}<th style="width:110px"></th></tr></thead><tbody>
          ${results.map((r, i) => `<tr>
            <td class="rank">${i + 1}</td>
            <td style="font-weight:500">${esc(r.dungeonName)}</td>
            <td>${r.sessions}</td>
            <td>${r.qty.toLocaleString('pt-BR')}×</td>
            <td>${formatDateBR(r.lastDate)}</td>
            <td>${rateWithConfidence(r)} ${r.dropRate != null ? `<span style="color:var(--muted);font-size:11px">(${r.qtyWithRuns}/${r.totalRuns.toLocaleString('pt-BR')} runs)</span>` : ''}${r.rateExcludesSomeDrops ? ` <i class="ti ti-info-circle" style="color:var(--muted)" title="A quantidade total (${r.qty}) inclui sessões sem 'Runs feitas' preenchido — a taxa usa só as ${r.qtyWithRuns} que têm runs pra comparar certo"></i>` : ''}
            </td>
            <td style="color:var(--gold)">${r.dropRate == null ? '<span style="color:var(--muted)">—</span>' : formatAvgPerRun(r.dropRate)}</td>
            ${targetQty > 0 ? `<td style="font-weight:600">${(() => {
              if (r.dropRate == null) return '<span style="color:var(--muted)">—</span>';
              const runsNeeded = Math.ceil(targetQty / r.dropRate);
              const days = Math.ceil(runsNeeded / DAILY_RUN_LIMIT);
              let range = '';
              if (r.rateRange && r.rateRange.min > 0 && r.confidence.nivel !== 'baixa') {
                const optimistic = Math.ceil(targetQty / r.rateRange.max);
                const pessimistic = Math.ceil(targetQty / r.rateRange.min);
                range = ` <span style="color:var(--muted);font-size:11px;font-weight:400">(entre ${optimistic.toLocaleString('pt-BR')} e ${pessimistic.toLocaleString('pt-BR')})</span>`;
              }
              return `≈${runsNeeded.toLocaleString('pt-BR')} runs${range} <span style="color:var(--muted);font-size:11px;font-weight:400">(≈${days.toLocaleString('pt-BR')} dia${days > 1 ? 's' : ''} a ${DAILY_RUN_LIMIT}/dia)</span>`;
            })()}</td>` : ''}
            <td><button class="btn btn-d btn-xs" onclick="goFarmDungeon('${escAttr(r.dungeonId)}')" title="Ir pra Sessões de farme com esta DG já selecionada"><i class="ti ti-player-play"></i>Ir farmar</button></td>
          </tr>`).join('')}
          </tbody></table>`}
  ${knownExtra.length ? `<div style="margin-top:${results.length ? '14px' : '0'};padding-top:${results.length ? '12px' : '0'};${results.length ? 'border-top:1px solid var(--border);' : ''}">
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px"><i class="ti ti-bulb"></i> Também já é sabido que cai em (sem dado de taxa seu ainda):</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${knownExtra.map(d => `<span class="badge badge-muted">${esc(d.name)}</span>`).join('')}</div>
  </div>` : ''}
</div>
${!routeYield.length ? '' : `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-route"></i>Qual rota rende mais deste item</div></div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle"></i> Soma a taxa de drop de cada DG da rota (tabela acima) × as repetições dela. Crie e edite rotas em Planejamento de Rush.</div>
  <table><thead><tr><th style="width:36px">#</th><th>Rota</th><th>DGs</th><th>Rendimento esperado</th>${targetQty > 0 ? '<th>Execuções p/ meta</th>' : ''}<th style="width:110px"></th></tr></thead><tbody>
  ${routeYield.map((r, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td style="font-weight:500">${esc(r.name)}${r.missingDataCount ? ` <i class="ti ti-alert-triangle" style="color:var(--warn)" title="${r.missingDataCount} DG(s) desta rota sem taxa calculável pra este item — não entram no rendimento"></i>` : ''}</td>
    <td>${r.dgCount}</td>
    <td style="color:var(--gold);font-weight:700">${r.expectedQty > 0 ? `≈${r.expectedQty.toFixed(r.expectedQty >= 10 ? 0 : 2)}×/execução` : '<span style="color:var(--muted);font-weight:400">sem dado</span>'}</td>
    ${targetQty > 0 ? `<td>${r.expectedQty > 0 ? `≈${Math.ceil(targetQty / r.expectedQty).toLocaleString('pt-BR')}×` : '<span style="color:var(--muted)">—</span>'}</td>` : ''}
    <td><button class="btn btn-d btn-xs" onclick="applyRushRoute('${escAttr(r.id)}');navigateTo('rush')" title="Soma esta rota ao carrinho de hoje e leva pra Planejamento de Rush"><i class="ti ti-player-play"></i>Aplicar</button></td>
  </tr>`).join('')}
  </tbody></table>
</div>`}

<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-list-search"></i>O que uma DG dropa</div>${reverseResult && reverseResult.items.length ? `<span class="badge badge-acc">${reverseResult.items.length} item(ns)</span>` : ''}</div>
  <div style="font-size:12px;color:var(--muted);margin:-4px 0 10px">Direção oposta da busca acima: escolha uma DG e veja tudo que ela já deixou cair no seu histórico, ordenado pelo que rende mais Alz esperado por run (taxa × preço cadastrado em Cálculo de farme) — útil pra decidir ONDE farmar, não só confirmar de onde um item já saiu.</div>
  <select class="inp" style="margin-bottom:12px" onchange="setDropSourceDungeon(this.value)">
    <option value="">Escolha uma DG...</option>
    ${AppState.dungeonList.map(d => `<option value="${esc(d.id)}"${d.id === reverseDgId ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
  </select>
  ${!reverseDgId
    ? ''
    : !reverseResult.items.length
      ? '<div class="empty">Nenhuma sessão encerrada dessa DG registrou item ainda.</div>'
      : `<table><thead><tr><th style="width:36px">#</th><th>Item</th><th>Quantidade</th><th>Taxa por run</th><th>Preço cadastrado</th><th>Alz esperado/run</th></tr></thead><tbody>
        ${reverseResult.items.map((i, idx) => `<tr>
          <td class="rank">${idx + 1}</td>
          <td style="font-weight:500">${esc(i.name)}</td>
          <td>${i.qty.toLocaleString('pt-BR')}×</td>
          <td>${rateWithConfidence(i)}</td>
          <td>${i.price ? renderAlzValue(i.price) : '<span style="color:var(--muted)">sem preço</span>'}</td>
          ${expectedAlzCell(i)}
        </tr>`).join('')}
        ${reverseResult.groups.map(g => gearGroupRows(g)).join('')}
        </tbody></table>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <button class="btn btn-d btn-xs" onclick="goFarmDungeon('${escAttr(reverseDgId)}')" title="Ir pra Sessões de farme com esta DG já selecionada"><i class="ti ti-player-play"></i>Ir farmar aqui</button>
      </div>`}
</div>
${renderItemGoalsCard()}
${renderDgCompareCard()}
${renderItemDungeonSourcesCard()}`;
}

// Metas de item. Mora aqui, e não na Visão geral junto das metas de Alz, por dois motivos: é aqui
// que vive a maquinaria de taxa de drop que responde "quantos runs faltam e em qual DG" — e a
// Visão geral já é a página mais densa do app, não precisa de mais um cartão permanente.
// Equipamento genérico como UM grupo que abre, em vez de dezenas de linhas soltas. Some do
// caminho sem sumir do app: os números do grupo são os mesmos da soma das partes, e abrir mostra
// item por item. Recolhido é o padrão porque, na esmagadora maioria das vezes, não é o que você
// veio ver — mas quando é, está a um clique.
function gearGroupRows(gear) {
  if (!gear) return '';
  const aberto = AppState.dropSourceGearOpen === gear.key;
  return `<tr style="cursor:pointer" onclick="toggleDropSourceGear('${escAttr(gear.key)}')" title="${aberto ? 'Recolher' : 'Ver por classe'}">
      <td class="rank"><i class="ti ti-chevron-${aberto ? 'down' : 'right'}" style="color:var(--muted)"></i></td>
      <td style="font-weight:500;color:var(--muted)"><i class="ti ${gear.icon}"></i> ${esc(gear.label)} <span style="font-size:11px">(${gear.count} tipo${gear.count > 1 ? 's' : ''})</span></td>
      <td style="color:var(--muted)">${gear.qty.toLocaleString('pt-BR')}×</td>
      <td style="color:var(--muted)">${rateWithConfidence(gear)}</td>
      ${/* Preço fica vazio de propósito: cada peça tem o seu, e uma média não significaria nada. */''}
      <td><span style="color:var(--muted)">varia</span></td>
      <td style="color:var(--muted);font-weight:700">${gear.expectedAlzPerRun ? renderAlzValue(Math.round(gear.expectedAlzPerRun)) : '<span style="font-weight:400">—</span>'}</td>
    </tr>
    ${!aberto ? '' : gear.classes.map(c => gearClassRows(gear.key, c)).join('')}`;
}

// Segundo nível, pelo MESMO sinal que classificou o item: armadura por sigla de classe (GU, GA...),
// arma por material (Mithril, Demonite...). Sai de graça, já que a classificação precisou dessa
// informação de qualquer jeito — e responde "o que essa DG larga pra cada classe" e "de que
// material sai arma aqui". Abre pra ver as peças.
function gearClassRows(groupKey, c) {
  const chave = `${groupKey}:${c.code}`;
  const aberta = AppState.dropSourceGearClass === chave;
  return `<tr style="background:var(--surf2);cursor:pointer" onclick="toggleDropSourceGearClass('${escAttr(chave)}')" title="${aberta ? 'Recolher' : `Ver as peças de ${c.code}`}">
      <td class="rank"><i class="ti ti-chevron-${aberta ? 'down' : 'right'}" style="color:var(--muted)"></i></td>
      <td style="padding-left:26px;font-weight:600">${esc(c.code)} <span style="font-size:11px;font-weight:400;color:var(--muted)">${c.count} tipo${c.count > 1 ? 's' : ''}</span></td>
      <td>${c.qty.toLocaleString('pt-BR')}×</td>
      <td>${rateWithConfidence(c)}</td>
      <td><span style="color:var(--muted)">varia</span></td>
      <td style="font-weight:700">${c.expectedAlzPerRun ? renderAlzValue(Math.round(c.expectedAlzPerRun)) : '<span style="color:var(--muted);font-weight:400">—</span>'}</td>
    </tr>
    ${!aberta ? '' : c.items.map(i => `<tr>
      <td></td>
      <td style="padding-left:52px;color:var(--muted)">${esc(i.name)}</td>
      <td>${i.qty.toLocaleString('pt-BR')}×</td>
      <td>${rateWithConfidence(i)}</td>
      <td>${i.price ? renderAlzValue(i.price) : '<span style="color:var(--muted)">sem preço</span>'}</td>
      ${expectedAlzCell(i)}
    </tr>`).join('')}`;
}

function renderItemGoalsCard() {
  const metas = computeItemGoalsProgress();
  const sugestoes = getKnownSessionItemNames();

  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-target-arrow"></i>Minhas metas de item</div>
  ${infoToggle('item-goals', 'Toda outra meta do app é em Alz; esta é em <strong>item</strong> — que é como objetivo de jogador costuma nascer ("preciso de 300 Núcleos pro +15"). Conta o que caiu <strong>a partir do dia em que você criou a meta</strong>, não o acumulado de sempre: o app não conhece seu inventário (não sabe o que você já gastou, craftou ou vendeu), então "quanto você tem" seria chute — "quanto caiu desde que você decidiu perseguir isso" é verificável. A previsão usa o seu ritmo real dos últimos 14 dias, não um teórico de 20 runs/dia: projeção teórica sempre erra pra otimista, porque ninguém joga no teto todo dia.')}
  ${!metas.length ? '<div class="empty" style="padding:10px 0;margin-bottom:12px">Nenhuma meta de item ainda.</div>' : `
  <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
    ${metas.map(g => `<div style="padding:12px;background:var(--surf2);border:1px solid ${g.complete ? 'var(--ok-border)' : 'var(--border)'};border-radius:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <div style="font-weight:700;display:flex;align-items:center;gap:8px">${esc(g.itemName)}
          ${g.complete ? '<span class="badge badge-ok"><i class="ti ti-check"></i> Completa</span>' : `<span class="badge badge-acc">faltam ${g.remaining}</span>`}</div>
        <button aria-label="Remover meta de ${esc(g.itemName)}" title="Remover meta" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteItemGoal('${g.id}')"><i class="ti ti-trash"></i></button>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;height:10px;background:var(--surf);border-radius:5px;overflow:hidden"><div style="width:${Math.round(g.progress * 100)}%;height:100%;background:${g.complete ? 'var(--ok)' : 'var(--acc)'}"></div></div>
        <div style="font-size:12px;font-weight:600;white-space:nowrap;color:${g.complete ? 'var(--ok)' : 'var(--txt)'}">${g.obtained} / ${g.targetQty}</div>
      </div>
      ${g.complete ? '' : `<div style="font-size:11px;color:var(--muted);margin-top:8px;display:flex;flex-direction:column;gap:3px">
        ${g.melhorDg && g.runsNeeded != null
          ? `<span><i class="ti ti-map-pin"></i> Sai mais rápido em <strong style="color:var(--txt)">${esc(g.melhorDg.dungeonName)}</strong> — ≈<strong style="color:var(--gold)">${g.runsNeeded.toLocaleString('pt-BR')} run(s)</strong> pro que falta.</span>`
          : `<span><i class="ti ti-help-circle"></i> Nenhuma DG sua tem taxa calculável pra este item ainda — farme com "Runs feitas" preenchido pra o app saber de onde ele sai melhor.</span>`}
        ${g.etaDate
          ? `<span><i class="ti ti-calendar"></i> No seu ritmo dos últimos 14 dias (${g.perDay.toFixed(1).replace('.', ',')}/dia), chega por volta de <strong style="color:var(--txt)">${formatDateBR(g.etaDate)}</strong> (~${g.etaDays} dia(s)).</span>`
          : `<span><i class="ti ti-minus"></i> Nenhum drop desse item nos últimos 14 dias — sem ritmo pra prever data.</span>`}
        <span style="opacity:.75"><i class="ti ti-flag"></i> Contando desde ${formatDateBR(g.sinceDate)}.</span>
      </div>`}
    </div>`).join('')}
  </div>`}
  <div class="row" style="align-items:flex-end">
    <div style="flex:1"><label class="lbl">Item que você precisa</label>
      <input class="inp" id="newItemGoalName" placeholder="ex: Nucleo de Aprimoramento" list="dsSugg" onkeydown="if(event.key==='Enter')addItemGoal()"></div>
    <div style="width:120px"><label class="lbl">Quantas unidades</label>
      <input class="inp" id="newItemGoalQty" type="number" min="1" placeholder="ex: 300" onkeydown="if(event.key==='Enter')addItemGoal()"></div>
    <div><label class="lbl">&nbsp;</label><button class="btn btn-p" onclick="addItemGoal()"><i class="ti ti-plus"></i>Criar meta</button></div>
  </div>
  ${sugestoes.length ? '' : '<div style="font-size:11px;color:var(--muted);margin-top:8px"><i class="ti ti-info-circle"></i> Encerre sessões de DG com as runs preenchidas pra o app conseguir dizer em qual DG cada item sai mais rápido.</div>'}
</div>`;
}

// Comparação direta de duas DGs. O ranking responde "qual é a melhor de todas"; a escolha real do
// dia a dia costuma ser mais estreita — "entre essas duas, qual eu rodo agora?" —, e responder isso
// no ranking exige achar duas linhas distantes e comparar de cabeça, coluna a coluna.
function renderDgCompareCard() {
  const idA = AppState.dropSourceCompareA;
  const idB = AppState.dropSourceCompareB;
  const stats = computeDgComparison();
  const byId = {};
  stats.forEach(s => { byId[s.dungeonId] = s; });
  const a = idA ? byId[idA] : null;
  const b = idB ? byId[idB] : null;

  const seletor = (slot, valor) => `<select class="inp" onchange="setDropSourceCompare('${slot}', this.value)">
    <option value="">Escolha uma DG…</option>
    ${AppState.dungeonList.map(d => `<option value="${esc(d.id)}"${d.id === valor ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
  </select>`;

  // Cada linha destaca o lado vencedor — é o que a comparação existe pra responder. `melhor`
  // diz qual direção é boa: em tempo/run, menor é melhor.
  const linha = (rotulo, valA, valB, fmt, melhor = 'maior') => {
    const temAmbos = valA != null && valB != null;
    const aGanha = temAmbos && (melhor === 'maior' ? valA > valB : valA < valB);
    const bGanha = temAmbos && (melhor === 'maior' ? valB > valA : valB < valA);
    const cel = (v, ganha) => `<td data-label="${rotulo}" style="text-align:center;font-weight:${ganha ? '700' : '500'};color:${ganha ? 'var(--gold)' : v == null ? 'var(--muted)' : 'var(--txt)'}">${v == null ? '—' : fmt(v)}${ganha ? ' <i class="ti ti-arrow-up" style="font-size:11px"></i>' : ''}</td>`;
    return `<tr><td style="color:var(--muted);font-size:12px">${rotulo}</td>${cel(valA, aGanha)}${cel(valB, bGanha)}</tr>`;
  };

  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-arrows-left-right"></i>Comparar duas DGs</div>
  <div style="font-size:12px;color:var(--muted);margin:-4px 0 12px">Pra decidir entre duas opções concretas, sem procurar as duas linhas no ranking e comparar de cabeça. Números do seu histórico de sessões; a seta marca quem ganha em cada linha.</div>
  <div class="row" style="margin-bottom:12px">
    <div style="flex:1">${seletor('a', idA)}</div>
    <div style="flex:1">${seletor('b', idB)}</div>
  </div>
  ${!idA || !idB
    ? '<div class="empty">Escolha duas DGs pra comparar.</div>'
    : !a || !b
      ? `<div class="empty">${!a ? 'A primeira' : 'A segunda'} DG ainda não tem sessão encerrada com runs registradas — sem dado pra comparar.</div>`
      : `<table><thead><tr><th></th><th style="text-align:center">${esc(a.dungeonName)}</th><th style="text-align:center">${esc(b.dungeonName)}</th></tr></thead><tbody>
        ${linha('Alz / run', a.alzPerRun, b.alzPerRun, formatAlzGamer)}
        ${linha('Líquido / run', a.netAlzPerRun, b.netAlzPerRun, formatAlzGamer)}
        ${linha('Alz / hora', a.alzPerHour, b.alzPerHour, formatAlzGamer)}
        ${linha('Tempo / run', a.msPerRun, b.msPerRun, formatDuration, 'menor')}
        ${linha('Custo entrada / run', a.entryCostPerRun, b.entryCostPerRun, formatAlzGamer, 'menor')}
        ${linha('Sessões registradas', a.sessions, b.sessions, v => String(v))}
        ${linha('Runs registradas', a.runs, b.runs, v => v.toLocaleString('pt-BR'))}
      </tbody></table>
      ${a.cooling || b.cooling ? `<div style="font-size:11px;color:var(--warn);margin-top:10px"><i class="ti ti-trending-down"></i> ${[a.cooling && esc(a.dungeonName), b.cooling && esc(b.dungeonName)].filter(Boolean).join(' e ')} ${a.cooling && b.cooling ? 'estão' : 'está'} esfriando — as últimas sessões renderam menos que a média. Veja o detalhe em Sessões de farme.</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-d btn-xs" onclick="goFarmDungeon('${escAttr(idA)}')"><i class="ti ti-player-play"></i>Farmar ${esc(a.dungeonName)}</button>
        <button class="btn btn-d btn-xs" onclick="goFarmDungeon('${escAttr(idB)}')"><i class="ti ti-player-play"></i>Farmar ${esc(b.dungeonName)}</button>
      </div>`}
</div>`;
}
