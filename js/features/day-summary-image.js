import { computeDaySummary } from './dg-session.js';
import { showInfoToast } from './alerts.js';
import { formatAlzGamer, formatDateBR, formatDuration } from '../utils/formatting.js';

// Resumo do dia como IMAGEM, não texto.
//
// O texto resolvia colar em qualquer lugar, mas o que o jogador faz de verdade no Discord da guild
// é mandar print — e print de uma tela que não foi desenhada pra isso sai com menu, barra lateral
// e cortes estranhos. Aqui a imagem é desenhada do zero, no formato certo, só com o que importa.
//
// Canvas puro, sem biblioteca: html2canvas traria uma dependência de CDN e renderiza CSS de forma
// aproximada (sombra, gradiente e fonte saem diferentes do que está na tela). Desenhando à mão o
// resultado é determinístico, e o card não precisa parecer a página — precisa parecer um placar.

const W = 1000;
const H = 560;
const PAD = 52;
const SCALE = 2; // exporta em 2x pro print não sair borrado em tela retina/zoom do Discord

const COR = {
  fundo: '#14100b',
  painel: '#1f1811',
  borda: '#4a3823',
  texto: '#f0e4c8',
  suave: '#c2ac82',
  fraco: '#ab9873',
  ouro: '#d9a441',
  ok: '#6b9c4a',
  err: '#d9480f',
};

const displayFont = (size, weight = 700) => `${weight} ${size}px 'Cinzel','Rajdhani',serif`;
const uiFont = (size, weight = 500) => `${weight} ${size}px 'Chakra Petch','Rajdhani',sans-serif`;

function rotulo(ctx, texto, x, y) {
  ctx.font = uiFont(13, 600);
  ctx.fillStyle = COR.fraco;
  // Espaçamento entre letras não existe em canvas — desenha caractere a caractere. Só nos rótulos
  // curtos em maiúscula, onde o espaçamento é o que os faz lerem como rótulo e não como texto.
  let cursor = x;
  for (const ch of texto.toUpperCase()) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + 1.6;
  }
}

function valor(ctx, texto, x, y, { size = 30, cor = COR.texto } = {}) {
  ctx.font = displayFont(size);
  ctx.fillStyle = cor;
  ctx.fillText(texto, x, y);
}

export async function buildDaySummaryCanvas() {
  const d = computeDaySummary();

  // As fontes do app vêm do Google Fonts. Sem esperar, o canvas desenha com a fonte de fallback
  // e o card sai com outra cara a cada execução.
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* segue com fallback */ }
  }

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';

  // Fundo + brilho quente no canto, mesma linguagem do card-featured do app.
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, W, H);
  const brilho = ctx.createRadialGradient(W * 0.12, -40, 0, W * 0.12, -40, 620);
  brilho.addColorStop(0, 'rgba(179,49,44,.20)');
  brilho.addColorStop(1, 'rgba(179,49,44,0)');
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, W, H);
  const brilho2 = ctx.createRadialGradient(W * 0.92, 40, 0, W * 0.92, 40, 520);
  brilho2.addColorStop(0, 'rgba(217,164,65,.13)');
  brilho2.addColorStop(1, 'rgba(217,164,65,0)');
  ctx.fillStyle = brilho2;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = COR.borda;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // ---- cabeçalho ----
  ctx.font = displayFont(26);
  ctx.fillStyle = COR.ouro;
  ctx.fillText('⚔ FARMHUB', PAD, 68);

  ctx.font = uiFont(18, 500);
  ctx.fillStyle = COR.suave;
  const dataTexto = formatDateBR(d.date);
  ctx.fillText(dataTexto, W - PAD - ctx.measureText(dataTexto).width, 68);

  ctx.strokeStyle = COR.borda;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 92);
  ctx.lineTo(W - PAD, 92);
  ctx.stroke();

  // ---- número herói: o líquido ----
  // É o número que responde "o dia valeu a pena?", então é o único em tamanho grande. Sem rush
  // registrado, líquido e farmado são iguais — nesse caso o rótulo diz "farmado", pra não sugerir
  // um desconto que não houve.
  // netOnDone, e nao net: o card tem que dizer o MESMO numero que a tela (ver o Resumo do dia em
  // overview-page.js). Duas versoes do mesmo dia — uma na tela, outra no print que voce manda pra
  // guild — e o tipo de divergencia que faz duvidar do sistema inteiro.
  const temRush = d.spent > 0;
  rotulo(ctx, temRush ? 'Líquido do dia' : 'Farmado no dia', PAD, 152);
  valor(ctx, `${temRush && d.netOnDone >= 0 ? '+' : ''}${formatAlzGamer(temRush ? d.netOnDone : d.farmed)}`, PAD, 222, {
    size: 74,
    cor: !temRush ? COR.ouro : d.netOnDone >= 0 ? COR.ok : COR.err,
  });

  // ---- estatísticas secundárias, só as que existem ----
  const stats = [];
  if (temRush) {
    stats.push({ k: 'Farmado', v: formatAlzGamer(d.farmed), c: COR.texto });
    // Mostra o rush RODADO quando sobrou entrada comprada, pra bater com o líquido acima. Somar
    // o não usado aqui faria o card não fechar na conta de quem for conferir.
    stats.push({ k: d.spentUnused > 0 ? 'Rush usado' : 'Gasto em rush', v: formatAlzGamer(d.spentOnDone), c: COR.err });
  }
  if (d.sold > 0) stats.push({ k: 'Vendido', v: formatAlzGamer(d.sold), c: COR.ouro });
  if (d.runs > 0) stats.push({ k: 'Runs', v: String(d.runs), c: COR.texto });
  if (d.activeMs > 0) stats.push({ k: 'Tempo ativo', v: formatDuration(d.activeMs), c: COR.texto });
  if (d.sessionCount > 0) stats.push({ k: 'Sessões', v: String(d.sessionCount), c: COR.texto });

  const COLS = 3;
  const colW = (W - PAD * 2) / COLS;
  stats.slice(0, 6).forEach((s, i) => {
    const x = PAD + (i % COLS) * colW;
    const y = 306 + Math.floor(i / COLS) * 86;
    rotulo(ctx, s.k, x, y);
    valor(ctx, s.v, x, y + 40, { size: 32, cor: s.c });
  });

  // ---- rodapé: os destaques ----
  const destaques = [];
  if (d.topDg) destaques.push(`🏆  Melhor DG: ${d.topDg.name} (${formatAlzGamer(d.topDg.alz)})`);
  if (d.bestItem) destaques.push(`💎  Melhor drop: ${d.bestItem.name} (${formatAlzGamer(d.bestItem.price)})`);

  if (destaques.length) {
    ctx.strokeStyle = COR.borda;
    ctx.beginPath();
    ctx.moveTo(PAD, H - 118);
    ctx.lineTo(W - PAD, H - 118);
    ctx.stroke();

    ctx.font = uiFont(19, 500);
    ctx.fillStyle = COR.suave;
    destaques.forEach((t, i) => ctx.fillText(t, PAD, H - 78 + i * 32));
  }

  return canvas;
}

function baixar(canvas, nome) {
  canvas.toBlob(blob => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nome;
    link.click();
    URL.revokeObjectURL(link.href);
  }, 'image/png');
}

const nomeArquivo = () => `farmhub-${computeDaySummary().date}.png`;

// Copia a imagem pro clipboard, pra colar direto no Discord (Ctrl+V). Cai pro download quando o
// navegador recusa escrever imagem no clipboard — em vez de falhar em silêncio, entrega o arquivo.
export async function copyDaySummaryImage() {
  const canvas = await buildDaySummaryCanvas();
  try {
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showInfoToast('Imagem copiada — é só colar no Discord');
  } catch {
    baixar(canvas, nomeArquivo());
    showInfoToast('Seu navegador não deixou copiar — baixei a imagem');
  }
}

export async function downloadDaySummaryImage() {
  baixar(await buildDaySummaryCanvas(), nomeArquivo());
  showInfoToast('Imagem salva');
}
