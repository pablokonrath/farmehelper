import { AppState } from '../state/app-state.js';
import { formatAlzGamer, getAlzTierColor, renderAlzValue, formatNumber } from '../utils/formatting.js';
import { esc } from '../utils/escape.js';

// "há Xs / Xmin / Xh" a partir do horário do drop no log.
function relTime(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  return `há ${Math.floor(m / 60)}h`;
}

export function renderLivePage() {
  const drops = AppState.liveDrops || [];
  const newestAt = drops.length ? drops[drops.length - 1].droppedAt : 0;
  // "Ao vivo" mesmo = último drop caiu há menos de 3 min. Depois disso, ou o farme parou ou o PC
  // foi fechado (é ele quem lê o log e empurra) — não dá pra distinguir os dois daqui.
  const fresh = newestAt && (Date.now() - newestAt) < 3 * 60 * 1000;
  const total = drops.reduce((sum, d) => sum + d.alz * d.quantity, 0);

  const status = !drops.length
    ? '<span style="color:var(--muted)"><i class="ti ti-broadcast-off"></i> Aguardando drops…</span>'
    : fresh
      ? '<span style="color:var(--ok)"><i class="ti ti-broadcast"></i> Recebendo ao vivo</span>'
      : '<span style="color:var(--warn)"><i class="ti ti-broadcast-off"></i> Sem drops recentes — farme parado ou PC fechado</span>';

  const rows = [...drops].reverse().map(d => `<tr>
    <td style="font-weight:500">${esc(d.name)}${d.quantity > 1 ? ` <span style="color:var(--muted)">${d.quantity}×</span>` : ''}</td>
    <td style="font-weight:600">${renderAlzValue(d.alz * d.quantity)}</td>
    <td class="mono" style="color:var(--muted);white-space:nowrap">${relTime(d.droppedAt)}</td>
  </tr>`).join('');

  return `
<div class="pg-title">Ao vivo</div>
<div class="pg-sub">Espelho do seu farme no PC — os drops com valor cadastrado aparecem aqui em poucos segundos, dá pra acompanhar do celular. O PC precisa estar com o FarmHub aberto e o arquivo conectado.</div>

<div class="g3" style="margin-bottom:12px">
  <div class="kpi"><div class="kpi-lbl">Status</div><div class="kpi-val" style="font-size:15px;line-height:1.4">${status}</div></div>
  <div class="kpi"><div class="kpi-lbl">Valor recente</div><div class="kpi-val" style="color:${getAlzTierColor(total)}" title="${formatNumber(total)} Alz">${formatAlzGamer(total)}</div><div class="kpi-sub">${drops.length} drop(s) nas últimas horas</div></div>
</div>

<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-broadcast"></i>Drops recentes</div></div>
  ${!drops.length
    ? '<div class="empty" style="padding:40px">Nenhum drop ainda. Assim que cair algo com valor cadastrado no PC farmando, aparece aqui em poucos segundos.</div>'
    : `<table><thead><tr><th>Item</th><th>Valor</th><th>Quando</th></tr></thead><tbody>${rows}</tbody></table>`}
</div>
<div style="font-size:11px;color:var(--muted);margin-top:10px"><i class="ti ti-info-circle"></i> Só entram itens com valor cadastrado em Cálculo de farme, e o feed guarda só as últimas horas — é um espelho ao vivo, não o histórico completo (esse fica no Relatório).</div>`;
}
