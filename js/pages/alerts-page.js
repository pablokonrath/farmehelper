import { AppState } from '../state/app-state.js';
import { getFilteredAlertHistory } from '../features/alerts.js';
import { formatDateTimeBR } from '../utils/formatting.js';

export function renderAlertsPage() {
  const settings = AppState.alertSettings;
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const activeAlertCount = AppState.trackedKeywords.filter(kw => kw.alertEnabled).length;
  const history = getFilteredAlertHistory();

  return `
<div class="pg-title"><i class="ti ti-bell" style="color:var(--acc)"></i>Alertas</div>
<div class="pg-sub">Sistema de notificação em tempo real para itens rastreados. Estilo clássico de notificação, com som e pop-up mesmo com o navegador em segundo plano.</div>

${permission === 'unsupported'
  ? `<div class="notice"><i class="ti ti-alert-circle" style="flex-shrink:0;margin-top:1px"></i><div>Seu navegador não suporta notificações do sistema. Os alertas continuam funcionando com som e pop-up dentro da aba.</div></div>`
  : permission !== 'granted'
    ? `<div class="notice"><i class="ti ti-alert-triangle" style="flex-shrink:0;margin-top:1px"></i><div>Para exibir alertas mesmo com outra aba ativa, autorize as notificações deste site.<div style="margin-top:8px"><button class="btn btn-p" onclick="requestNotificationPermission()"><i class="ti ti-bell-plus"></i>Autorizar notificações</button></div></div></div>`
    : ''}

<div class="card">
  <div class="ctitle"><i class="ti ti-settings"></i>Configuração</div>
  <div class="sh" style="padding:10px 0;border-bottom:1px solid var(--border)">
    <div><div style="font-weight:600;font-size:13px">Ativar notificações</div><div style="font-size:11px;color:var(--muted)">Quando desligado, nenhum alerta é disparado.</div></div>
    <label class="tgl"><input type="checkbox" ${settings.enabled ? 'checked' : ''} onchange="setAlertsEnabled(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
  </div>
  <div class="sh" style="padding:10px 0;border-bottom:1px solid var(--border)">
    <div><div style="font-weight:600;font-size:13px">Ativar som</div><div style="font-size:11px;color:var(--muted)">Reproduz um bipe curto ao emitir a notificação.</div></div>
    <label class="tgl"><input type="checkbox" ${settings.soundEnabled ? 'checked' : ''} onchange="setAlertSoundEnabled(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
  </div>
  <div class="sh" style="padding:10px 0;border-bottom:1px solid var(--border)">
    <div><div style="font-weight:600;font-size:13px">Repetir som enquanto o pop-up estiver aberto</div><div style="font-size:11px;color:var(--muted)">Toca o som em loop até o pop-up fechar.</div></div>
    <label class="tgl"><input type="checkbox" ${settings.repeatSoundWhileOpen ? 'checked' : ''} onchange="setAlertRepeatSound(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
  </div>
  <div style="padding:14px 0 4px"><label class="lbl">Volume do alerta</label>
    <div style="display:flex;align-items:center;gap:10px">
      <input type="range" min="0" max="1" step="0.05" value="${settings.volume}" oninput="setAlertVolume(this.value)" style="flex:1;accent-color:var(--acc)">
      <span id="alertVolumeLabel" style="font-size:12px;color:var(--muted);width:36px;text-align:right">${Math.round(settings.volume * 100)}%</span>
    </div>
  </div>
  <div class="g3" style="padding-top:10px">
    <div><label class="lbl">Tempo de exibição do pop-up (segundos)</label><input class="inp" type="number" min="1" value="${settings.popupDurationSeconds}" onchange="setAlertPopupDuration(this.value)"></div>
    <div style="grid-column:span 2"><label class="lbl">Anti-spam: agrupar repetições em (segundos)</label><input class="inp" type="number" min="0" value="${settings.groupingWindowSeconds}" onchange="setAlertGroupingWindow(this.value)">
    <div class="hint">Se o mesmo item cair várias vezes dentro deste intervalo, gera uma única notificação agrupada.</div></div>
  </div>
  <div class="sh" style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;padding-bottom:10px">
    <div><div style="font-weight:600;font-size:13px">Vigilância de inatividade (watchdog)</div><div style="font-size:11px;color:var(--muted)">Ative só quando estiver rodando o helper/macro — farmar manual tem pausas normais que não são "helper travado".</div></div>
    <label class="tgl"><input type="checkbox" ${settings.watchdogEnabled ? 'checked' : ''} onchange="setWatchdogEnabled(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
  </div>
  <div class="g3" style="padding-top:12px">
    <div><label class="lbl">Alertar sem nenhum drop por (minutos)</label><input class="inp" type="number" min="1" value="${settings.noDropThresholdMinutes}" onchange="setNoDropThresholdMinutes(this.value)">
    <div class="hint">O arquivo só grava quando dropa algo, então silêncio total é forte indício de que o helper travou.</div></div>
    <div style="grid-column:span 2"><label class="lbl">Alertar sem dropar um item rastreado por (minutos)</label><input class="inp" type="number" min="1" value="${settings.itemSilenceThresholdMinutes}" onchange="setItemSilenceThresholdMinutes(this.value)">
    <div class="hint">Item específico (ex: joia) pode legitimamente demorar mais — use um limite mais alto que o de cima.</div></div>
  </div>
  <div class="sh" style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;padding-bottom:10px">
    <div><div style="font-weight:600;font-size:13px">Notificação de TG</div><div style="font-size:11px;color:var(--muted)">Horário é cadastrado pelo admin — aqui você só liga/desliga se quer receber.</div></div>
    <label class="tgl"><input type="checkbox" ${settings.tgNotificationsEnabled ? 'checked' : ''} onchange="setTgNotificationsEnabled(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
  </div>
  <div class="sh" style="padding:10px 0">
    <div><div style="font-weight:600;font-size:13px">Notificação de World Boss</div><div style="font-size:11px;color:var(--muted)">Mesma coisa, só pro World Boss.</div></div>
    <label class="tgl"><input type="checkbox" ${settings.worldbossNotificationsEnabled ? 'checked' : ''} onchange="setWorldbossNotificationsEnabled(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
  </div>
  <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
    <button class="btn btn-d" onclick="testNotification()"><i class="ti ti-player-play"></i>Testar notificação</button>
    <span style="font-size:12px;color:var(--muted)">Palavras com alerta ativo: <strong>${activeAlertCount}</strong> — <a href="#" onclick="navigateTo('calculo');return false" style="color:var(--acc)">gerenciar em Cálculo de farme</a></span>
  </div>
</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-device-mobile"></i>Notificações fora do app</div>
  <div class="pg-sub" style="margin:-4px 0 12px">Receba TG e World Boss mesmo com o DropList fechado. Só vale pra esses dois alertas por enquanto — os demais continuam só dentro do app.</div>
  <div class="sh" style="padding:10px 0;border-bottom:1px solid var(--border)">
    <div><div style="font-weight:600;font-size:13px">Notificação push do navegador</div><div style="font-size:11px;color:var(--muted)">Chega mesmo com o navegador fechado, direto no seu dispositivo.</div></div>
    <label class="tgl"><input type="checkbox" ${AppState.alertSettings.pushEnabled ? 'checked' : ''} onchange="this.checked ? enablePushNotifications() : disablePushNotifications()"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
  </div>
  <div style="padding-top:12px">
    <div style="font-weight:600;font-size:13px;margin-bottom:6px">Telegram</div>
    ${AppState.alertSettings.telegramChatId
      ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span class="badge badge-ok"><i class="ti ti-check"></i> Vinculado</span>
          <button class="btn btn-d btn-xs" onclick="unlinkTelegram()"><i class="ti ti-unlink"></i>Desvincular</button>
        </div>
        <div class="sh" style="padding:12px 0 0">
          <div><div style="font-weight:600;font-size:13px">Enviar drops rastreados pro Telegram</div><div style="font-size:11px;color:var(--muted)">Quando um item rastreado cair, chega no seu Telegram. Só funciona com o DropList aberto (mesmo minimizado).</div></div>
          <label class="tgl"><input type="checkbox" ${AppState.alertSettings.telegramDropRelayEnabled ? 'checked' : ''} onchange="setTelegramDropRelayEnabled(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
        </div>
        <div class="sh" style="padding:12px 0 0">
          <div><div style="font-weight:600;font-size:13px">Avisar quando dropar meu desejo</div><div style="font-size:11px;color:var(--muted)">Quando alguém dropar um item da sua lista de desejos, chega no Telegram com quem dropou — funciona até com o DropList fechado.</div></div>
          <label class="tgl"><input type="checkbox" ${AppState.alertSettings.telegramWishlistRelayEnabled ? 'checked' : ''} onchange="setTelegramWishlistRelayEnabled(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
        </div>
        <div class="sh" style="padding:12px 0 0">
          <div><div style="font-weight:600;font-size:13px">Avisar travamento (watchdog) no Telegram</div><div style="font-size:11px;color:var(--muted)">Se o helper travar (sem drop), chega no Telegram e segue avisando até você voltar a dropar. Precisa do watchdog ligado acima e do DropList aberto.</div></div>
          <label class="tgl"><input type="checkbox" ${AppState.alertSettings.telegramWatchdogRelayEnabled ? 'checked' : ''} onchange="setTelegramWatchdogRelayEnabled(this.checked)"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">No Telegram, mande <strong>/drop</strong> pra ver os drops rastreados de hoje, ou <strong>/drop nome</strong> pra o total de um item.</div>`
      : `<div>
          <button class="btn btn-d btn-xs" onclick="generateTelegramLinkCode()"><i class="ti ti-brand-telegram"></i>Gerar código de vínculo</button>
          ${AppState.telegramLinkCode ? `
          <div style="margin-top:10px;font-size:12px;color:var(--muted)">
            Abra o Telegram e clique no link abaixo (ou mande <strong>/start ${AppState.telegramLinkCode}</strong> pro bot):
            <div style="margin-top:6px"><a href="${AppState.telegramBotLink}" target="_blank" rel="noopener" style="color:var(--acc)">${AppState.telegramBotLink}</a></div>
          </div>` : ''}
        </div>`}
  </div>
</div>

<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-history"></i>Histórico de alertas</div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <input class="inp" style="width:200px" placeholder="Filtrar por item ou palavra..." value="${AppState.alertHistoryFilter}" oninput="setAlertHistoryFilter(this.value)">
    <button class="btn btn-d btn-xs" onclick="markAllAlertsSeen()"><i class="ti ti-check"></i>Marcar como visto</button>
    <button class="btn btn-xs" style="background:var(--err-bg);color:var(--err);border:none" onclick="clearAlertHistory()"><i class="ti ti-trash"></i>Limpar</button>
  </div></div>
  ${!history.length ? '<div class="empty">Nenhum alerta registrado ainda.</div>' : `
  <table><thead><tr><th>Data / Hora</th><th>Item</th><th>Palavra</th><th>Qtd.</th><th>Status</th></tr></thead><tbody>
  ${history.map(e => `<tr>
    <td>${formatDateTimeBR(e.timestamp)}</td>
    <td>${e.itemName}</td>
    <td>${e.keyword}</td>
    <td>${e.quantity}</td>
    <td>${e.seen ? '<span class="badge badge-muted">Visto</span>' : '<span class="badge badge-acc">Novo</span>'}</td>
  </tr>`).join('')}
  </tbody></table>`}
</div>`;
}
