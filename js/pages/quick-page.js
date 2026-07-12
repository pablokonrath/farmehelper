import { AppState } from '../state/app-state.js';
import { formatAlzGamer, formatNumber } from '../utils/formatting.js';
import { getActiveSessionSummary } from '../features/dg-session.js';

const HEADER = `<div class="pg-title"><i class="ti ti-bolt" style="color:var(--gold)"></i>Modo rápido</div>
<div class="pg-sub">Escolha o que quer fazer — eu te guio passo a passo, bem rapidinho.</div>`;

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
      <button class="btn btn-d btn-xs" onclick="quickBackToMenu()"><i class="ti ti-arrow-left"></i>Voltar</button>
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
    active ? `Você está em ${active.dungeonName} agora` : 'Cronometra o farme e liga a vigilância')}
  ${bigChoice("quickPick('desejo')", '🎁', 'Adicionar item ao desejo', 'Ser avisado quando alguém dropar')}
  ${bigChoice("quickPick('rastrear')", '🔔', 'Rastrear um item p/ alerta', 'Receber alerta quando você dropar')}
  ${bigChoice("quickPick('rush')", '⚔️', 'Montar o rush de hoje', 'Escolher DGs e salvar o custo do dia')}
</div>`;
}

function renderDesejo(qm) {
  if (qm.step === 'done') {
    return doneCard('🎁', 'Adicionado aos desejos!', `"${qm.data.itemName}" entrou na sua lista. Quando alguém dropar, chega no seu correio.`, 'desejo');
  }
  const opts = [...new Set(AppState.knownItemNames || [])].sort((a, b) => a.localeCompare(b)).map(n => `<option value="${n}">`).join('');
  const inner = `<label class="lbl">Qual item você quer comprar?</label>
    <input class="inp" id="qm-wish" list="qm-items2" autocomplete="off" placeholder="ex: Nucleo Arcano (Altíssimo)">
    <datalist id="qm-items2">${opts}</datalist>${errLine(qm)}
    <button class="btn btn-s" style="margin-top:14px" onclick="quickNext()"><i class="ti ti-check"></i>Adicionar aos desejos</button>`;
  return stepShell('Lista de desejos', inner);
}

function renderRastrear(qm) {
  if (qm.step === 'done') {
    return doneCard('🔔', 'Item rastreado!', `Vou te alertar (som/pop-up) quando "${qm.data.itemName}" cair no seu farme.`, 'rastrear');
  }
  const opts = [...new Set(AppState.knownItemNames || [])].sort((a, b) => a.localeCompare(b)).map(n => `<option value="${n}">`).join('');
  const inner = `<label class="lbl">Qual item você quer rastrear?</label>
    <input class="inp" id="qm-track" list="qm-items3" autocomplete="off" placeholder="ex: joia, extensor...">
    <datalist id="qm-items3">${opts}</datalist>
    <div class="hint">Quando esse item cair no seu farme, você recebe o alerta na hora.</div>${errLine(qm)}
    <button class="btn btn-s" style="margin-top:14px" onclick="quickNext()"><i class="ti ti-check"></i>Rastrear item</button>`;
  return stepShell('Rastrear item', inner);
}

function renderRush(qm) {
  if (qm.step === 'done') {
    return doneCard('⚔️', 'Rush de hoje salvo!', `Custo total estimado: ${formatAlzGamer(qm.data.savedTotal || 0)}. Dá pra ver e ajustar em "DGs de rush diário".`, 'rush');
  }
  const cart = qm.data.cart || [];
  const opts = AppState.dungeonList.map(dg => `<option value="${dg.id}">${dg.name}</option>`).join('');
  const cartList = cart.length ? `<div style="margin-bottom:12px">${cart.map((it, i) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--surf2);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
      <span><strong>${it.repetitions}×</strong> ${it.name}</span>
      <button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="quickRushRemove(${i})" title="Remover"><i class="ti ti-x"></i></button>
    </div>`).join('')}</div>` : '<div class="empty" style="padding:10px 0">Nenhuma DG ainda. Adicione abaixo.</div>';
  const inner = `${cartList}
    <label class="lbl">Adicionar DG ao rush de hoje</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      <select class="inp" id="qm-rush-dg" style="flex:1;min-width:160px"><option value="">Selecione a DG...</option>${opts}</select>
      <input class="inp" id="qm-rush-reps" type="number" min="1" value="1" style="width:90px" title="Quantas vezes">
      <button class="btn btn-d" onclick="quickRushAdd()"><i class="ti ti-plus"></i>Adicionar</button>
    </div>${errLine(qm)}
    <button class="btn btn-s" style="margin-top:16px;width:100%" onclick="quickNext()"><i class="ti ti-device-floppy"></i>Finalizar e salvar rush de hoje</button>`;
  return stepShell('Montar rush de hoje', inner);
}

function renderVenda(qm) {
  const d = qm.data;
  if (qm.step === 'done') {
    return doneCard('✅', 'Venda registrada!', `${d.qty}× ${d.itemName} — ${formatAlzGamer(d.unitPrice * d.qty)} no total.`, 'venda');
  }
  let inner, stepText;
  if (qm.step === 1) {
    stepText = 'Passo 1 de 4';
    const opts = [...new Set(AppState.knownItemNames || [])].sort((a, b) => a.localeCompare(b)).map(n => `<option value="${n}">`).join('');
    inner = `<label class="lbl">Qual item você vendeu?</label>
      <input class="inp" id="qm-item" list="qm-items" autocomplete="off" placeholder="ex: Nucleo Arcano (Altíssimo)" value="${d.itemName || ''}">
      <datalist id="qm-items">${opts}</datalist>${errLine(qm)}
      <button class="btn btn-p" style="margin-top:14px" onclick="quickNext()">Próximo <i class="ti ti-arrow-right"></i></button>`;
  } else if (qm.step === 2) {
    stepText = 'Passo 2 de 4';
    inner = `<label class="lbl">Quantas unidades de "${d.itemName}"?</label>
      <input class="inp" id="qm-qty" type="number" min="1" value="${d.qty || 1}">${errLine(qm)}
      <button class="btn btn-p" style="margin-top:14px" onclick="quickNext()">Próximo <i class="ti ti-arrow-right"></i></button>`;
  } else if (qm.step === 3) {
    stepText = 'Passo 3 de 4';
    inner = `<label class="lbl">Por quanto vendeu CADA unidade? (Alz)</label>
      <input class="inp" id="qm-price" type="text" inputmode="numeric" placeholder="ex: 500.000.000" value="${d.unitPrice ? formatNumber(d.unitPrice) : ''}" oninput="maskAlzInputLive(this)">${errLine(qm)}
      <button class="btn btn-p" style="margin-top:14px" onclick="quickNext()">Próximo <i class="ti ti-arrow-right"></i></button>`;
  } else {
    stepText = 'Passo 4 de 4 · confirmar';
    inner = `<div style="font-size:14px;line-height:1.7">Vender <strong>${d.qty}×</strong> "${d.itemName}"<br>por <strong style="color:var(--gold)">${formatAlzGamer(d.unitPrice)}</strong> cada<br>= <strong style="color:var(--gold)">${formatAlzGamer(d.unitPrice * d.qty)}</strong> no total.</div>
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
    return doneCard('▶️', 'Sessão iniciada!', `Farmando em ${qm.data.dungeonName}. A vigilância (watchdog) ligou junto — te aviso se travar.`, 'sessao');
  }
  if (qm.step === 'done-end') {
    return doneCard('✅', 'Sessão encerrada!', `${qm.data.endedName} — ${formatAlzGamer(qm.data.endedAlz || 0)} no total. Veja o resumo em "Sessões de farme".`, 'sessao');
  }
  const active = getActiveSessionSummary();
  let inner;
  if (active) {
    inner = `<div style="font-size:14px;line-height:1.7;margin-bottom:6px">Você está farmando em <strong>${active.dungeonName}</strong>.<br>Já são <strong style="color:var(--gold)">${formatAlzGamer(active.totalAlz)}</strong> em ${active.dropCount} drops.</div>
      <button class="btn btn-s" style="margin-top:8px" onclick="quickNext()"><i class="ti ti-player-stop"></i>Encerrar sessão</button>`;
  } else {
    const opts = AppState.dungeonList.map(dg => `<option value="${dg.id}">${dg.name}</option>`).join('');
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
  if (qm.action === 'desejo') return HEADER + renderDesejo(qm);
  if (qm.action === 'rastrear') return HEADER + renderRastrear(qm);
  if (qm.action === 'rush') return HEADER + renderRush(qm);
  return HEADER + renderPicker();
}
