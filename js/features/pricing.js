import { AppState } from '../state/app-state.js';
import { saveItemPrices, saveNonSellableItems } from '../state/persistence.js';
import { updateBalanceSidebar, findDroppedNameMatch, suggestDroppedName } from './drops.js';
import { recordPriceChange, checkPricePlausibility } from './sales.js';
import { parseAlzInput, formatAlzGamer } from '../utils/formatting.js';
import { actWithUndo } from './undo.js';
import { renderPage } from '../router.js';

// Última barreira antes de um preço errado entrar no sistema (ver checkPricePlausibility em
// sales.js pro porquê): confirma quando o valor está fora de ordem de grandeza da referência que
// o app já conhece. Devolve false quando o jogador desiste. Não bloqueia — mercado de servidor
// privado dá salto de verdade às vezes, e quem manda é o jogador; o papel aqui é obrigar o erro
// silencioso a virar uma decisão consciente.
function confirmPriceIfImplausible(name, price) {
  const check = checkPricePlausibility(name, price);
  if (!check) return true;
  return confirm(
    `"${name}" por ${formatAlzGamer(price)} está ${check.factor}× ${check.tooHigh ? 'ACIMA' : 'ABAIXO'} da referência ` +
    `(${formatAlzGamer(check.reference)}, ${check.source}).\n\n` +
    `Um zero a mais ou a menos aqui distorce a meta do dia, o Alz/run de toda DG e o ranking de rotas. Confirma o valor?`
  );
}

// Confere o NOME contra o log antes de cadastrar. Nome digitado à mão é a única fonte de lixo no
// catálogo compartilhado (ver api/reference-prices.php): "Nucleo de Aprimoramnto" viraria uma
// entrada separada, visível pra todo mundo, que só quem criou consegue apagar.
//
// Avisa, não bloqueia. Item comprado, insumo de craft ou o item variável do crédito de macro
// podem legitimamente nunca ter dropado pra você — bloquear quebraria esses casos. Quem confirma
// segue com o preço na própria conta; o filtro do que é compartilhado é feito no servidor.
function confirmNameIfNeverDropped(name) {
  if (findDroppedNameMatch(name)) return true;
  const sugestao = suggestDroppedName(name);
  return confirm(
    `Você nunca dropou "${name}".\n\n` +
    (sugestao ? `Quis dizer "${sugestao}"?\n\n` : '') +
    'Pode ser só um erro de digitação. Cadastrar assim mesmo? (o preço fica na sua conta, mas item que ninguém dropou não entra no catálogo compartilhado)'
  );
}

export function addItemPrice() {
  const name = document.getElementById('cN').value.trim();
  const rawPrice = document.getElementById('cP')?.value.trim();
  // Falha silenciosa: clicar "Salvar" sem preencher os dois campos não fazia nada, sem avisar —
  // fácil de achar que cadastrou e só notar a falta quando o item aparecer "sem preço" de novo.
  if (!name || !rawPrice) {
    alert('Preencha o nome do item e o valor antes de salvar — os dois são obrigatórios.');
    return;
  }
  // Só na CRIAÇÃO: editar um item que já está na lista não precisa reconferir o nome.
  if (AppState.itemPrices[name] === undefined && !confirmNameIfNeverDropped(name)) return;
  const price = parseAlzInput(rawPrice);
  if (!confirmPriceIfImplausible(name, price)) return;

  AppState.itemPrices[name] = price;
  recordPriceChange(name, price);
  saveItemPrices();
  updateBalanceSidebar();
  renderPage();
}

// Edição inline na própria linha da tabela (mesmo padrão de startEditingDungeon em
// dungeon-manager.js) — antes era um window.prompt(), que não dá pra mascarar/colorir por
// ser um dialog nativo do navegador, fora do DOM da página.
export function startEditingItemPrice(name) {
  AppState.editingItemPriceName = name;
  renderPage();
}

export function cancelEditingItemPrice() {
  AppState.editingItemPriceName = null;
  renderPage();
}

export function saveItemPriceEdit(name) {
  const rawPrice = document.getElementById('editItemPriceInput')?.value;
  const price = parseAlzInput(rawPrice);
  if (!confirmPriceIfImplausible(name, price)) return;

  AppState.itemPrices[name] = price;
  recordPriceChange(name, price);
  AppState.editingItemPriceName = null;
  saveItemPrices();
  updateBalanceSidebar();
  renderPage();
}

export function deleteItemPrice(name) {
  const anterior = AppState.itemPrices[name];
  if (anterior === undefined) return;
  delete AppState.itemPrices[name];
  saveItemPrices();
  updateBalanceSidebar();
  renderPage();

  actWithUndo(`Preço de "${name}" removido`, () => {
    AppState.itemPrices[name] = anterior;
    saveItemPrices();
    updateBalanceSidebar();
    renderPage();
  });
}

// ── Itens que eu não vendo (não valem Alz) ────────────────────────────────────────────────────
//
// Ficha de evento, moeda, material que só se consome. Continuam aparecendo no log e nos itens da
// sessão — você segue vendo o que caiu — mas não entram em nenhuma conta de Alz.
//
// Existe porque contar item que nunca vira dinheiro é farme falso: infla o total do dia, o Alz/run
// e o líquido, e a decisão de onde farmar sai errada em cima de um número que não existe. E basta
// o item ganhar um preço de referência da comunidade pra isso acontecer sem ninguém cadastrar nada.
//
// Substituiu o antigo painel de evento, que fazia o mesmo com liga/desliga e tinha um furo grave:
// como o filtro lia a configuração ATUAL e não a data, desligar o evento fazia todas as sessões
// passadas voltarem a contar o fragmento de uma vez, mudando a média das DGs daquele período
// retroativamente. Lista permanente não tem esse problema.
export function addNonSellableItem() {
  const input = document.getElementById('nonSellableInput');
  const nome = (input?.value || '').trim();
  if (!nome) return;
  // Casa por trecho do nome, então entrada curta demais pegaria meio log por acidente.
  if (nome.length < 3) {
    alert('Use pelo menos 3 letras — o nome casa por trecho, e algo mais curto que isso acabaria excluindo itens que não têm nada a ver.');
    return;
  }
  const jaTem = AppState.nonSellableItems.some(n => n.toLowerCase() === nome.toLowerCase());
  if (jaTem) {
    if (input) input.value = '';
    renderPage();
    return;
  }
  AppState.nonSellableItems = [...AppState.nonSellableItems, nome];
  saveNonSellableItems().catch(err => console.error('Falha ao salvar itens sem valor:', err));
  if (input) input.value = '';
  renderPage();
}

export function removeNonSellableItem(indice) {
  const nome = AppState.nonSellableItems[Number(indice)];
  if (nome === undefined) return;
  const anterior = [...AppState.nonSellableItems];
  AppState.nonSellableItems = AppState.nonSellableItems.filter((_, i) => i !== Number(indice));
  saveNonSellableItems().catch(err => console.error('Falha ao salvar itens sem valor:', err));
  renderPage();
  actWithUndo(`"${nome}" volta a contar como Alz`, () => {
    AppState.nonSellableItems = anterior;
    saveNonSellableItems().catch(err => console.error('Falha ao salvar itens sem valor:', err));
    renderPage();
  });
}
