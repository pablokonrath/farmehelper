import { AppState } from '../state/app-state.js';
import { findDropSources, findDungeonDrops, getKnownSessionItemNames, computeRouteItemYield } from '../features/drop-source.js';
import { findKnownSourcesForQuery } from '../features/item-dungeon-sources.js';
import { DAILY_RUN_LIMIT } from '../features/dg-session.js';
import { formatDateBR, renderAlzValue } from '../utils/formatting.js';
import { esc, escAttr } from '../utils/escape.js';

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

  const reverseDgId = AppState.dropSourceDungeonId;
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
        : `<table><thead><tr><th>DG</th><th>Sessões</th><th>Quantidade</th><th>Última vez</th><th>Taxa por run</th><th>Média/run</th>${targetQty > 0 ? `<th>Runs p/ ${targetQty.toLocaleString('pt-BR')}×</th>` : ''}</tr></thead><tbody>
          ${results.map(r => `<tr>
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
  <table><thead><tr><th style="width:36px">#</th><th>Rota</th><th>DGs</th><th>Rendimento esperado</th>${targetQty > 0 ? '<th>Execuções p/ meta</th>' : ''}</tr></thead><tbody>
  ${routeYield.map((r, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td style="font-weight:500">${esc(r.name)}${r.missingDataCount ? ` <i class="ti ti-alert-triangle" style="color:var(--warn)" title="${r.missingDataCount} DG(s) desta rota sem taxa calculável pra este item — não entram no rendimento"></i>` : ''}</td>
    <td>${r.dgCount}</td>
    <td style="color:var(--gold);font-weight:700">${r.expectedQty > 0 ? `≈${r.expectedQty.toFixed(r.expectedQty >= 10 ? 0 : 2)}×/execução` : '<span style="color:var(--muted);font-weight:400">sem dado</span>'}</td>
    ${targetQty > 0 ? `<td>${r.expectedQty > 0 ? `≈${Math.ceil(targetQty / r.expectedQty).toLocaleString('pt-BR')}×` : '<span style="color:var(--muted)">—</span>'}</td>` : ''}
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
      : `<table><thead><tr><th>Item</th><th>Quantidade</th><th>Taxa por run</th><th>Preço cadastrado</th><th>Alz esperado/run</th></tr></thead><tbody>
        ${reverseResult.items.map(i => `<tr>
          <td style="font-weight:500">${esc(i.name)}</td>
          <td>${i.qty.toLocaleString('pt-BR')}×</td>
          <td>${rateWithConfidence(i)}</td>
          <td>${i.price ? renderAlzValue(i.price) : '<span style="color:var(--muted)">sem preço</span>'}</td>
          <td style="color:var(--gold);font-weight:700">${i.expectedAlzPerRun ? renderAlzValue(Math.round(i.expectedAlzPerRun)) : '<span style="color:var(--muted);font-weight:400">—</span>'}</td>
        </tr>`).join('')}
        </tbody></table>`}
</div>
${renderItemDungeonSourcesCard()}`;
}
