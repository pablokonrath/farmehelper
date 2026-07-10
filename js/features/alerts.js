import { AppState } from '../state/app-state.js';
import { saveAlertSettings, saveAlertHistory } from '../state/persistence.js';
import { normalizeForSearch } from '../utils/parsing.js';
import { renderPage } from '../router.js';

let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

// Bipe curto sintetizado via Web Audio — evita depender de um arquivo de áudio externo,
// já que o projeto não tem pipeline de assets. Precisa de um gesto do usuário na página
// antes de tocar (política de autoplay do navegador); ver unlockAlertAudio() em main.js.
function playAlertBeep(volume) {
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

export function unlockAlertAudio() {
  getAudioContext()?.resume();
}

function showAlertToast(entry) {
  const container = document.getElementById('alertToastContainer');
  if (!container) return;

  const toastEl = document.createElement('div');
  toastEl.className = 'alert-toast';
  toastEl.innerHTML = `
    <i class="ti ti-bell-ringing" style="color:var(--acc);flex-shrink:0;margin-top:1px"></i>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${entry.itemName}</div>
      <div style="font-size:11px;color:var(--muted)">Palavra: ${entry.keyword}${entry.quantity > 1 ? ' • ' + entry.quantity + 'x' : ''}</div>
    </div>
    <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0" onclick="this.closest('.alert-toast').remove()"><i class="ti ti-x"></i></button>`;
  container.appendChild(toastEl);

  const settings = AppState.alertSettings;
  let soundInterval = null;
  if (settings.soundEnabled) {
    playAlertBeep(settings.volume);
    if (settings.repeatSoundWhileOpen) soundInterval = setInterval(() => playAlertBeep(settings.volume), 1200);
  }

  setTimeout(() => {
    if (soundInterval) clearInterval(soundInterval);
    toastEl.remove();
  }, Math.max(1, settings.popupDurationSeconds) * 1000);
}

function fireAlert(entry) {
  showAlertToast(entry);
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('Drop rastreado: ' + entry.itemName, { body: 'Palavra: ' + entry.keyword, tag: entry.id });
    } catch {
      // navegador pode recusar Notification em alguns contextos — o toast já cobriu o aviso
    }
  }
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
  fireAlert(entry);
  if (AppState.currentPage === 'alertas') renderPage();
}

// Atualiza os "relógios" de última vez visto — chamado com os drops recém-chegados do poll ao
// vivo (nunca com uma recarga completa, senão qualquer upload resetaria os relógios pra datas
// do passado). "Qualquer drop" e "por palavra rastreada" são relógios independentes.
export function recordDropActivity(drops) {
  if (!drops.length) return;
  const now = Date.now();
  AppState.lastAnyDropAt = now;
  AppState.noDropAlertFired = false;

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
  if (!AppState.alertSettings.enabled || !AppState.liveFileHandle) return;
  const now = Date.now();

  if (!AppState.lastAnyDropAt) {
    AppState.lastAnyDropAt = now;
  } else {
    const noDropMs = Math.max(1, AppState.alertSettings.noDropThresholdMinutes) * 60000;
    if (!AppState.noDropAlertFired && now - AppState.lastAnyDropAt > noDropMs) {
      AppState.noDropAlertFired = true;
      fireWatchdogAlert(`Sem nenhum drop há ${AppState.alertSettings.noDropThresholdMinutes} min — confere se o helper travou`, 'watchdog');
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
