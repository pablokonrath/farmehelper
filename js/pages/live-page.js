import { AppState } from '../state/app-state.js';
import { formatAlzGamer, getAlzTierColor, renderAlzValue, formatNumber } from '../utils/formatting.js';
import { esc } from '../utils/escape.js';

const MAX_PREVIOUS_DGS = 3; // além da DG atual — até 3 DGs anteriores mostradas em "Últimas DGs"

// "há Xs / Xmin / Xh" a partir de um timestamp em ms.
function relTime(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  return `há ${Math.floor(m / 60)}h`;
}

function dgTotal(drops) {
  return drops.reduce((sum, d) => sum + d.alz * d.quantity, 0);
}

// "42.3kk Alz" colorido pela faixa de valor, mesmo estilo usado nos KPIs do resto do app —
// usado no cabeçalho de cada seção pra mostrar o total farmado daquela DG sem precisar somar
// as linhas da tabela na cabeça.
function totalBadge(drops) {
  const value = dgTotal(drops);
  return `<span style="font-weight:700;color:${getAlzTierColor(value)}" title="${formatNumber(value)} Alz">${formatAlzGamer(value)}</span>`;
}

// Agrupa por item — sem isso, farmando rápido o feed vira uma linha por drop e passa de mil
// linhas rapidinho. Uma linha por item, com a quantidade somada e o horário do drop mais recente
// dele; ordenado pelo mais recente primeiro (o que acabou de cair sobe pro topo).
function groupLiveDrops(drops) {
  const byName = new Map();
  for (const d of drops) {
    const g = byName.get(d.name) || { name: d.name, qty: 0, alz: 0, lastAt: 0 };
    g.qty += d.quantity;
    g.alz += d.alz * d.quantity;
    if (d.droppedAt > g.lastAt) g.lastAt = d.droppedAt;
    byName.set(d.name, g);
  }
  return [...byName.values()].sort((a, b) => b.lastAt - a.lastAt);
}

function renderItemTable(drops, emptyText) {
  const grouped = groupLiveDrops(drops);
  if (!grouped.length) return `<div class="empty" style="padding:20px">${emptyText}</div>`;
  const rows = grouped.map(g => `<tr>
    <td style="font-weight:500">${esc(g.name)} <span style="color:var(--muted)">${g.qty}×</span></td>
    <td style="font-weight:600">${renderAlzValue(g.alz)}</td>
    <td class="mono" style="color:var(--muted);white-space:nowrap">${relTime(g.lastAt)}</td>
  </tr>`).join('');
  return `<table><thead><tr><th>Item</th><th>Valor total</th><th>Última vez</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderLivePage() {
  const drops = AppState.liveDrops || [];
  const newestAt = drops.length ? drops[drops.length - 1].droppedAt : 0;
  // "Ao vivo" mesmo = último drop caiu há menos de 3 min. Depois disso, ou o farme parou ou o PC
  // foi fechado (é ele quem lê o log e empurra) — não dá pra distinguir os dois daqui.
  const fresh = newestAt && (Date.now() - newestAt) < 3 * 60 * 1000;
  const total = dgTotal(drops);

  const status = !drops.length
    ? '<span style="color:var(--muted)"><i class="ti ti-broadcast-off"></i> Aguardando drops…</span>'
    : fresh
      ? '<span style="color:var(--ok)"><i class="ti ti-broadcast"></i> Recebendo ao vivo</span>'
      : '<span style="color:var(--warn)"><i class="ti ti-broadcast-off"></i> Sem drops recentes — farme parado ou PC fechado</span>';

  const activeDg = AppState.liveActiveDg;
  const currentDgName = activeDg?.dungeonName || null;

  // Separa o buffer em 3 baldes: da DG atual, das DGs anteriores (agrupadas por nome, até 2 mais
  // recentes) e sem DG nenhuma marcada — em vez de uma lista só misturando tudo que caiu nas
  // últimas horas, o que confundia quando você trocava de DG no meio do farme.
  const currentDgDrops = currentDgName ? drops.filter(d => d.dungeonName === currentDgName) : [];
  const otherDrops = drops.filter(d => d.dungeonName && d.dungeonName !== currentDgName);
  const noDgDrops = drops.filter(d => !d.dungeonName);

  const otherByDg = new Map();
  for (const d of otherDrops) {
    const g = otherByDg.get(d.dungeonName) || { dungeonName: d.dungeonName, drops: [], lastAt: 0 };
    g.drops.push(d);
    if (d.droppedAt > g.lastAt) g.lastAt = d.droppedAt;
    otherByDg.set(d.dungeonName, g);
  }
  const previousDgs = [...otherByDg.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, MAX_PREVIOUS_DGS);

  const currentDgSection = currentDgName ? `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-crosshair" style="color:var(--gold)"></i>Farmando agora: ${esc(currentDgName)}</div>
  <div style="display:flex;align-items:center;gap:10px">${totalBadge(currentDgDrops)}<span style="color:var(--muted);font-size:12px">${relTime(activeDg.startAt)}</span></div></div>
  ${renderItemTable(currentDgDrops, 'Nenhum drop dessa DG ainda.')}
</div>` : '';

  const previousDgsSection = previousDgs.length ? `
<div class="card">
  <div class="ctitle" style="margin-bottom:10px"><i class="ti ti-history"></i>Últimas DGs</div>
  <div style="display:flex;flex-direction:column;gap:14px">
    ${previousDgs.map(dg => `<div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-weight:600">${esc(dg.dungeonName)}</span>
        ${totalBadge(dg.drops)}
        <span style="color:var(--muted);font-size:12px;margin-left:auto">última vez ${relTime(dg.lastAt)}</span>
      </div>
      ${renderItemTable(dg.drops, 'Sem drops registrados.')}
    </div>`).join('<div style="border-top:1px solid var(--border)"></div>')}
  </div>
</div>` : '';

  const noDgSection = noDgDrops.length ? `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-question-mark"></i>Sem DG marcada</div>${totalBadge(noDgDrops)}</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px"><i class="ti ti-info-circle"></i> Caíram sem nenhuma DG marcada em Sessões de farme.</div>
  ${renderItemTable(noDgDrops, 'Nada por aqui.')}
</div>` : '';

  const anySection = !!(currentDgSection || previousDgsSection || noDgSection);

  return `
<div class="pg-title">Ao vivo</div>
<div class="pg-sub">Espelho do seu farme no PC, separado por DG — a que está sendo feita agora, as até ${MAX_PREVIOUS_DGS} anteriores, e o que caiu sem DG marcada. Aparece aqui em poucos segundos. O PC precisa estar com o FarmHub aberto e o arquivo conectado.</div>

<div class="g3" style="margin-bottom:12px">
  <div class="kpi"><div class="kpi-lbl">Status</div><div class="kpi-val" style="font-size:15px;line-height:1.4">${status}</div></div>
  <div class="kpi"><div class="kpi-lbl">Valor recente (total)</div><div class="kpi-val" style="color:${getAlzTierColor(total)}" title="${formatNumber(total)} Alz">${formatAlzGamer(total)}</div><div class="kpi-sub">${drops.length.toLocaleString('pt-BR')} drop(s) nas últimas horas</div></div>
</div>

${anySection
    ? `${currentDgSection}${previousDgsSection}${noDgSection}`
    : '<div class="empty" style="padding:40px">Nenhum drop ainda. Assim que cair algo com valor cadastrado no PC farmando, aparece aqui em poucos segundos.</div>'}
<div style="font-size:11px;color:var(--muted);margin-top:10px"><i class="ti ti-info-circle"></i> Só entra aqui o item que <strong>já tinha preço cadastrado no instante em que caiu</strong> — cadastrar o preço depois não traz retroativo pro Ao vivo (mas conta certinho em Sessões e Relatório, que recalculam no final). E o feed guarda só as últimas horas — é um espelho ao vivo, não o histórico completo.</div>`;
}
