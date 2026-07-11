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
// Hash do trecho do arquivo já lido (bytes [0, lastReadFileSize)) — usado só pra detectar
// edição manual (ver comentário em pollOnce), não tem nada a ver com autenticação.
let lastPrefixHash = null;

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pollOnce() {
  if (!fileHandle) return;
  // "Batimento" a cada tick (5s), tenha ou não conteúdo novo — é o que permite o main thread
  // reavaliar "quanto tempo faz que não cai nada" (alerta de inatividade, ver checkDropWatchdog
  // em alerts.js), já que sem isso o worker só manda mensagem quando o arquivo cresce.
  postMessage({ type: 'heartbeat' });
  try {
    const latestFile = await fileHandle.getFile();

    if (latestFile.size < lastReadFileSize) {
      // Arquivo encolheu — o jogo reiniciou/truncou o log. Recarrega do zero. Não dá pra
      // verificar o prefixo anterior (ele nem existe mais no arquivo), então esse caso não
      // dispara alerta de integridade — é indistinguível de um truncamento legítimo do jogo.
      const fullText = LOG_FILE_DECODER.decode(await latestFile.arrayBuffer());
      lastReadFileSize = latestFile.size;
      pendingLineBuffer = '';
      lastPrefixHash = await sha256Hex(await latestFile.slice(0, lastReadFileSize).arrayBuffer());
      postMessage({ type: 'full-reload', lines: fullText.split('\n') });
      return;
    }

    // O polling normal só deveria crescer (o jogo só escreve no fim do log). Se o trecho já
    // lido mudou desde a última verificação, alguém editou o arquivo manualmente entre duas
    // leituras (ex: abriu num editor de texto e inseriu uma linha de drop falsa) — sinaliza
    // pro main thread, que reporta pro servidor revisar. Não bloqueia o processamento normal.
    if (lastReadFileSize > 0) {
      const prefixHash = await sha256Hex(await latestFile.slice(0, lastReadFileSize).arrayBuffer());
      if (lastPrefixHash !== null && prefixHash !== lastPrefixHash) postMessage({ type: 'tamper-detected' });
      lastPrefixHash = prefixHash;
    }

    if (latestFile.size === lastReadFileSize) return;

    const chunkText = pendingLineBuffer + LOG_FILE_DECODER.decode(await latestFile.slice(lastReadFileSize).arrayBuffer());
    // split('\n') sempre deixa a última linha "pendurada" se o pedaço lido termina exatamente
    // numa quebra de linha (ex: "a\nb\n".split('\n') = ["a","b",""], o "" no fim não é uma
    // linha incompleta de verdade). Sem essa checagem, o ÚLTIMO drop escrito no arquivo antes
    // do jogador parar de farmar (sem nenhuma linha depois pra "empurrá-lo" pra fora do
    // buffer) nunca era processado — ficava preso aqui pro resto da sessão, sem alerta nenhum.
    const chunkEndsWithNewline = chunkText.endsWith('\n');
    const lines = chunkText.split('\n');
    pendingLineBuffer = chunkEndsWithNewline ? '' : lines.pop();
    if (chunkEndsWithNewline) lines.pop(); // remove a "" vazia depois do último \n
    lastReadFileSize = latestFile.size;
    lastPrefixHash = await sha256Hex(await latestFile.slice(0, lastReadFileSize).arrayBuffer());

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
    lastPrefixHash = null;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
  } else if (type === 'stop') {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    fileHandle = null;
  }
};
