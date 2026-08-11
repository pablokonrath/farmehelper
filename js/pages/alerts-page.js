import { AppState } from '../state/app-state.js';
import { getFilteredAlertHistory } from '../features/alerts.js';
import { countKeywordMatches } from '../features/keywords.js';
import { formatDateTimeBR } from '../utils/formatting.js';
import { esc, escAttr } from '../utils/escape.js';

// Uma linha "toggle" padrão (título + descrição à esquerda, interruptor à direita). `extra` entra
// no style do container (ex: borda, opacidade quando desabilitado).
function toggleRow(title, desc, checked, onchange, { disabled = false, extra = '' } = {}) {
  return `
  <div class="sh" style="padding:10px 0${extra}">
    <div><div style="font-weight:600;font-size:13px">${title}</div><div style="font-size:11px;color:var(--muted)">${desc}</div></div>
    <label class="tgl"><input type="checkbox" aria-label="${title}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="${onchange}"><div class="tgl-track"></div><div class="tgl-thumb"></div></label>
  </div>`;
}

// Atalho pro admin mestre editar a agenda de eventos e os sons sem sair da página de Alertas —
// mesma lista/funções globais de antes (a página Admin em si foi removida), só reposicionadas
// aqui do lado do que elas configuram.
const EVENT_TYPE_INFO = {
  tg: { title: 'TG (Chifre Viking)', icon: 'ti-sword' },
  worldboss: { title: 'World Boss (Tambor)', icon: 'ti-skull' },
};

function renderEventTypeCard(eventType) {
  const { title, icon } = EVENT_TYPE_INFO[eventType];
  const sound = AppState.alertSounds[eventType] || { filename: null, volume: 0.9 };
  const times = AppState.eventSchedule[eventType] || [];
  return `
<div class="card" style="flex:1;min-width:280px">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ${icon}"></i>${title}</div>
  <button class="btn btn-d btn-xs" onclick="testAlertSound('${eventType}')"><i class="ti ti-player-play"></i>Testar som</button></div>
  <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Som: ${sound.filename ? sound.filename : 'padrão (bipe) — envie um som no card "Sons dos alertas" abaixo'}</div>
  <label class="lbl">Volume do alerta</label>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <input type="range" min="0" max="1" step="0.05" value="${sound.volume}" oninput="setAlertSoundVolume('${eventType}', this.value)" style="flex:1;accent-color:var(--acc)">
    <span id="soundVolumeLabel-${eventType}" style="font-size:12px;color:var(--muted);width:36px;text-align:right">${Math.round(sound.volume * 100)}%</span>
  </div>
  <label class="lbl">Adicionar horário</label>
  <div class="row" style="margin-bottom:10px">
    <input class="inp" id="newEventTime-${eventType}" type="text" inputmode="numeric" placeholder="HH:MM" onfocus="this.value = this.value.replace(/\\D/g,'')" oninput="this.value = maskTimeInputBR(this.value)">
    <button class="btn btn-p" onclick="addEventTime('${eventType}')"><i class="ti ti-plus"></i>Adicionar</button>
  </div>
  ${!times.length ? '<div class="empty" style="padding:10px 0">Nenhum horário cadastrado.</div>' : `
  <div style="display:flex;flex-wrap:wrap;gap:6px">
  ${times.map(t => `<span class="badge badge-acc" style="display:flex;align-items:center;gap:6px">${t.time}<button aria-label="Remover horário ${t.time}" style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0;display:flex" onclick="removeEventTime(${t.id})"><i class="ti ti-x"></i></button></span>`).join('')}
  </div>`}
</div>`;
}

function renderEventScheduleManagerCard() {
  if (!AppState.isMasterAdmin) return '';
  return `
<div class="card">
  <div class="ctitle" style="margin-bottom:4px"><i class="ti ti-calendar-cog"></i>Gerenciar horários (admin mestre)</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Edita a agenda global — vale pra todo mundo, não só pra você.</div>
  <div style="display:flex;gap:12px;flex-wrap:wrap">
    ${renderEventTypeCard('tg')}
    ${renderEventTypeCard('worldboss')}
  </div>
</div>`;
}

const ALERT_SOUND_LABELS = {
  tg: 'TG',
  worldboss: 'World Boss',
  watchdog: 'Inatividade (watchdog)',
};

function renderAlertSoundsCard() {
  if (!AppState.isMasterAdmin) return '';
  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-volume"></i>Sons dos alertas (admin mestre)</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Envie um .mp3/.wav/.ogg (até 2MB) pra substituir o bipe padrão de cada alerta — vale pra todo mundo.</div>
  ${Object.entries(ALERT_SOUND_LABELS).map(([type, label]) => {
    const sound = AppState.alertSounds[type] || { filename: null };
    return `
  <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
    <div style="min-width:150px;font-weight:600;font-size:13px">${label}</div>
    <div style="font-size:11px;color:var(--muted);flex:1;min-width:100px">${sound.filename ? sound.filename : 'Padrão (bipe)'}</div>
    <input type="file" id="soundFile-${type}" accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg" style="font-size:11px;max-width:180px">
    <button class="btn btn-d btn-xs" onclick="uploadAlertSound('${type}')"><i class="ti ti-upload"></i>Enviar</button>
    <button class="btn btn-d btn-xs" onclick="testAlertSound('${type}')"><i class="ti ti-player-play"></i>Testar</button>
    ${sound.filename ? `<button class="btn btn-xs" aria-label="Remover som de ${label}" title="Remover som" style="background:var(--err-bg);color:var(--err);border:none" onclick="removeAlertSound('${type}')"><i class="ti ti-trash"></i></button>` : ''}
  </div>
  <div id="soundError-${type}" style="display:none;color:var(--err);font-size:12px;margin:4px 0"></div>`;
  }).join('')}
</div>`;
}

export function renderAlertsPage() {
  const s = AppState.alertSettings;
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const activeAlertCount = AppState.trackedKeywords.filter(kw => kw.alertEnabled).length;
  const history = getFilteredAlertHistory();
  const linked = !!s.telegramChatId;
  const div = 'border-bottom:1px solid var(--border)';

  const permissionBanner = permission === 'unsupported'
    ? `<div class="notice"><i class="ti ti-alert-circle" style="flex-shrink:0;margin-top:1px"></i><div>Seu navegador não suporta notificações do sistema. Os alertas continuam funcionando com som e pop-up dentro da aba.</div></div>`
    : permission !== 'granted'
      ? `<div class="notice"><i class="ti ti-alert-triangle" style="flex-shrink:0;margin-top:1px"></i><div>Para exibir alertas mesmo com outra aba ativa, autorize as notificações deste site.<div style="margin-top:8px"><button class="btn btn-p" onclick="requestNotificationPermission()"><i class="ti ti-bell-plus"></i>Autorizar notificações</button></div></div></div>`
      : '';

  // 1) Alertas de itens rastreados (o núcleo)
  const coreCard = `
<div class="card card-featured">
  <div class="ctitle"><i class="ti ti-bell"></i>Alertas de itens rastreados</div>
  <div class="pg-sub" style="margin:-4px 0 10px">Som + pop-up + notificação do sistema quando cai um item rastreado, mesmo com a aba em segundo plano.</div>
  ${toggleRow('Ativar alertas', 'Interruptor geral — desligado, nada dispara.', s.enabled, 'setAlertsEnabled(this.checked)', { extra: ';' + div })}
  ${toggleRow('Ativar som', 'Reproduz um bipe curto ao emitir a notificação.', s.soundEnabled, 'setAlertSoundEnabled(this.checked)', { extra: ';' + div })}
  ${toggleRow('Repetir som enquanto o pop-up estiver aberto', 'Toca o som em loop até o pop-up fechar.', s.repeatSoundWhileOpen, 'setAlertRepeatSound(this.checked)', { extra: ';' + div })}
  <div style="padding:14px 0 4px"><label class="lbl">Volume do alerta</label>
    <div style="display:flex;align-items:center;gap:10px">
      <input type="range" min="0" max="1" step="0.05" value="${s.volume}" oninput="setAlertVolume(this.value)" style="flex:1;accent-color:var(--acc)">
      <span id="alertVolumeLabel" style="font-size:12px;color:var(--muted);width:36px;text-align:right">${Math.round(s.volume * 100)}%</span>
    </div>
  </div>
  <div class="g3" style="padding-top:10px">
    <div><label class="lbl">Tempo de exibição do pop-up (segundos)</label><input class="inp" type="number" min="1" value="${s.popupDurationSeconds}" onchange="setAlertPopupDuration(this.value)"></div>
    <div style="grid-column:span 2"><label class="lbl">Anti-spam: agrupar repetições em (segundos)</label><input class="inp" type="number" min="0" value="${s.groupingWindowSeconds}" onchange="setAlertGroupingWindow(this.value)">
    <div class="hint">Se o mesmo item cair várias vezes dentro deste intervalo, gera uma única notificação agrupada.</div></div>
  </div>
  <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
    <button class="btn btn-d" onclick="testNotification()"><i class="ti ti-player-play"></i>Testar notificação</button>
    <span style="font-size:12px;color:var(--muted)">Palavras com alerta ativo: <strong>${activeAlertCount}</strong> de ${AppState.trackedKeywords.length}</span>
  </div>
</div>`;

  // 1.5) Palavras rastreadas — gerenciar direto aqui (o filtro "mostrar só rastreados" continua em
  // Cálculo de farme, é sobre a lista de drops daquela página, não sobre alerta — mas gerenciar as
  // palavras em si mora só aqui agora, junto do que elas efetivamente acionam).
  const trackedWordsCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-tags"></i>Palavras rastreadas</div>
  <div class="pg-sub" style="margin:-4px 0 10px">O que aciona os alertas acima — liga o sininho de uma palavra pra ser avisado quando um item com esse nome cair.</div>
  ${!AppState.trackedKeywords.length ? '<div class="empty" style="padding:14px 0">Nenhuma palavra rastreada ainda.</div>' : `
  <table style="margin-bottom:12px"><thead><tr><th>Palavra rastreada</th><th style="width:110px"><i class="ti ti-bell"></i> Alerta</th><th style="width:40px">Ações</th></tr></thead><tbody>
  ${AppState.trackedKeywords.map(kw => {
    const matches = countKeywordMatches(kw.word);
    return `<tr>
    <td style="font-weight:500">${esc(kw.word)}${matches === 0
      ? ` <i class="ti ti-alert-triangle" style="color:var(--warn)" title="Nenhum item já dropado bate com essa palavra — confira se não é erro de digitação, ou se o item simplesmente ainda não caiu"></i>`
      : ` <span style="font-size:11px;color:var(--muted)" title="Itens distintos já dropados que contêm essa palavra">(${matches} ite${matches > 1 ? 'ns' : 'm'})</span>`}</td>
    <td><label class="tgl"><input type="checkbox" aria-label="Alerta pra ${esc(kw.word)}" ${kw.alertEnabled ? 'checked' : ''} onchange="toggleKeywordAlert('${escAttr(kw.word)}')"><div class="tgl-track"></div><div class="tgl-thumb"></div></label> <span style="font-size:11px;color:var(--muted)">${kw.alertEnabled ? 'ON' : 'OFF'}</span></td>
    <td><button aria-label="Remover palavra ${esc(kw.word)}" title="Remover" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeTrackedKeyword('${escAttr(kw.word)}')"><i class="ti ti-x"></i></button></td>
  </tr>`;
  }).join('')}
  </tbody></table>`}
  <div class="row">
    <div style="flex:1"><label class="lbl">Adicionar palavra</label><input class="inp" id="nKw" placeholder="ex: Fatal" onkeydown="if(event.key==='Enter')addTrackedKeyword()"></div>
    <button class="btn btn-p" onclick="addTrackedKeyword()"><i class="ti ti-plus"></i>Adicionar</button>
    <button class="btn btn-d" onclick="resetTrackedKeywords()">Restaurar padrão</button>
  </div>
  <div style="font-size:11px;color:var(--muted);margin-top:8px"><i class="ti ti-info-circle"></i> Pra ver só os drops rastreados na lista de itens (sem mexer no alerta), tem um filtro separado em <a href="#" onclick="navigateTo('calculo');return false" style="color:var(--acc)">Cálculo de farme</a>.</div>
</div>`;

  // 2) Watchdog — agora 100% automático com a sessão de DG (sem interruptor manual). Aqui ficam
  // só os limites e o aviso de travamento no Telegram.
  const watchdogRelayHint = !linked
    ? 'Vincule o Telegram (na seção “Fora do app”) primeiro.'
    : 'Se o helper travar, ou a conexão ao vivo precisar reconectar, chega no Telegram.';
  const watchdogCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-shield-bolt"></i>Vigilância de inatividade (watchdog)</div>
  <div class="pg-sub" style="margin:-4px 0 10px">Avisa quando o helper trava (sem nenhum drop) ou um item rastreado some. <strong>Liga e desliga sozinho</strong> junto com a sessão de DG — você não ativa nada. (Farme na mão não gera log, então não faz sentido vigiar fora de uma sessão.)</div>
  <div class="g3">
    <div><label class="lbl">Alertar sem nenhum drop por (minutos)</label><input class="inp" type="number" min="1" value="${s.noDropThresholdMinutes}" onchange="setNoDropThresholdMinutes(this.value)">
    <div class="hint">Silêncio total é forte indício de que o helper travou.</div></div>
    <div style="grid-column:span 2"><label class="lbl">Alertar sem dropar um item rastreado por (minutos)</label><input class="inp" type="number" min="1" value="${s.itemSilenceThresholdMinutes}" onchange="setItemSilenceThresholdMinutes(this.value)">
    <div class="hint">Item específico (ex: joia) pode demorar mais — use um limite mais alto que o de cima.</div></div>
  </div>
  ${toggleRow('Avisar travamento/desconexão no Telegram', watchdogRelayHint, s.telegramWatchdogRelayEnabled, 'setTelegramWatchdogRelayEnabled(this.checked)', { disabled: !linked, extra: ';border-top:1px solid var(--border);margin-top:12px;padding-top:12px' + (!linked ? ';opacity:.55' : '') })}
</div>`;

  // 3) Eventos programados (TG / World Boss)
  const eventsCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-calendar-event"></i>Eventos: TG e World Boss</div>
  <div class="pg-sub" style="margin:-4px 0 10px">Horários cadastrados pelo admin — aqui você só liga/desliga se quer receber. Chegam também fora do app (ver abaixo).</div>
  ${toggleRow('Notificação de TG', 'Aviso quando chega o horário de TG.', s.tgNotificationsEnabled, 'setTgNotificationsEnabled(this.checked)', { extra: ';' + div })}
  ${toggleRow('Notificação de World Boss', 'Mesma coisa, só pro World Boss.', s.worldbossNotificationsEnabled, 'setWorldbossNotificationsEnabled(this.checked)')}
</div>`;

  // 4) Fora do app: Telegram
  const outsideCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-brand-telegram"></i>Fora do app (Telegram)</div>
  <div class="pg-sub" style="margin:-4px 0 10px">Receba avisos com o FarmHub fechado. TG/World Boss chega mesmo offline; alertas do seu próprio drop só com o app aberto (mesmo minimizado).</div>
  <div style="font-weight:600;font-size:13px;margin-bottom:6px">Telegram</div>
    ${linked
      ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span class="badge badge-ok"><i class="ti ti-check"></i> Vinculado</span>
          <button class="btn btn-d btn-xs" onclick="unlinkTelegram()"><i class="ti ti-unlink"></i>Desvincular</button>
        </div>
        ${toggleRow('Enviar drops rastreados pro Telegram', 'Quando um item rastreado cair, chega no Telegram. Só com o FarmHub aberto (mesmo minimizado).', s.telegramDropRelayEnabled, 'setTelegramDropRelayEnabled(this.checked)', { extra: ';padding-top:14px' })}
        <div style="font-size:11px;color:var(--muted);margin-top:10px">No Telegram, mande <strong>/drop</strong> pra ver os drops rastreados de hoje, ou <strong>/drop nome</strong> pra o total de um item.</div>`
      : `<button class="btn btn-d btn-xs" onclick="generateTelegramLinkCode()"><i class="ti ti-brand-telegram"></i>Gerar código de vínculo</button>
        ${AppState.telegramLinkCode ? `
        <div style="margin-top:10px;font-size:12px;color:var(--muted)">
          Abra o Telegram e clique no link abaixo (ou mande <strong>/start ${AppState.telegramLinkCode}</strong> pro bot):
          <div style="margin-top:6px"><a href="${AppState.telegramBotLink}" target="_blank" rel="noopener" style="color:var(--acc)">${AppState.telegramBotLink}</a></div>
        </div>` : ''}`}
</div>`;

  // 5) Histórico
  const historyCard = `
<div class="card">
  <div class="sh"><div class="ctitle" style="margin:0"><i class="ti ti-history"></i>Histórico de alertas</div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <input class="inp" style="width:200px" placeholder="Filtrar por item ou palavra..." value="${esc(AppState.alertHistoryFilter)}" oninput="setAlertHistoryFilter(this.value)">
    <button class="btn btn-d btn-xs" onclick="markAllAlertsSeen()"><i class="ti ti-check"></i>Marcar como visto</button>
    <button class="btn btn-xs" style="background:var(--err-bg);color:var(--err);border:none" onclick="clearAlertHistory()"><i class="ti ti-trash"></i>Limpar</button>
  </div></div>
  ${!history.length ? '<div class="empty">Nenhum alerta registrado ainda.</div>' : `
  <table><thead><tr><th>Data / Hora</th><th>Item</th><th>Palavra</th><th>Qtd.</th><th>Status</th></tr></thead><tbody>
  ${history.map(e => `<tr>
    <td>${formatDateTimeBR(e.timestamp)}</td>
    <td>${esc(e.itemName)}</td>
    <td>${esc(e.keyword)}</td>
    <td>${e.quantity}</td>
    <td>${e.seen ? '<span class="badge badge-muted">Visto</span>' : '<span class="badge badge-acc">Novo</span>'}</td>
  </tr>`).join('')}
  </tbody></table>`}
</div>`;

  return `
<div class="pg-title"><i class="ti ti-bell" style="color:var(--acc)"></i>Alertas</div>
<div class="pg-sub">Notificação em tempo real dos seus itens rastreados, vigilância do helper e eventos de TG/World Boss.</div>
${permissionBanner}
${coreCard}
${trackedWordsCard}
${watchdogCard}
${eventsCard}
${outsideCard}
${renderEventScheduleManagerCard()}
${renderAlertSoundsCard()}
${historyCard}`;
}
