import { AppState } from '../state/app-state.js';
import { saveAlertSettings, saveAlertHistory } from '../state/persistence.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { esc } from '../utils/escape.js';
import { renderPage } from '../router.js';
import { relayDropToTelegram, relayWatchdogToTelegram } from './telegram.js';

let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

// Bipe curto sintetizado via Web Audio — som padrão de todo alerta enquanto não tiver som
// customizado (upload do admin, ver playThemedSound abaixo). Precisa de um gesto do usuário
// na página antes de tocar (política de autoplay do navegador); ver unlockAlertAudio() em main.js.
export function playAlertBeep(volume) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = Math.max(0, Math.min(1, volume));
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.18);
  } catch {
    // Web Audio indisponível/bloqueado — o alerta visual continua funcionando normalmente
  }
}

// Toca o som customizado enviado pelo admin (ver upload-alert-sound.php) pro tipo de alerta
// (tg/worldboss/watchdog), ou o bipe padrão se ninguém subiu nada ainda (ou o arquivo sumiu
// do servidor no meio do caminho).
export function playThemedSound(alertType, volume) {
  const sound = AppState.alertSounds?.[alertType];
  if (sound?.filename) {
    try {
      const audio = new Audio('uploads/sounds/' + sound.filename);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(() => {});
      return;
    } catch {
      // arquivo inválido/removido — cai pro bipe padrão abaixo
    }
  }
  playAlertBeep(volume);
}

export function unlockAlertAudio() {
  getAudioContext()?.resume();
}

// Notificação do SO: prioriza o Service Worker (registration.showNotification), que continua
// entregando com a aba em outra janela ou o navegador MINIMIZADO — diferente do Notification()
// direto da página, que vários navegadores suprimem nesse cenário (principalmente em PWA
// instalado), o que fazia o aviso de "farme parado" não aparecer fora da aba em foco mesmo com
// a permissão concedida. Reaproveita o mesmo Service Worker já registrado pro OneSignal — não
// precisa de nada novo no arquivo dele. Cai pro Notification() direto só se o SW não responder
// rápido (timeout de 2s) ou não existir.
async function notifyOS(title, options) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker?.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // Service Worker indisponível/lento/erro — cai pro Notification() direto abaixo
  }
  try {
    new Notification(title, options);
  } catch {
    // navegador pode recusar Notification em alguns contextos — o toast já cobriu o aviso
  }
}

// alertType (opcional) escolhe o som customizado do tipo em vez do bipe padrão — usado só
// pelo watchdog hoje (ver fireWatchdogAlert), alertas de item rastreado continuam no bipe.
function showAlertToast(entry, alertType = null) {
  const container = document.getElementById('alertToastContainer');
  if (!container) return;

  const toastEl = document.createElement('div');
  toastEl.className = 'alert-toast';
  toastEl.innerHTML = `
    <i class="ti ti-bell-ringing" style="color:var(--acc);flex-shrink:0;margin-top:1px"></i>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(entry.itemName)}</div>
      <div style="font-size:11px;color:var(--muted)">Palavra: ${esc(entry.keyword)}${entry.quantity > 1 ? ' • ' + entry.quantity + 'x' : ''}</div>
    </div>
    <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0" onclick="this.closest('.alert-toast').remove()"><i class="ti ti-x"></i></button>`;
  container.appendChild(toastEl);

  const settings = AppState.alertSettings;
  let soundInterval = null;
  const playSound = () => (alertType ? playThemedSound(alertType, settings.volume) : playAlertBeep(settings.volume));
  if (settings.soundEnabled) {
    playSound();
    if (settings.repeatSoundWhileOpen) soundInterval = setInterval(playSound, 1200);
  }

  setTimeout(() => {
    if (soundInterval) clearInterval(soundInterval);
    toastEl.remove();
  }, Math.max(1, settings.popupDurationSeconds) * 1000);
}

function fireAlert(entry, alertType = null) {
  showAlertToast(entry, alertType);
  notifyOS('Drop rastreado: ' + entry.itemName, { body: 'Palavra: ' + entry.keyword, tag: entry.id });
}

// O volume de TG/World Boss é global (o admin escolhe em AppState.alertSounds, mesmo card do
// print) — diferente de popupDurationSeconds/soundEnabled, que continuam pessoais.
function showEventToast(eventType, time) {
  const container = document.getElementById('alertToastContainer');
  if (!container) return;

  const isTg = eventType === 'tg';
  const label = isTg ? 'TG' : 'World Boss';
  const icon = isTg ? 'ti-sword' : 'ti-skull';

  const toastEl = document.createElement('div');
  toastEl.className = 'alert-toast';
  toastEl.innerHTML = `
    <i class="ti ${icon}" style="color:var(--gold);flex-shrink:0;margin-top:1px"></i>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px">${label} às ${time}!</div>
      <div style="font-size:11px;color:var(--muted)">Hora de entrar.</div>
    </div>
    <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0" onclick="this.closest('.alert-toast').remove()"><i class="ti ti-x"></i></button>`;
  container.appendChild(toastEl);

  const settings = AppState.alertSettings;
  const volume = AppState.alertSounds?.[eventType]?.volume ?? 0.9;
  let soundInterval = null;
  if (settings.soundEnabled) {
    playThemedSound(eventType, volume);
    if (settings.repeatSoundWhileOpen) soundInterval = setInterval(() => playThemedSound(eventType, volume), 1200);
  }

  setTimeout(() => {
    if (soundInterval) clearInterval(soundInterval);
    toastEl.remove();
  }, Math.max(1, settings.popupDurationSeconds) * 1000);
}

// Chamada por event-schedule.js quando um horário cadastrado (TG/World Boss) chega.
export function fireEventAlert(eventType, time) {
  showEventToast(eventType, time);
  const label = eventType === 'tg' ? 'TG' : 'World Boss';
  notifyOS(`${label} às ${time}!`, { body: 'Hora de entrar.', tag: 'event-' + eventType + '-' + time });
}

function registerAlert(keyword, drop) {
  const groupKey = keyword + '|' + drop.name;
  const now = Date.now();
  const windowMs = Math.max(0, AppState.alertSettings.groupingWindowSeconds) * 1000;
  const pending = AppState.pendingAlertGroups[groupKey];

  // Dentro da janela anti-spam: só incrementa a quantidade do alerta já disparado, sem
  // gerar um novo toast/som/notificação pra cada drop repetido do mesmo item.
  if (pending && now - pending.lastSeenAt < windowMs) {
    const entry = AppState.alertHistory.find(e => e.id === pending.entryId);
    if (entry) entry.quantity++;
    pending.lastSeenAt = now;
    saveAlertHistory();
    if (AppState.currentPage === 'alertas') renderPage();
    return;
  }

  const entry = {
    id: 'a' + now + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    itemName: drop.name,
    keyword,
    quantity: 1,
    seen: false,
  };
  AppState.alertHistory.push(entry);
  AppState.pendingAlertGroups[groupKey] = { entryId: entry.id, lastSeenAt: now };
  saveAlertHistory();
  fireAlert(entry);
  // Repassa pro Telegram só neste ramo (alerta novo) — no ramo anti-spam acima o item repetido
  // só incrementa a contagem, sem gerar novo aviso, aqui ou lá.
  relayDropToTelegram(entry);
  if (AppState.currentPage === 'alertas') renderPage();
}

// Chamado com drops recém-chegados (poll do arquivo ao vivo, item manual) — nunca com uma
// recarga completa do histórico, senão qualquer upload de log dispararia milhares de alertas.
export function processNewDropsForAlerts(drops) {
  if (!AppState.alertSettings.enabled || !drops.length) return;
  const activeKeywords = AppState.trackedKeywords.filter(kw => kw.alertEnabled);
  if (!activeKeywords.length) return;

  drops.forEach(drop => {
    const normalizedName = normalizeForSearch(drop.name);
    const matched = activeKeywords.find(kw => normalizedName.includes(normalizeForSearch(kw.word)));
    if (matched) registerAlert(matched.word, drop);
  });
}

function fireWatchdogAlert(itemName, keyword) {
  const entry = {
    id: 'w' + Date.now() + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    itemName,
    keyword,
    quantity: 1,
    seen: false,
  };
  AppState.alertHistory.push(entry);
  saveAlertHistory();
  fireAlert(entry, 'watchdog');
  // Manda o mesmo aviso pro Telegram (se ligado + vinculado) — pra saber que o helper travou
  // mesmo longe do PC. itemName aqui já é a frase descritiva ("Sem nenhum drop há X min...").
  relayWatchdogToTelegram(itemName);
  if (AppState.currentPage === 'alertas') renderPage();
}

// Atualiza os "relógios" de última vez visto — chamado com os drops recém-chegados do poll ao
// vivo (nunca com uma recarga completa, senão qualquer upload resetaria os relógios pra datas
// do passado). "Qualquer drop" e "por palavra rastreada" são relógios independentes.
export function recordDropActivity(drops) {
  if (!drops.length) return;
  const now = Date.now();
  AppState.lastAnyDropAt = now;
  AppState.lastNoDropAlertAt = null;

  const activeKeywords = AppState.trackedKeywords.filter(kw => kw.alertEnabled);
  drops.forEach(drop => {
    const normalizedName = normalizeForSearch(drop.name);
    activeKeywords.forEach(kw => {
      if (normalizedName.includes(normalizeForSearch(kw.word))) {
        AppState.lastSeenByKeyword[kw.word] = now;
        delete AppState.staleKeywordAlerted[kw.word];
      }
    });
  });
}

// Disparado a cada "heartbeat" do worker (a cada ~5s, inclusive com a aba em segundo plano) —
// avalia se faz tempo demais sem nenhum drop, ou sem um item rastreado específico, e alerta
// uma vez por período de silêncio (não repete a cada heartbeat enquanto continuar parado).
export function checkDropWatchdog() {
  if (!AppState.alertSettings.enabled || !AppState.alertSettings.watchdogEnabled || !AppState.liveFileHandle) return;
  const now = Date.now();

  if (!AppState.lastAnyDropAt) {
    AppState.lastAnyDropAt = now;
  } else {
    const noDropMs = Math.max(1, AppState.alertSettings.noDropThresholdMinutes) * 60000;
    const stalledMs = now - AppState.lastAnyDropAt;
    // Repete o aviso a cada intervalo do limite enquanto continuar parado (em vez de avisar uma
    // vez só) — assim não se perde o alerta se não viu na hora, e o Telegram segue chegando até
    // voltar a dropar. lastNoDropAlertAt zera quando cai um drop (recordDropActivity).
    if (stalledMs > noDropMs && (!AppState.lastNoDropAlertAt || now - AppState.lastNoDropAlertAt >= noDropMs)) {
      AppState.lastNoDropAlertAt = now;
      fireWatchdogAlert(`Sem nenhum drop há ${Math.round(stalledMs / 60000)} min — confere se o helper travou`, 'watchdog');
    }
  }

  const itemMs = Math.max(1, AppState.alertSettings.itemSilenceThresholdMinutes) * 60000;
  AppState.trackedKeywords.filter(kw => kw.alertEnabled).forEach(kw => {
    if (AppState.staleKeywordAlerted[kw.word]) return;
    const lastSeen = AppState.lastSeenByKeyword[kw.word];
    if (!lastSeen) {
      AppState.lastSeenByKeyword[kw.word] = now;
      return;
    }
    if (now - lastSeen > itemMs) {
      AppState.staleKeywordAlerted[kw.word] = true;
      fireWatchdogAlert(`Sem dropar "${kw.word}" há ${AppState.alertSettings.itemSilenceThresholdMinutes} min`, kw.word);
    }
  });
}

// Toast comemorativo da meta de farme batida (ver farm-goal.js) — visual próprio (alvo dourado),
// som padrão, e notificação do SO quando autorizada (o "push" do parabéns, com o app aberto).
export function showGoalToast(title, body) {
  const container = document.getElementById('alertToastContainer');
  if (container) {
    const toastEl = document.createElement('div');
    toastEl.className = 'alert-toast';
    toastEl.innerHTML = `
      <i class="ti ti-target" style="color:var(--gold);flex-shrink:0;margin-top:1px"></i>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${title}</div>
        <div style="font-size:11px;color:var(--muted)">${body}</div>
      </div>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0" onclick="this.closest('.alert-toast').remove()"><i class="ti ti-x"></i></button>`;
    container.appendChild(toastEl);
    const settings = AppState.alertSettings;
    if (settings.soundEnabled) playAlertBeep(settings.volume);
    setTimeout(() => toastEl.remove(), Math.max(1, settings.popupDurationSeconds) * 1000);
  }
  notifyOS(title, { body, tag: 'farm-goal' });
}

// Toast curtinho de confirmação (ex: "Nick copiado") — só visual, sem som nem notificação do SO.
export function showInfoToast(text) {
  const container = document.getElementById('alertToastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'alert-toast';
  el.innerHTML = `<i class="ti ti-check" style="color:var(--ok);flex-shrink:0;margin-top:1px"></i><div style="flex:1;min-width:0;font-size:13px">${esc(text)}</div>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

export function testNotification() {
  fireAlert({ id: 'test-' + Date.now(), timestamp: new Date().toISOString(), itemName: 'Item de teste', keyword: 'teste', quantity: 1, seen: false });
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  try {
    await Notification.requestPermission();
  } catch {
    // usuário negou ou navegador bloqueou — segue só com toast/som, sem notificação do SO
  }
  renderPage();
}

export function markAllAlertsSeen() {
  AppState.alertHistory.forEach(e => (e.seen = true));
  saveAlertHistory();
  renderPage();
}

export function clearAlertHistory() {
  if (!confirm('Limpar todo o histórico de alertas?')) return;
  AppState.alertHistory = [];
  AppState.pendingAlertGroups = {};
  saveAlertHistory();
  renderPage();
}

export function setAlertHistoryFilter(value) {
  AppState.alertHistoryFilter = value;
  renderPage();
}

export function getFilteredAlertHistory() {
  let history = [...AppState.alertHistory].reverse();
  if (AppState.alertHistoryFilter) {
    const query = normalizeForSearch(AppState.alertHistoryFilter);
    history = history.filter(e => normalizeForSearch(e.itemName).includes(query) || normalizeForSearch(e.keyword).includes(query));
  }
  return history;
}

export function setAlertsEnabled(checked) {
  AppState.alertSettings.enabled = checked;
  saveAlertSettings();
  renderPage();
}

export function setWatchdogEnabled(checked) {
  AppState.alertSettings.watchdogEnabled = checked;
  // Ligar o watchdog no meio de uma sessão não deveria contar o tempo parado de antes —
  // reseta o relógio pra agora, mesmo padrão de startLiveFilePolling() em file-source.js.
  if (checked) {
    AppState.lastAnyDropAt = null;
    AppState.lastNoDropAlertAt = null;
    AppState.lastSeenByKeyword = {};
    AppState.staleKeywordAlerted = {};
  }
  saveAlertSettings();
  renderPage();
}

export function setTgNotificationsEnabled(checked) {
  AppState.alertSettings.tgNotificationsEnabled = checked;
  saveAlertSettings();
  renderPage();
}

export function setWorldbossNotificationsEnabled(checked) {
  AppState.alertSettings.worldbossNotificationsEnabled = checked;
  saveAlertSettings();
  renderPage();
}

export function setTelegramDropRelayEnabled(checked) {
  AppState.alertSettings.telegramDropRelayEnabled = checked;
  saveAlertSettings();
  renderPage();
}

export function setTelegramWatchdogRelayEnabled(checked) {
  AppState.alertSettings.telegramWatchdogRelayEnabled = checked;
  saveAlertSettings();
  renderPage();
}

export function setAlertSoundEnabled(checked) {
  AppState.alertSettings.soundEnabled = checked;
  saveAlertSettings();
  renderPage();
}

export function setAlertRepeatSound(checked) {
  AppState.alertSettings.repeatSoundWhileOpen = checked;
  saveAlertSettings();
}

export function setAlertVolume(value) {
  AppState.alertSettings.volume = Math.max(0, Math.min(1, +value));
  saveAlertSettings();
  const label = document.getElementById('alertVolumeLabel');
  if (label) label.textContent = Math.round(AppState.alertSettings.volume * 100) + '%';
}

export function setAlertPopupDuration(value) {
  AppState.alertSettings.popupDurationSeconds = Math.max(1, parseInt(value) || 1);
  saveAlertSettings();
}

export function setAlertGroupingWindow(value) {
  AppState.alertSettings.groupingWindowSeconds = Math.max(0, parseInt(value) || 0);
  saveAlertSettings();
}

export function setNoDropThresholdMinutes(value) {
  AppState.alertSettings.noDropThresholdMinutes = Math.max(1, parseInt(value) || 1);
  saveAlertSettings();
}

export function setItemSilenceThresholdMinutes(value) {
  AppState.alertSettings.itemSilenceThresholdMinutes = Math.max(1, parseInt(value) || 1);
  saveAlertSettings();
}
