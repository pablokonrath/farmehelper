import { AppState } from '../state/app-state.js';
import { formatAlzGamer, getAlzTierColor, renderAlzValue, formatNumber } from '../utils/formatting.js';
import { esc } from '../utils/escape.js';

// "há Xs / Xmin / Xh" a partir de um timestamp em ms.
function relTime(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  return `há ${Math.floor(m / 60)}h`;
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

export function renderLivePage() {
  const drops = AppState.liveDrops || [];
  const newestAt = drops.length ? drops[drops.length - 1].droppedAt : 0;
  // "Ao vivo" mesmo = último drop caiu há menos de 3 min. Depois disso, ou o farme parou ou o PC
  // foi fechado (é ele quem lê o log e empurra) — não dá pra distinguir os dois daqui.
  const fresh = newestAt && (Date.now() - newestAt) < 3 * 60 * 1000;
  const total = drops.reduce((sum, d) => sum + d.alz * d.quantity, 0);
  const grouped = groupLiveDrops(drops);

  const status = !drops.length
    ? '<span style="color:var(--muted)"><i class="ti ti-broadcast-off"></i> Aguardando drops…</span>'
    : fresh
      ? '<span style="color:var(--ok)"><i class="ti ti-broadcast"></i> Recebendo ao vivo</span>'
      : '<span style="color:var(--warn)"><i class="ti ti-broadcast-off"></i> Sem drops recentes — farme parado ou PC fechado</span>';

  const activeDg = AppState.liveActiveDg;
  const activeDgBanner = activeDg
    ? `<div class="card" style="padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <i class="ti ti-crosshair" style="color:var(--gold)"></i>
        <span>Farmando <strong>${esc(activeDg.dungeonName)}</strong></span>
        <span style="color:var(--muted);margin-left:auto">${relTime(activeDg.startAt)}</span>
      </div>`
    : '';

  const rows = grouped.map(g => `<tr>
    <td style="font-weight:500">${esc(g.name)} <span style="color:var(--muted)">${g.qty}×</span></td>
    <td style="font-weight:600">${renderAlzValue(g.alz)}</td>
    <td class="mono" style="color:var(--muted);white-space:nowrap">${relTime(g.lastAt)}</td>
  </tr>`).join('');

  return `
<div class="pg-title">Ao vivo</div>
<div class="pg-sub">Espelho do seu farme no PC — os drops com valor cadastrado aparecem aqui em poucos segundos, dá pra acompanhar do celular. O PC precisa estar com o FarmHub aberto e o arquivo conectado.</div>

${activeDgBanner}
<div class="g3" style="margin-bottom:12px">
  <div class="kpi"><div class="kpi-lbl">Status</div><div class="kpi-val" style="font-size:15px;line-height:1.4">${status}</div></div>
  <div class="kpi"><div class="kpi-lbl">Valor recente</div><div class="kpi-val" style="color:${getAlzTierColor(total)}" title="${formatNumber(total)} Alz">${formatAlzGamer(total)}</div><div class="kpi-sub">${grouped.length} item(ns) distinto(s)</div></div>
</div>

<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-broadcast"></i>Drops recentes (agrupados)</div></div>
  ${!grouped.length
    ? '<div class="empty" style="padding:40px">Nenhum drop ainda. Assim que cair algo com valor cadastrado no PC farmando, aparece aqui em poucos segundos.</div>'
    : `<table><thead><tr><th>Item</th><th>Valor total</th><th>Última vez</th></tr></thead><tbody>${rows}</tbody></table>`}
</div>
<div style="font-size:11px;color:var(--muted);margin-top:10px"><i class="ti ti-info-circle"></i> Só entram itens com valor cadastrado em Cálculo de farme, agrupados por item, e o feed guarda só as últimas horas — é um espelho ao vivo, não o histórico completo (esse fica no Relatório).</div>`;
}
