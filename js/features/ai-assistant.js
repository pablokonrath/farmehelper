import { AppState } from '../state/app-state.js';
import { getFilteredDrops, getItemPrice, summarizeDropsByItem } from './drops.js';
import { renderPage } from '../router.js';
import { saveAiApiKey } from '../state/persistence.js';

const AI_MODEL = 'claude-opus-4-8';

// Sem backend ainda (fase PHP/MySQL é planejada mas não existe), então a chamada é feita
// direto do browser com a própria chave do usuário, guardada só no localStorage dele.
// anthropic-dangerous-direct-browser-access é o header que a Anthropic exige pra permitir
// chamadas de origem browser (sem ele a API rejeita por segurança).
export function setAiApiKey(key) {
  AppState.aiApiKey = key.trim();
  saveAiApiKey();
  renderPage();
}

export function clearAiApiKey() {
  AppState.aiApiKey = '';
  saveAiApiKey();
  renderPage();
}

export function askQuickQuestion(question) {
  const input = document.getElementById('aiI');
  if (input) input.value = question;
  submitAIMessage(question);
}

export async function sendAIMessage() {
  const input = document.getElementById('aiI');
  if (!input) return;
  const message = input.value.trim();
  if (!message || AppState.isAiLoading) return;
  input.value = '';
  submitAIMessage(message);
}

export async function submitAIMessage(message) {
  if (!AppState.aiApiKey) {
    AppState.aiMessages.push({ role: 'user', content: message });
    AppState.aiMessages.push({ role: 'assistant', content: 'Configure sua chave de API da Anthropic acima para usar a análise com IA.' });
    renderPage();
    return;
  }

  AppState.aiMessages.push({ role: 'user', content: message });
  AppState.isAiLoading = true;
  renderPage();

  const drops = getFilteredDrops();
  const items = summarizeDropsByItem(drops);
  const totalValue = drops.reduce((sum, d) => sum + getItemPrice(d.name), 0);
  const elapsedHours = drops.length >= 2 ? (drops[drops.length - 1].timestamp - drops[0].timestamp) / 3600000 : 0;
  const totalRushSpent = Object.values(AppState.rushHistory).reduce((sum, r) => sum + r.total, 0);

  const context = {
    totalDrops: drops.length,
    totalValor: totalValue,
    alzHora: elapsedHours > 0 ? Math.round(totalValue / elapsedHours) : 0,
    gastoRush: totalRushSpent,
    liquido: totalValue - totalRushSpent,
    topItens: items.slice(0, 10).map(i => ({ item: i.name, qtd: i.qty, valor: i.total })),
    semPreco: items.filter(i => !i.price).length,
  };

  let replyText;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': AppState.aiApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1024,
        system: `Você é um expert em farming do Cabal Neo. Analise dados e responda de forma prática e direta, em português. Dados: ${JSON.stringify(context)}`,
        messages: AppState.aiMessages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      if (response.status === 401) {
        replyText = 'Chave de API inválida ou expirada. Verifique a chave nas configurações da IA.';
      } else if (response.status === 429) {
        replyText = 'Limite de uso da API atingido. Tente novamente em instantes.';
      } else {
        replyText = `Erro da API (${response.status}): ${errBody?.error?.message || 'falha desconhecida'}.`;
      }
    } else {
      const data = await response.json();
      replyText = data.content?.[0]?.text || 'Sem resposta.';
    }
  } catch {
    replyText = 'Erro de conexão com a API da Anthropic.';
  }

  AppState.aiMessages.push({ role: 'assistant', content: replyText });
  AppState.isAiLoading = false;
  renderPage();
  setTimeout(() => {
    const chatEl = document.getElementById('aiChat');
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  }, 50);
}
