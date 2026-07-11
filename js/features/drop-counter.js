import { AppState } from '../state/app-state.js';

// Contador ao vivo "sem drop há X" no menu lateral — só pra visibilidade/confiança de que o
// farme está caindo e o watchdog está contando. Atualiza direto no DOM a cada 1s (não
// re-renderiza a página), e some quando não há arquivo ao vivo conectado. Fica vermelho quando
// passa do limite do watchdog (com o watchdog ligado), pra bater com o alerta que dispara.
function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function tick() {
  const el = document.getElementById('dropCounter');
  if (!el) return;
  // Sem arquivo ao vivo, ou ainda sem nenhum drop de referência — nada pra contar.
  if (!AppState.liveFileHandle || !AppState.lastAnyDropAt) {
    el.style.display = 'none';
    return;
  }
  const elapsed = Date.now() - AppState.lastAnyDropAt;
  const thresholdMs = Math.max(1, AppState.alertSettings.noDropThresholdMinutes) * 60000;
  const over = AppState.alertSettings.watchdogEnabled && elapsed > thresholdMs;
  el.style.display = 'block';
  el.style.color = over ? 'var(--err)' : 'var(--muted)';
  el.innerHTML = `<i class="ti ti-clock"></i> Sem drop há ${formatElapsed(elapsed)}`;
}

export function startDropCounterTicker() {
  tick();
  // 1s no thread principal: quando a aba está em segundo plano o navegador afrouxa esse timer,
  // mas aí você não está olhando a tela mesmo — quando volta o foco, atualiza na hora. A
  // detecção de travamento em si continua no worker de 5s (checkDropWatchdog), não depende disso.
  setInterval(tick, 1000);
}
