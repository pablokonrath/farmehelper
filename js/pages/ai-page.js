import { AppState } from '../state/app-state.js';

const QUICK_QUESTIONS = [
  'Como está minha eficiência de farme?',
  'Quais itens me geram mais lucro?',
  'Meu gasto com Rush vale a pena?',
  'O que devo priorizar?',
  'Analise meus dados detalhadamente',
];

function renderApiKeySettings() {
  const hasKey = !!AppState.aiApiKey;
  if (hasKey) {
    return `<div class="card">
<div class="ctitle"><i class="ti ti-key"></i>Chave de API</div>
<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Chave configurada e salva neste navegador.</div>
<button class="btn" onclick="clearAiApiKey()"><i class="ti ti-trash"></i>Remover chave</button>
</div>`;
  }
  return `<div class="card">
<div class="ctitle"><i class="ti ti-key"></i>Chave de API da Anthropic</div>
<div style="font-size:12px;color:var(--muted);margin-bottom:8px">
Como o DropList ainda não tem um servidor próprio, a análise com IA chama a API da Anthropic direto do seu navegador. Cole sua chave abaixo — ela fica salva só no seu navegador (localStorage) e é enviada apenas para api.anthropic.com. Não use isso em um computador compartilhado. Crie uma chave em <span class="mono">console.anthropic.com</span>.
</div>
<div class="row">
  <input class="inp" id="aiKeyInput" type="password" placeholder="sk-ant-...">
  <button class="btn btn-p" onclick="setAiApiKey(document.getElementById('aiKeyInput').value)"><i class="ti ti-check"></i>Salvar</button>
</div>
</div>`;
}

export function renderAIPage() {
  return `
<div class="pg-title"><i class="ti ti-robot"></i>Análise com IA</div>
<div class="pg-sub">Converse com a IA sobre seus dados de farme para obter insights e recomendações.</div>
${renderApiKeySettings()}
<div class="card"><div class="ctitle"><i class="ti ti-sparkles"></i>Perguntas rápidas</div>
<div style="display:flex;flex-wrap:wrap;gap:8px">
${QUICK_QUESTIONS.map(q => `<button class="qbtn" onclick="askQuickQuestion('${q}')">${q} ↗</button>`).join('')}
</div></div>
<div class="card"><div id="aiChat" style="min-height:260px;margin-bottom:12px">
${!AppState.aiMessages.length && !AppState.isAiLoading ? `<div class="empty" style="padding:40px 0"><i class="ti ti-robot" style="font-size:36px;display:block;margin-bottom:10px;color:var(--acc)"></i>Faça uma pergunta sobre seu farme</div>` :
AppState.aiMessages.map(msg => `<div class="ai-msg ${msg.role === 'user' ? 'u' : ''}"><div class="ai-sender">${msg.role === 'user' ? 'Você' : 'IA'}</div><div style="font-size:13px;line-height:1.6;white-space:pre-wrap">${msg.content}</div></div>`).join('') +
(AppState.isAiLoading ? `<div class="ai-msg"><div class="ai-sender">IA</div><div style="color:var(--muted)">Analisando seus dados...</div></div>` : '')}
</div>
<div class="row">
  <input class="inp" id="aiI" placeholder="Pergunte algo sobre seu farme..." onkeydown="if(event.key==='Enter')sendAIMessage()">
  <button class="btn btn-p" onclick="sendAIMessage()" ${AppState.isAiLoading ? 'disabled' : ''}><i class="ti ti-send"></i></button>
</div></div>`;
}
