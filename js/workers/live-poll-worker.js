// Roda em thread separada de propósito: navegadores jogam o setInterval da aba principal
// pra 1 execução por minuto (ou menos) quando ela fica em segundo plano, o que fazia os
// alertas só chegarem quando o DropList estava com a aba em foco. Timers dentro de um Worker
// não sofrem esse throttling de aba oculta, então o polling do arquivo continua nos 5s
// normais mesmo com o navegador minimizado ou em outra aba.
const LOG_FILE_DECODER = new TextDecoder('windows-1252');
const POLL_INTERVAL_MS = 5000;

let fileHandle = null;
let lastReadFileSize = 0;
let pendingLineBuffer = '';
let pollTimer = null;

async function pollOnce() {
  if (!fileHandle) return;
  try {
    const latestFile = await fileHandle.getFile();

    if (latestFile.size < lastReadFileSize) {
      // Arquivo encolheu — o jogo reiniciou/truncou o log. Recarrega do zero.
      const fullText = LOG_FILE_DECODER.decode(await latestFile.arrayBuffer());
      lastReadFileSize = latestFile.size;
      pendingLineBuffer = '';
      postMessage({ type: 'full-reload', lines: fullText.split('\n') });
      return;
    }
    if (latestFile.size === lastReadFileSize) return;

    const chunkText = pendingLineBuffer + LOG_FILE_DECODER.decode(await latestFile.slice(lastReadFileSize).arrayBuffer());
    const lines = chunkText.split('\n');
    pendingLineBuffer = lines.pop();
    lastReadFileSize = latestFile.size;

    if (lines.length) postMessage({ type: 'new-lines', lines });
  } catch {
    // falha pontual de leitura (arquivo bloqueado por um instante etc.) — tenta de novo no próximo tick
  }
}

self.onmessage = event => {
  const { type } = event.data;
  if (type === 'start') {
    fileHandle = event.data.fileHandle;
    lastReadFileSize = event.data.lastReadFileSize || 0;
    pendingLineBuffer = event.data.pendingLineBuffer || '';
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
  } else if (type === 'stop') {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    fileHandle = null;
  }
};
