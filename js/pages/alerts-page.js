import { AppState } from '../state/app-state.js';
import { getFilteredAlertHistory } from '../features/alerts.js';
import { countKeywordMatches, suggestUntrackedValuableItems } from '../features/keywords.js';
import { getAllDrops, summarizeDropsByItem } from '../features/drops.js';
import { DAILY_RUN_LIMIT } from '../features/dg-session.js';
import { collapsibleCard } from '../features/ui-toggles.js';
import { formatDateTimeBR, renderAlzValue } from '../utils/formatting.js';
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

  // Estado geral num relance — a página é toda feita de toggles espalhados em vários cards, sem
  // isso não dava pra saber "tá tudo funcionando?" sem abrir e ler cada um. Sempre visível, não
  // depende de abrir nenhum card colapsado abaixo.
  const unseenCount = AppState.alertHistory.filter(e => !e.seen).length;
  // Avisos que o Telegram pode entregar. Lista única aqui pra a faixa de status e o resumo do
  // card contarem a mesma coisa — e pra que um aviso novo no futuro apareça nos dois lugares sem
  // ninguém lembrar de atualizar contador nenhum.
  const avisosTelegram = [
    { ligado: s.telegramDropRelayEnabled, nome: 'drops rastreados' },
    { ligado: s.telegramWatchdogRelayEnabled, nome: 'travamento' },
    { ligado: s.telegramSessionRelayEnabled, nome: 'DG completa e sessão fechada' },
  ];
  const avisosTotal = avisosTelegram.length;
  const avisosLigados = avisosTelegram.filter(a => a.ligado).length;

  const statusStrip = `
<div class="card" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 16px">
  <span class="badge ${s.enabled ? 'badge-ok' : 'badge-muted'}"><i class="ti ${s.enabled ? 'ti-bell' : 'ti-bell-off'}"></i> Alertas ${s.enabled ? 'ligados' : 'desligados'}</span>
  <span class="badge ${s.watchdogEnabled ? 'badge-ok' : 'badge-muted'}"><i class="ti ti-shield-bolt"></i> Watchdog ${s.watchdogEnabled ? 'vigiando' : 'inativo'}</span>
  <span class="badge ${linked ? 'badge-ok' : 'badge-muted'}"><i class="ti ti-brand-telegram"></i> Telegram ${linked ? 'vinculado' : 'não vinculado'}</span>
  ${/* Quantos avisos do Telegram estão ligados, sempre à vista. A faixa existe justamente pra
       responder "tá tudo funcionando?" sem abrir card nenhum — e sem isso um aviso novo, que nasce
       desligado dentro de um card recolhido, não aparecia em lugar nenhum da tela. */''}
  ${!linked ? '' : `<span class="badge ${avisosLigados < avisosTotal ? 'badge-warn' : 'badge-ok'}" title="${avisosTelegram.map(a => `${a.ligado ? '✓' : '✗'} ${a.nome}`).join('\n')}"><i class="ti ti-bell-ringing"></i> ${avisosLigados}/${avisosTotal} avisos${avisosLigados < avisosTotal ? ' — tem opção desligada' : ''}</span>`}
  ${unseenCount ? `<span class="badge badge-acc" style="margin-left:auto"><i class="ti ti-mail"></i> ${unseenCount} não visto${unseenCount > 1 ? 's' : ''}</span>` : ''}
</div>`;

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
  //
  // allDroppedItems calculado UMA VEZ aqui (não dentro do .map de cada palavra) — countKeywordMatches
  // aceita a lista pronta pra não recalcular o log inteiro de drops a cada palavra rastreada.
  const allDroppedItems = summarizeDropsByItem(getAllDrops());
  const suggestions = suggestUntrackedValuableItems();
  const trackedWordsCard = `
<div class="card">
  <div class="ctitle"><i class="ti ti-tags"></i>Palavras rastreadas</div>
  <div class="pg-sub" style="margin:-4px 0 10px">O que aciona os alertas acima — liga o sininho de uma palavra pra ser avisado quando um item com esse nome cair.</div>
  ${!AppState.trackedKeywords.length ? '<div class="empty" style="padding:14px 0">Nenhuma palavra rastreada ainda.</div>' : `
  <table style="margin-bottom:12px"><thead><tr><th>Palavra rastreada</th><th style="width:110px"><i class="ti ti-bell"></i> Alerta</th><th style="width:40px">Ações</th></tr></thead><tbody>
  ${AppState.trackedKeywords.map(kw => {
    const matches = countKeywordMatches(kw.word, allDroppedItems);
    return `<tr>
    <td style="font-weight:500">${esc(kw.word)}${matches === 0
      ? ` <i class="ti ti-alert-triangle" style="color:var(--warn)" title="Nenhum item já dropado bate com essa palavra — confira se não é erro de digitação, ou se o item simplesmente ainda não caiu"></i>`
      : ` <span style="font-size:11px;color:var(--muted)" title="Itens distintos já dropados que contêm essa palavra">(${matches} ite${matches > 1 ? 'ns' : 'm'})</span>`}</td>
    <td><label class="tgl"><input type="checkbox" aria-label="Alerta pra ${esc(kw.word)}" ${kw.alertEnabled ? 'checked' : ''} onchange="toggleKeywordAlert('${escAttr(kw.word)}')"><div class="tgl-track"></div><div class="tgl-thumb"></div></label> <span style="font-size:11px;color:var(--muted)">${kw.alertEnabled ? 'ON' : 'OFF'}</span></td>
    <td><button aria-label="Remover palavra ${esc(kw.word)}" title="Remover" style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeTrackedKeyword('${escAttr(kw.word)}')"><i class="ti ti-x"></i></button></td>
  </tr>`;
  }).join('')}
  </tbody></table>`}
  ${suggestions.length ? `<div style="margin-bottom:14px;padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px"><i class="ti ti-bulb"></i> Itens valiosos que você já dropou e ainda não rastreia:</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${suggestions.map(i => `<button class="btn btn-d btn-xs" onclick="addSuggestedKeyword('${escAttr(i.name)}')" title="Rastrear &quot;${escAttr(i.name)}&quot; com alerta já ligado"><i class="ti ti-plus"></i>${esc(i.name)} <span style="color:var(--muted);margin-left:4px">${renderAlzValue(i.price)}</span></button>`).join('')}
    </div>
  </div>` : ''}
  <div class="row">
    <div style="flex:1"><label class="lbl">Adicionar palavra</label><input class="inp" id="nKw" placeholder="ex: Fatal" onkeydown="if(event.key==='Enter')addTrackedKeyword()"></div>
    <button class="btn btn-p" onclick="addTrackedKeyword()"><i class="ti ti-plus"></i>Adicionar</button>
    <button class="btn btn-d" onclick="resetTrackedKeywords()">Restaurar padrão</button>
  </div>
  <div style="font-size:11px;color:var(--muted);margin-top:8px"><i class="ti ti-info-circle"></i> Pra ver só os drops rastreados na lista de itens (sem mexer no alerta), tem um filtro separado em <a href="#" onclick="navigateTo('calculo');return false" style="color:var(--acc)">Cálculo de farme</a>.</div>
</div>`;

  // 2) Watchdog — agora 100% automático com a sessão de DG (sem interruptor manual). Aqui ficam
  // só os limites e o aviso de travamento no Telegram. Colapsado por padrão (config "set once",
  // não algo que se checa todo dia) — o resumo já mostra se tá vigiando ou não sem precisar abrir.
  const watchdogRelayHint = !linked
    ? 'Vincule o Telegram (na seção “Fora do app”) primeiro.'
    : 'Se o helper travar, ou a conexão ao vivo precisar reconectar, chega no Telegram.';
  const watchdogCard = collapsibleCard({
    id: 'alerts-watchdog',
    icon: 'ti-shield-bolt',
    title: 'Vigilância de inatividade (watchdog)',
    resumo: s.watchdogEnabled ? '<span class="badge badge-ok"><i class="ti ti-eye"></i> Vigiando agora</span>' : '<span class="badge badge-muted">Inativo</span>',
    body: `
  <div style="font-size:12px;color:var(--muted);margin:-2px 0 10px">Avisa quando o helper trava (sem nenhum drop) ou um item rastreado some. <strong>Liga e desliga sozinho</strong> junto com a sessão de DG — você não ativa nada. (Farme na mão não gera log, então não faz sentido vigiar fora de uma sessão.)</div>
  <div class="g3">
    <div><label class="lbl">Alertar sem nenhum drop por (minutos)</label><input class="inp" type="number" min="1" value="${s.noDropThresholdMinutes}" onchange="setNoDropThresholdMinutes(this.value)">
    <div class="hint">Silêncio total é forte indício de que o helper travou.</div></div>
    <div style="grid-column:span 2"><label class="lbl">Alertar sem dropar um item rastreado por (minutos)</label><input class="inp" type="number" min="1" value="${s.itemSilenceThresholdMinutes}" onchange="setItemSilenceThresholdMinutes(this.value)">
    <div class="hint">Item específico (ex: joia) pode demorar mais — use um limite mais alto que o de cima.</div></div>
  </div>
  ${toggleRow('Avisar travamento/desconexão no Telegram', watchdogRelayHint, s.telegramWatchdogRelayEnabled, 'setTelegramWatchdogRelayEnabled(this.checked)', { disabled: !linked, extra: ';border-top:1px solid var(--border);margin-top:12px;padding-top:12px' + (!linked ? ';opacity:.55' : '') })}`,
  });

  // 3) Eventos programados (TG / World Boss) — mesmo raciocínio: colapsado, resumo mostra quantos
  // dos 2 estão ligados.
  const eventsOnCount = (s.tgNotificationsEnabled ? 1 : 0) + (s.worldbossNotificationsEnabled ? 1 : 0);
  const eventsCard = collapsibleCard({
    id: 'alerts-events',
    icon: 'ti-calendar-event',
    title: 'Eventos: TG e World Boss',
    resumo: eventsOnCount ? `<span class="badge badge-ok">${eventsOnCount}/2 ativos</span>` : '<span class="badge badge-muted">Desligado</span>',
    body: `
  <div style="font-size:12px;color:var(--muted);margin:-2px 0 10px">Horários cadastrados pelo admin — aqui você só liga/desliga se quer receber. Chegam também fora do app (ver "Fora do app" abaixo).</div>
  ${toggleRow('Notificação de TG', 'Aviso quando chega o horário de TG.', s.tgNotificationsEnabled, 'setTgNotificationsEnabled(this.checked)', { extra: ';' + div })}
  ${toggleRow('Notificação de World Boss', 'Mesma coisa, só pro World Boss.', s.worldbossNotificationsEnabled, 'setWorldbossNotificationsEnabled(this.checked)')}`,
  });

  // 4) Fora do app: Telegram — colapsado só quando já vinculado (setup concluído); se ainda não
  // vinculou, fica aberto de propósito, pra não esconder um passo pendente.
  const outsideCard = collapsibleCard({
    id: 'alerts-outside',
    icon: 'ti-brand-telegram',
    title: 'Fora do app (Telegram)',
    // O resumo conta os avisos LIGADOS de um TOTAL. Antes dizia só "Vinculado", e um card
    // recolhido que não revela o que tem dentro esconde opção nova: quem já tinha vinculado o
    // Telegram nunca mais abriu esse card, e um aviso adicionado depois ficou invisível — foi
    // exatamente o que aconteceu com o de sessão. Com a contagem, opção nova (que nasce
    // desligada) muda o número de fora e aparece sem precisar abrir nada.
    resumo: !linked
      ? '<span class="badge badge-muted">Não vinculado</span>'
      : `<span class="badge badge-ok"><i class="ti ti-check"></i> Vinculado</span> <span class="badge ${avisosLigados < avisosTotal ? 'badge-warn' : 'badge-acc'}">${avisosLigados} de ${avisosTotal} avisos ligados</span>`,
    defaultOpen: !linked,
    body: `
  <div style="font-size:12px;color:var(--muted);margin:-2px 0 10px">Receba avisos com o FarmHub fechado. TG/World Boss chega mesmo offline; alertas do seu próprio drop só com o app aberto (mesmo minimizado).</div>
    ${linked
      ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span class="badge badge-ok"><i class="ti ti-check"></i> Vinculado</span>
          <button class="btn btn-d btn-xs" onclick="unlinkTelegram()"><i class="ti ti-unlink"></i>Desvincular</button>
        </div>
        ${toggleRow('Enviar drops rastreados pro Telegram', 'Quando um item rastreado cair, chega no Telegram. Só com o FarmHub aberto (mesmo minimizado).', s.telegramDropRelayEnabled, 'setTelegramDropRelayEnabled(this.checked)', { extra: ';padding-top:14px' })}
        ${toggleRow('Avisar quando a DG acabar ou a sessão fechar', `Chega no Telegram quando uma DG completa as ${DAILY_RUN_LIMIT} runs do dia — com o resumo dela e a comparação com a média — e quando uma sessão é encerrada sozinha por falta de drop, que quase sempre quer dizer que travou. São os dois momentos em que você precisa voltar pro jogo, e justamente quando não está olhando a tela.`, s.telegramSessionRelayEnabled, 'setTelegramSessionRelayEnabled(this.checked)', { extra: ';border-top:1px solid var(--border);margin-top:12px;padding-top:12px' })}
        <div style="font-size:11px;color:var(--muted);margin-top:10px">No Telegram, mande <strong>/drop</strong> pra ver os drops rastreados de hoje, ou <strong>/drop nome</strong> pra o total de um item.</div>`
      : `<button class="btn btn-d btn-xs" onclick="generateTelegramLinkCode()"><i class="ti ti-brand-telegram"></i>Gerar código de vínculo</button>
        ${AppState.telegramLinkCode ? `
        <div style="margin-top:10px;font-size:12px;color:var(--muted)">
          Abra o Telegram e clique no link abaixo (ou mande <strong>/start ${AppState.telegramLinkCode}</strong> pro bot):
          <div style="margin-top:6px"><a href="${AppState.telegramBotLink}" target="_blank" rel="noopener" style="color:var(--acc)">${AppState.telegramBotLink}</a></div>
        </div>` : ''}`}`,
  });

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
${statusStrip}
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
