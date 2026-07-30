import { AppState } from '../state/app-state.js';
import { findDropSources, getKnownSessionItemNames } from '../features/drop-source.js';
import { DAILY_RUN_LIMIT } from '../features/dg-session.js';
import { formatDateBR } from '../utils/formatting.js';
import { esc, escAttr } from '../utils/escape.js';

// Cadastro manual (curado) de quais DGs cada item pode dropar — diferente da busca acima, que é
// estatística. Alimenta o destaque de "item esperado" em Sessões de farme. Só admin mestre edita
// (mesmo padrão de Relatório → Gerenciar categorias).
function renderItemDungeonSourcesCard() {
  if (!AppState.isMasterAdmin) return '';
  const entries = Object.entries(AppState.itemDungeonSources).sort((a, b) => a[0].localeCompare(b[0]));
  return `
<div class="card">
  <div class="ctitle" style="margin-bottom:4px"><i class="ti ti-list-check"></i>Itens × DGs (cadastro manual)</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Cadastre quais DGs cada item pode dropar — diferente da busca acima (que é baseada no seu histórico), isto é curado por você e serve pra destacar os itens esperados em Sessões de farme.</div>
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
        <button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeItemDungeonSourceItem('${escAttr(itemName)}')" title="Remover item"><i class="ti ti-trash"></i></button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${dungeonIds.map(id => {
          const dg = AppState.dungeonList.find(d => d.id === id);
          return `<span class="badge badge-acc" style="display:flex;align-items:center;gap:6px">${esc(dg ? dg.name : id)}<button style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0;display:flex" onclick="toggleItemDungeonSourceDg('${escAttr(itemName)}', '${escAttr(id)}')"><i class="ti ti-x"></i></button></span>`;
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

export function renderDropSourcePage() {
  const query = AppState.dropSourceQuery || '';
  const suggestions = getKnownSessionItemNames();
  const results = findDropSources(query);
  const targetQty = Number(AppState.dropSourceTargetQty) || 0;

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
            <td>${r.dropRate == null
              ? '<span style="color:var(--muted)" title="Nenhuma sessão desta DG tem \'Runs feitas\' preenchido">— sem runs</span>'
              : `≈${formatDropRate(r.dropRate)} <span style="color:var(--muted);font-size:11px">(${r.qtyWithRuns}/${r.totalRuns.toLocaleString('pt-BR')} runs)</span>${r.lowConfidence ? ' <i class="ti ti-alert-triangle" style="color:var(--warn)" title="Amostra pequena — poucos runs registrados, taxa pouco confiável ainda"></i>' : ''}${r.rateExcludesSomeDrops ? ` <i class="ti ti-info-circle" style="color:var(--muted)" title="A quantidade total (${r.qty}) inclui sessões sem 'Runs feitas' preenchido — a taxa usa só as ${r.qtyWithRuns} que têm runs pra comparar certo"></i>` : ''}`}
            </td>
            <td style="color:var(--gold)">${r.dropRate == null ? '<span style="color:var(--muted)">—</span>' : formatAvgPerRun(r.dropRate)}</td>
            ${targetQty > 0 ? `<td style="font-weight:600">${(() => {
              if (r.dropRate == null) return '<span style="color:var(--muted)">—</span>';
              const runsNeeded = Math.ceil(targetQty / r.dropRate);
              const days = Math.ceil(runsNeeded / DAILY_RUN_LIMIT);
              return `≈${runsNeeded.toLocaleString('pt-BR')} runs <span style="color:var(--muted);font-size:11px;font-weight:400">(≈${days.toLocaleString('pt-BR')} dia${days > 1 ? 's' : ''} a ${DAILY_RUN_LIMIT}/dia)</span>`;
            })()}</td>` : ''}
          </tr>`).join('')}
          </tbody></table>`}
</div>
${renderItemDungeonSourcesCard()}`;
}
