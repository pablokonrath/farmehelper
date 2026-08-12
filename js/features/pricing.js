import { AppState } from '../state/app-state.js';
import { saveItemPrices } from '../state/persistence.js';
import { updateBalanceSidebar } from './drops.js';
import { recordPriceChange, checkPricePlausibility } from './sales.js';
import { parseAlzInput, formatAlzGamer } from '../utils/formatting.js';
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

export function addItemPrice() {
  const name = document.getElementById('cN').value.trim();
  const rawPrice = document.getElementById('cP')?.value.trim();
  // Falha silenciosa: clicar "Salvar" sem preencher os dois campos não fazia nada, sem avisar —
  // fácil de achar que cadastrou e só notar a falta quando o item aparecer "sem preço" de novo.
  if (!name || !rawPrice) {
    alert('Preencha o nome do item e o valor antes de salvar — os dois são obrigatórios.');
    return;
  }
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
  if (!confirm(`Remover preço de "${name}"?`)) return;
  delete AppState.itemPrices[name];
  saveItemPrices();
  updateBalanceSidebar();
  renderPage();
}
