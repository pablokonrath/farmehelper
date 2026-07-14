import { AppState } from '../state/app-state.js';
import { findDropSources, getKnownSessionItemNames } from '../features/drop-source.js';
import { formatDateBR } from '../utils/formatting.js';
import { esc } from '../utils/escape.js';

export function renderDropSourcePage() {
  const query = AppState.dropSourceQuery || '';
  const suggestions = getKnownSessionItemNames();
  const results = findDropSources(query);

  return `
<div class="pg-title">Onde dropa</div>
<div class="pg-sub">Digite o nome de um item e veja em quais DGs ele já caiu, com base no seu histórico de sessões de farme.</div>

<div class="card">
  <label class="lbl">Item</label>
  <div style="position:relative"><i class="ti ti-search" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:14px"></i>
  <input class="inp" style="padding-left:30px" placeholder="ex: nucleo, anel, joia..." value="${esc(query)}" oninput="setDropSourceQuery(this.value)" list="dsSugg"></div>
  <datalist id="dsSugg">${suggestions.map(name => `<option value="${esc(name)}">`).join('')}</datalist>
</div>

<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-map-pin"></i>Fontes encontradas</div>${results.length ? `<span class="badge badge-acc">${results.length} DG${results.length > 1 ? 's' : ''}</span>` : ''}</div>
  ${!AppState.dgSessions.length
    ? '<div class="empty">Você ainda não tem sessões de DG encerradas — marque um DG em Sessões de farme pra começar a construir esse histórico.</div>'
    : !query
      ? '<div class="empty">Digite (ou escolha na lista) o nome de um item pra ver de quais DGs ele já caiu.</div>'
      : !results.length
        ? `<div class="empty">Nenhuma sessão registrou "${esc(query)}" até agora.</div>`
        : `<table><thead><tr><th>DG</th><th>Sessões</th><th>Quantidade</th><th>Última vez</th></tr></thead><tbody>
          ${results.map(r => `<tr>
            <td style="font-weight:500">${esc(r.dungeonName)}</td>
            <td>${r.sessions}</td>
            <td>${r.qty.toLocaleString('pt-BR')}×</td>
            <td>${formatDateBR(r.lastDate)}</td>
          </tr>`).join('')}
          </tbody></table>`}
</div>`;
}
