import { AppState, CREDIT_CATEGORIES } from '../state/app-state.js';
import { formatAlzGamer, formatNumber } from '../utils/formatting.js';
import { getActiveSessionSummary } from '../features/dg-session.js';
import { getCostPerGem, calculateRushCartCost } from '../features/rush-cart.js';
import { renderDungeonOptionsGrouped } from '../features/dungeon-difficulty.js';
import { esc } from '../utils/escape.js';

const HEADER = `<div class="pg-title"><i class="ti ti-bolt" style="color:var(--gold)"></i>Modo guiado</div>
<div class="pg-sub">Escolha o que quer fazer — eu te guio passo a passo.</div>`;

// Botão grande da tela inicial ("O que você quer fazer?").
function bigChoice(onclick, icon, title, desc) {
  return `<button onclick="${onclick}" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--surf2);border:1px solid var(--border);border-radius:14px;padding:16px 18px;cursor:pointer;color:var(--txt);margin-bottom:10px">
    <span style="font-size:24px;line-height:1;width:46px;height:46px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--surf);border:1px solid var(--border);border-radius:12px">${icon}</span>
    <span style="flex:1"><span style="display:block;font-weight:700;font-size:15px">${title}</span><span style="display:block;font-size:12px;color:var(--muted);margin-top:2px">${desc}</span></span>
    <i class="ti ti-chevron-right" style="color:var(--muted)"></i>
  </button>`;
}

// Moldura de um passo: botão "voltar ao menu" + indicador de passo.
function stepShell(stepText, inner) {
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <button class="btn btn-d btn-xs" onclick="quickBack()"><i class="ti ti-arrow-left"></i>Voltar</button>
      <span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">${stepText}</span>
    </div>
    ${inner}
  </div>`;
}

function doneCard(icon, title, desc, action) {
  return `<div class="card" style="text-align:center;padding:32px 20px">
    <div style="font-size:52px;line-height:1;margin-bottom:10px">${icon}</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:6px">${title}</div>
    <div style="font-size:13px;color:var(--muted);max-width:340px;margin:0 auto 18px">${desc}</div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-p" onclick="quickPick('${action}')"><i class="ti ti-repeat"></i>Fazer de novo</button>
      <button class="btn btn-d" onclick="quickBackToMenu()"><i class="ti ti-list"></i>Outra ação</button>
    </div>
  </div>`;
}

function errLine(qm) {
  return qm.error ? `<div style="color:var(--err);font-size:12px;margin-top:8px">${qm.error}</div>` : '';
}

function renderPicker() {
  const active = getActiveSessionSummary();
  return `<div class="card">
  <div class="ctitle"><i class="ti ti-help-circle"></i>O que você quer fazer?</div>
  ${bigChoice("quickPick('venda')", '💰', 'Registrar uma venda', 'Anote um item que você vendeu')}
  ${bigChoice("quickPick('meta')", '🎯', 'Definir a meta do dia', 'Quanto de Alz você quer farmar hoje')}
  ${bigChoice("quickPick('sessao')", active ? '⏹️' : '▶️',
    active ? 'Encerrar a sessão de DG' : 'Iniciar uma sessão de DG',
    active ? `Você está em ${esc(active.dungeonName)} agora` : 'Cronometra o farme e liga a vigilância')}
  ${bigChoice("quickPick('rastrear')", '🔔', 'Rastrear um item p/ alerta', 'Receber alerta quando você dropar')}
  ${bigChoice("quickPick('rush')", '⚔️', 'Montar o rush de hoje', 'Escolher DGs e salvar o custo do dia')}
</div>`;
}

function renderRastrear(qm) {
  if (qm.step === 'done') {
    return doneCard('🔔', 'Item rastreado!', `Vou te alertar (som/pop-up) quando "${esc(qm.data.itemName)}" cair no seu farme.`, 'rastrear');
  }
  const opts = [...new Set(AppState.knownItemNames || [])].sort((a, b) => a.localeCompare(b)).map(n => `<option value="${esc(n)}">`).join('');
  const inner = `<label class="lbl">Qual item você quer rastrear?</label>
    <input class="inp" id="qm-track" list="qm-items3" autocomplete="off" placeholder="ex: joia, extensor...">
    <datalist id="qm-items3">${opts}</datalist>
    <div class="hint">Quando esse item cair no seu farme, você recebe o alerta na hora.</div>${errLine(qm)}
    <button class="btn btn-s" style="margin-top:14px" onclick="quickNext()"><i class="ti ti-check"></i>Rastrear item</button>`;
  return stepShell('Rastrear item', inner);
}

function renderRush(qm) {
  if (qm.step === 'done') {
    return `<div class="card" style="text-align:center;padding:32px 20px">
    <div style="font-size:52px;line-height:1;margin-bottom:10px">⚔️</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:6px">Rush de hoje salvo!</div>
    <div style="font-size:13px;color:var(--muted);max-width:360px;margin:0 auto 18px">Custo total estimado: <strong style="color:var(--gold)">${formatAlzGamer(qm.data.savedTotal || 0)}</strong>. Quer conferir os detalhes ou acompanhar o progresso pelas sessões?</div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-p" onclick="navigateTo('rush')"><i class="ti ti-adjustments"></i>Ajustar na aba completa</button>
      <button class="btn btn-d" onclick="quickPick('rush')"><i class="ti ti-repeat"></i>Montar outro</button>
      <button class="btn btn-d" onclick="quickBackToMenu()"><i class="ti ti-list"></i>Outra ação</button>
    </div>
  </div>`;
  }
  if (qm.step === 1) return renderRushValores(qm);
  if (qm.step === 3) return renderRushCreditos(qm);
  if (qm.step === 4) return renderRushPanorama(qm);
  return renderRushDGs(qm);
}

function renderRushValores(qm) {
  const t = AppState.rushTicketPrice, c = AppState.rushCardCashPrice;
  const inner = `<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Confirme os valores base (ficam salvos pra próxima vez).</div>
    <label class="lbl">Valor de 1 ticket (Alz)</label>
    <input class="inp" id="qm-rush-ticket" type="text" inputmode="numeric" placeholder="ex: 1.000.000" value="${t ? formatNumber(t) : ''}" oninput="maskAlzInputLive(this)">
    <label class="lbl" style="margin-top:12px">Card Cash — 1.000 Cash em Alz</label>
    <input class="inp" id="qm-rush-cash" type="text" inputmode="numeric" placeholder="ex: 550.000.000" value="${c ? formatNumber(c) : ''}" oninput="maskAlzInputLive(this)">
    <div class="hint">Serve pra calcular o custo dos tickets e das gemas de reset.</div>
    <button class="btn btn-p" style="margin-top:14px" onclick="quickNext()">Próximo <i class="ti ti-arrow-right"></i></button>`;
  return stepShell('Passo 1 de 4 · valores', inner);
}

function renderRushDGs(qm) {
  const cart = qm.data.cart || [];
  const opts = renderDungeonOptionsGrouped(AppState.dungeonList);
  const gemHint = formatNumber(getCostPerGem());
  const cartList = cart.length
    ? `<div style="margin-bottom:12px">${cart.map((it, i) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--surf2);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
        <span><strong>${it.repetitions}×</strong> ${esc(it.name)}${it.usedReset ? ` <span style="color:var(--gold);font-size:12px">· reset ${it.resetGemQuantity} gema(s)</span>` : ''}</span>
        <button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="quickRushRemove(${i})" title="Remover"><i class="ti ti-x"></i></button>
      </div>`).join('')}</div>`
    : '<div class="empty" style="padding:10px 0">Nenhuma DG ainda. Adicione abaixo.</div>';
  const inner = `${cartList}
    <label class="lbl">Adicionar DG</label>
    <div style="display:flex;flex-direction:column;gap:8px">
      <select class="inp" id="qm-rush-dg"><option value="">Selecione a DG...</option>${opts}</select>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:80px"><label class="lbl" style="font-size:10px">Repetições</label><input class="inp" id="qm-rush-reps" type="number" min="1" value="1"></div>
        <div style="flex:1;min-width:80px"><label class="lbl" style="font-size:10px">Gemas de reset (0 = não)</label><input class="inp" id="qm-rush-gemqty" type="number" min="0" value="0"></div>
        <div style="flex:1;min-width:110px"><label class="lbl" style="font-size:10px">Preço da gema (Alz)</label><input class="inp" id="qm-rush-gemprice" type="text" inputmode="numeric" value="${gemHint}" oninput="maskAlzInputLive(this)"></div>
      </div>
      <button class="btn btn-d" onclick="quickRushAdd()"><i class="ti ti-plus"></i>Adicionar DG</button>
    </div>${errLine(qm)}
    <button class="btn btn-p" style="margin-top:16px;width:100%" onclick="quickNext()">Próximo · créditos <i class="ti ti-arrow-right"></i></button>`;
  return stepShell('Passo 2 de 4 · DGs', inner);
}

function renderRushCreditos(qm) {
  const inner = `<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Comprou créditos de macro pra usar o helper hoje? (opcional — deixe 0 se não usou)</div>
    ${CREDIT_CATEGORIES.map(cat => {
      const c = AppState.rushCredits[cat.id];
      return `<div style="margin-bottom:10px"><label class="lbl">${cat.name}</label>
        <div style="display:flex;gap:8px">
          <input class="inp" id="qm-cred-qty-${cat.id}" type="number" min="0" value="${c.quantity || 0}" style="width:90px" title="Quantos">
          <input class="inp" id="qm-cred-price-${cat.id}" type="text" inputmode="numeric" placeholder="preço de mercado (Alz)" value="${c.marketPrice ? formatNumber(c.marketPrice) : ''}" oninput="maskAlzInputLive(this)" style="flex:1">
        </div></div>`;
    }).join('')}
    <button class="btn btn-p" style="margin-top:6px;width:100%" onclick="quickNext()">Próximo · panorama <i class="ti ti-arrow-right"></i></button>`;
  return stepShell('Passo 3 de 4 · créditos', inner);
}

function renderRushPanorama(qm) {
  const cost = calculateRushCartCost(qm.data.cart || []);
  const row = (label, value) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted)">${label}</span><strong>${formatAlzGamer(value)}</strong></div>`;
  const inner = `<div style="font-weight:700;margin-bottom:8px">Panorama do rush de hoje</div>
    ${row('Alz das DGs', cost.alzFromDungeons)}
    ${row(`Tickets (${cost.ticketCount})`, cost.ticketCost)}
    ${row(`Gemas (${cost.gemCount})`, cost.gemCost)}
    ${row('Créditos de macro', cost.creditsCost)}
    <div style="display:flex;justify-content:space-between;padding:10px 0 2px"><span style="font-weight:700">Custo total do dia</span><strong style="color:var(--gold);font-size:16px">${formatAlzGamer(cost.total)}</strong></div>
    <button class="btn btn-s" style="margin-top:14px;width:100%" onclick="quickNext()"><i class="ti ti-device-floppy"></i>Salvar rush de hoje</button>`;
  return stepShell('Passo 4 de 4 · panorama', inner);
}

function renderVenda(qm) {
  const d = qm.data;
  if (qm.step === 'done') {
    return doneCard('✅', 'Venda registrada!', `${d.qty}× ${esc(d.itemName)} — ${formatAlzGamer(d.unitPrice * d.qty)} no total.`, 'venda');
  }
  let inner, stepText;
  if (qm.step === 1) {
    stepText = 'Passo 1 de 4';
    const opts = [...new Set(AppState.knownItemNames || [])].sort((a, b) => a.localeCompare(b)).map(n => `<option value="${esc(n)}">`).join('');
    inner = `<label class="lbl">Qual item você vendeu?</label>
      <input class="inp" id="qm-item" list="qm-items" autocomplete="off" placeholder="ex: Nucleo Arcano (Altíssimo)" value="${esc(d.itemName || '')}">
      <datalist id="qm-items">${opts}</datalist>${errLine(qm)}
      <button class="btn btn-p" style="margin-top:14px" onclick="quickNext()">Próximo <i class="ti ti-arrow-right"></i></button>`;
  } else if (qm.step === 2) {
    stepText = 'Passo 2 de 4';
    inner = `<label class="lbl">Quantas unidades de "${esc(d.itemName)}"?</label>
      <input class="inp" id="qm-qty" type="number" min="1" value="${d.qty || 1}">${errLine(qm)}
      <button class="btn btn-p" style="margin-top:14px" onclick="quickNext()">Próximo <i class="ti ti-arrow-right"></i></button>`;
  } else if (qm.step === 3) {
    stepText = 'Passo 3 de 4';
    inner = `<label class="lbl">Por quanto vendeu CADA unidade? (Alz)</label>
      <input class="inp" id="qm-price" type="text" inputmode="numeric" placeholder="ex: 500.000.000" value="${d.unitPrice ? formatNumber(d.unitPrice) : ''}" oninput="maskAlzInputLive(this)">${errLine(qm)}
      <button class="btn btn-p" style="margin-top:14px" onclick="quickNext()">Próximo <i class="ti ti-arrow-right"></i></button>`;
  } else {
    stepText = 'Passo 4 de 4 · confirmar';
    inner = `<div style="font-size:14px;line-height:1.7">Vender <strong>${d.qty}×</strong> "${esc(d.itemName)}"<br>por <strong style="color:var(--gold)">${formatAlzGamer(d.unitPrice)}</strong> cada<br>= <strong style="color:var(--gold)">${formatAlzGamer(d.unitPrice * d.qty)}</strong> no total.</div>
      <button class="btn btn-s" style="margin-top:16px" onclick="quickNext()"><i class="ti ti-check"></i>Registrar venda</button>`;
  }
  return stepShell(stepText, inner);
}

function renderMeta(qm) {
  if (qm.step === 'done') {
    return doneCard('🎯', 'Meta definida!', `Sua meta de hoje é ${formatAlzGamer(qm.data.goalAlz)} Alz. Bom farme!`, 'meta');
  }
  const cur = AppState.dailyGoalAlz;
  const inner = `<label class="lbl">Quanto de Alz você quer farmar hoje?</label>
    <input class="inp" id="qm-goal" type="text" inputmode="numeric" placeholder="ex: 2.000.000.000" value="${cur ? formatNumber(cur) : ''}" oninput="maskAlzInputLive(this)">${errLine(qm)}
    <button class="btn btn-s" style="margin-top:14px" onclick="quickNext()"><i class="ti ti-check"></i>Salvar meta</button>`;
  return stepShell('Meta do dia', inner);
}

function renderSessao(qm) {
  if (qm.step === 'done-start') {
    return doneCard('▶️', 'Sessão iniciada!', `Farmando em ${esc(qm.data.dungeonName)}. A vigilância (watchdog) ligou junto — te aviso se travar.`, 'sessao');
  }
  if (qm.step === 'done-end') {
    return doneCard('✅', 'Sessão encerrada!', `${esc(qm.data.endedName)} — ${formatAlzGamer(qm.data.endedAlz || 0)} no total. Veja o resumo em "Sessões de farme".`, 'sessao');
  }
  const active = getActiveSessionSummary();
  let inner;
  if (active) {
    inner = `<div style="font-size:14px;line-height:1.7;margin-bottom:6px">Você está farmando em <strong>${esc(active.dungeonName)}</strong>.<br>Já são <strong style="color:var(--gold)">${formatAlzGamer(active.totalAlz)}</strong> em ${active.dropCount} drops.</div>
      <button class="btn btn-s" style="margin-top:8px" onclick="quickNext()"><i class="ti ti-player-stop"></i>Encerrar sessão</button>`;
  } else {
    const opts = renderDungeonOptionsGrouped(AppState.dungeonList);
    inner = `<label class="lbl">Em qual DG você vai farmar?</label>
      <select class="inp" id="qm-dg"><option value="">Selecione...</option>${opts}</select>${errLine(qm)}
      <button class="btn btn-s" style="margin-top:14px" onclick="quickNext()"><i class="ti ti-player-play"></i>Iniciar sessão</button>`;
  }
  return stepShell(active ? 'Encerrar sessão' : 'Iniciar sessão', inner);
}

export function renderQuickPage() {
  const qm = AppState.quickMode;
  if (qm.action === 'venda') return HEADER + renderVenda(qm);
  if (qm.action === 'meta') return HEADER + renderMeta(qm);
  if (qm.action === 'sessao') return HEADER + renderSessao(qm);
  if (qm.action === 'rastrear') return HEADER + renderRastrear(qm);
  if (qm.action === 'rush') return HEADER + renderRush(qm);
  return HEADER + renderPicker();
}
