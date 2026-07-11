import { AppState } from '../state/app-state.js';
import { parseDropLogLine } from '../utils/parsing.js';
import { updateBalanceSidebar } from './drops.js';
import { processNewDropsForAlerts, recordDropActivity, checkDropWatchdog } from './alerts.js';
import { syncTrackedDropCounts } from './leaderboard.js';
import { checkWishlistMatches } from './wishlist.js';
import { renderPage } from '../router.js';

// Os arquivos de drop do Cabal Online são gerados em windows-1252, não UTF-8.
const LOG_FILE_DECODER = new TextDecoder('windows-1252');
const API_BASE = 'api';

// FileSystemFileHandle não sobrevive a um F5 (todo o contexto JS é recriado), mas pode ser
// clonado para o IndexedDB e recuperado depois — é assim que a conexão ao vivo resiste a um
// refresh de página sem o usuário precisar reabrir o seletor de arquivo toda vez.
const HANDLE_DB_NAME = 'droplist-live-file';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'lastFile';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HANDLE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLiveFileHandle(handle) {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSavedLiveFileHandle() {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function parseLogLines(rawText) {
  return rawText.split('\n').map(parseDropLogLine).filter(Boolean);
}

function setLiveStatus(html) {
  const el = document.getElementById('fstat');
  if (el) el.innerHTML = html;
}

// Fire-and-forget — best-effort, igual syncTrackedDropCounts: uma falha aqui não deve
// impedir o usuário de continuar farmando, só perde a sinalização pro admin dessa vez.
async function reportIntegrityFlag(type, details) {
  try {
    const response = await fetch(`${API_BASE}/integrity-flags.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, details }),
    });
    if (!response.ok) console.error('Falha ao reportar alerta de integridade:', response.status, await response.text());
  } catch (err) {
    console.error('Erro de conexão ao reportar alerta de integridade:', err);
  }
}

function handleWorkerMessage(event) {
  const { type, lines } = event.data;

  // Batimento do worker (a cada ~5s, com ou sem conteúdo novo) — reavalia o alerta de
  // inatividade (helper travado / item rastreado sumiu). Ver checkDropWatchdog em alerts.js.
  if (type === 'heartbeat') {
    checkDropWatchdog();
    return;
  }

  // O worker detectou que o trecho já lido do arquivo mudou entre duas leituras — o polling
  // normal só deveria crescer, então isso indica edição manual (ver live-poll-worker.js).
  // Reporta pro admin revisar; não impede o app de continuar usando o arquivo.
  if (type === 'tamper-detected') {
    setLiveStatus('<span style="color:var(--err)"><i class="ti ti-alert-triangle"></i> Possível edição manual detectada no arquivo</span>');
    reportIntegrityFlag('file_tamper', 'O trecho já lido do arquivo de log mudou entre duas leituras do polling — possível edição manual.');
    return;
  }

  if (type !== 'new-lines' && type !== 'full-reload') return;

  const parsedDrops = lines.map(parseDropLogLine).filter(Boolean);

  if (type === 'full-reload') {
    AppState.drops = parsedDrops;
    updateBalanceSidebar();
    syncTrackedDropCounts();
    if (AppState.currentPage === 'overview') renderPage();
    return;
  }

  if (parsedDrops.length) {
    AppState.drops = [...AppState.drops, ...parsedDrops];
    updateBalanceSidebar();
    syncTrackedDropCounts();
    recordDropActivity(parsedDrops);
    processNewDropsForAlerts(parsedDrops);
    checkWishlistMatches(parsedDrops);
    if (AppState.currentPage === 'overview') renderPage();
  }
}

// Lê o arquivo inteiro e começa o polling de 5 em 5s dentro de um Worker — timers de Worker não
// sofrem o throttling que os navegadores aplicam a setInterval de abas em segundo plano, então
// os alertas continuam chegando mesmo com o DropList minimizado ou em outra aba (ver live-poll-worker.js).
async function startLiveFilePolling(fileHandle) {
  AppState.liveFileHandle = fileHandle;

  const file = await fileHandle.getFile();
  AppState.drops = parseLogLines(LOG_FILE_DECODER.decode(await file.arrayBuffer()));
  AppState.lastReadFileSize = file.size;
  AppState.pendingLineBuffer = '';

  // Zera os relógios do alerta de inatividade — sem isso, um estado travado de uma conexão
  // anterior (ex: já tinha passado do limite antes de reconectar) dispararia o alerta na hora.
  AppState.lastAnyDropAt = null;
  AppState.lastNoDropAlertAt = null;
  AppState.lastSeenByKeyword = {};
  AppState.staleKeywordAlerted = {};

  if (AppState.liveFilePollWorker) AppState.liveFilePollWorker.terminate();
  // Query string com timestamp força o navegador a buscar o worker de novo no servidor toda
  // vez que conecta, em vez de servir uma cópia antiga do cache HTTP — sem isso, uma
  // atualização nesse arquivo só passava a valer depois de um hard-refresh manual (Ctrl+F5).
  AppState.liveFilePollWorker = new Worker(`js/workers/live-poll-worker.js?v=${Date.now()}`);
  AppState.liveFilePollWorker.onmessage = handleWorkerMessage;
  AppState.liveFilePollWorker.postMessage({
    type: 'start',
    fileHandle,
    lastReadFileSize: AppState.lastReadFileSize,
    pendingLineBuffer: AppState.pendingLineBuffer,
  });

  setLiveStatus('<span style="color:var(--ok)"><i class="ti ti-wifi"></i> Ao vivo — ' + AppState.drops.length.toLocaleString('pt-BR') + ' drops</span>');
  document.getElementById('liveRow').className = 'file-btn active';
  updateBalanceSidebar();
  syncTrackedDropCounts();
  renderPage();
}

export function initFileInputListener() {
  const fileInput = document.getElementById('fi');
  if (!fileInput) return;

  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      AppState.drops = parseLogLines(LOG_FILE_DECODER.decode(await file.arrayBuffer()));
    } catch {
      AppState.drops = parseLogLines(await file.text());
    }
    e.target.value = '';

    document.getElementById('fstat').textContent = AppState.drops.length.toLocaleString('pt-BR') + ' drops carregados';
    document.getElementById('upRow').className = 'file-btn active';
    updateBalanceSidebar();
    syncTrackedDropCounts();
    renderPage();
  });
}

export async function connectLiveFile() {
  if (!window.showOpenFilePicker) {
    alert('Use o Chrome para monitoramento em tempo real.');
    return;
  }
  try {
    const [fileHandle] = await window.showOpenFilePicker();
    await saveLiveFileHandle(fileHandle);
    await startLiveFilePolling(fileHandle);
  } catch (e) {
    if (e.name !== 'AbortError') alert('Erro: ' + e.message);
  }
}

// Chamado uma vez ao carregar o app: tenta retomar a conexão ao vivo salva de uma sessão
// anterior sem reabrir o seletor de arquivo. Se o navegador já lembra da permissão (comum
// dentro da mesma sessão do navegador), a conexão volta sozinha. Se a permissão precisar
// ser concedida de novo (ex: navegador foi reiniciado), mostra um botão "Reconectar" —
// só um clique do usuário permite o navegador reconceder a permissão, não dá pra automatizar.
export async function resumeLiveFileConnection() {
  if (!window.showOpenFilePicker) return;
  try {
    const fileHandle = await loadSavedLiveFileHandle();
    if (!fileHandle) return;

    const permission = await fileHandle.queryPermission({ mode: 'read' });
    if (permission === 'granted') {
      await startLiveFilePolling(fileHandle);
    } else {
      AppState.liveFileHandle = fileHandle;
      setLiveStatus(
        '<span style="color:var(--warn)"><i class="ti ti-plug-connected-x"></i> Conexão ao vivo pausada</span> — ' +
        '<button onclick="reconnectLiveFile()" style="background:none;border:none;color:var(--acc);text-decoration:underline;cursor:pointer;font-size:11px;padding:0">reconectar</button>'
      );
    }
  } catch {
    // sem handle salvo, ou IndexedDB indisponível — segue sem conexão ao vivo, como antes
  }
}

// Reconcede a permissão sobre o arquivo já escolhido antes, sem reabrir o seletor de arquivo.
export async function reconnectLiveFile() {
  if (!AppState.liveFileHandle) return connectLiveFile();
  try {
    const permission = await AppState.liveFileHandle.requestPermission({ mode: 'read' });
    if (permission === 'granted') await startLiveFilePolling(AppState.liveFileHandle);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}
