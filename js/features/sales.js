import { AppState } from '../state/app-state.js';
import { saveSalesLog, savePriceHistory, saveItemPrices, saveUnsoldInventoryDismissals } from '../state/persistence.js';
import { getItemPrice, getAllDrops, summarizeDropsByItem } from './drops.js';
import { parseAlzInput, parseDateInputBR, formatAlzGamer, formatNumber, formatDateBR } from '../utils/formatting.js';
import { todayISODate, stripEnhancementSuffix } from '../utils/parsing.js';
import { renderPage } from '../router.js';

// Quantos dias sem revisar um preço cadastrado é considerado "desatualizado" — mesmo limite usado
// em Cálculo de farme (priceAgeCell) e no aviso de item vendendo abaixo do esperado em Vendas.
// Compartilhado aqui (não duplicado nas duas páginas) porque as duas leem o mesmo dado
// (daysSincePriceUpdate) com o mesmo critério — mudar um sem o outro deixaria os dois lugares
// discordando sobre o que é "desatualizado".
export const STALE_PRICE_DAYS = 14;

// Registra a mudança de preço de um item no histórico (1 ponto por dia: atualiza se já mexeu
// hoje, adiciona se for dia novo, ignora se o preço não mudou). Chamado sempre que um preço é
// definido/editado (pricing.js, manual-drops.js).
export function recordPriceChange(name, price) {
  if (!name || !(price > 0)) return;
  const hist = AppState.priceHistory[name] || (AppState.priceHistory[name] = []);
  const last = hist[hist.length - 1];
  const today = todayISODate();
  if (last && last.price === price) return;
  if (last && last.date === today) last.price = price;
  else hist.push({ date: today, price });
  if (hist.length > 120) AppState.priceHistory[name] = hist.slice(-120);
  savePriceHistory();
}

// Toda venda confirmada (nova ou correção de uma existente) atualiza o preço cadastrado do item
// (mesma tabela usada em Cálculo de farme, Visão geral, raridade — em qualquer lugar que precise
// de um preço pra multiplicar). Uma venda real é o dado mais confiável que existe sobre quanto o
// item vale AGORA, mais confiável que qualquer preço digitado à mão — então ao invés de exigir
// que o jogador mantenha os preços cadastrados em dia manualmente, cada venda já faz essa
// manutenção sozinha. Fatorado aqui pra recordSale e a edição de venda em addSale usarem a MESMA
// lógica, em vez de duas cópias que podem divergir.
function applyAutoItemPrice(itemName, unitPrice) {
  if (!itemName || !(unitPrice > 0)) return;
  AppState.itemPrices[itemName] = unitPrice;
  recordPriceChange(itemName, unitPrice); // vale pra data de HOJE mesmo com venda retroativa, ver manual-drops.js
  saveItemPrices();
}

// Insere uma venda no log (sem re-renderizar) — usado tanto pela página de Vendas quanto pelo
// Modo guiado, pra não duplicar o formato do registro.
export function recordSale({ itemName, qty, unitPrice, date }) {
  AppState.salesLog.push({
    id: 's' + Date.now() + Math.random().toString(36).slice(2, 6),
    itemName,
    qty: Math.max(1, parseInt(qty, 10) || 1),
    unitPrice: unitPrice || 0,
    date: date || todayISODate(),
  });
  saveSalesLog();
  applyAutoItemPrice(itemName, unitPrice);
}

// Compara um preço de venda com a média das últimas vendas recentes do mesmo item — pra pegar
// aquela venda apressada por bem menos do que o mercado tem pago ultimamente, antes dela virar
// histórico e distorcer o "preço de venda real" pra sempre. Olha só as 5 últimas (não a vida
// toda — preço de mercado muda; o que importa é a tendência recente). Com menos de 2 vendas
// anteriores não tem base pra comparar, então não avisa (evita falso positivo com amostra de 1).
const PRICE_DROP_WARNING_THRESHOLD = 0.2; // 20% abaixo da média recente
export function checkSalePriceDrop(itemName, unitPrice) {
  const key = stripEnhancementSuffix(itemName);
  const recent = AppState.salesLog.filter(s => stripEnhancementSuffix(s.itemName) === key).slice(-5);
  if (recent.length < 2 || !(unitPrice > 0)) return null;
  const avg = recent.reduce((sum, s) => sum + s.unitPrice, 0) / recent.length;
  if (avg <= 0) return null;
  const dropPct = (avg - unitPrice) / avg;
  return dropPct >= PRICE_DROP_WARNING_THRESHOLD ? { avg, dropPct: Math.round(dropPct * 100) } : null;
}

// Estoque provável: pra cada item, quanto já caiu (todo o histórico de drops) menos quanto já foi
// vendido — o item que mais caiu e menos vendeu sobe pro topo. É radar, não auditoria: parte do
// que caiu pode ter virado craft, uso pessoal ou coleção, então isso NUNCA soma num total de "Alz
// preso" em lugar nenhum do app (mesmo motivo pelo qual computeSalesSummary não faz essa conta) —
// serve só pra lembrar que aquele item existe e vale revisar se ainda tá pra vender.
//
// Desconta o que já foi dado baixa manual (ver dismissUnsoldInventory) — sem isso, todo item que o
// jogador já decidiu que "não é venda esquecida, foi craft/coleção/vendido sem registrar" ia
// continuar aparecendo pra sempre, especialmente pesado pra quem só começou a registrar vendas
// recentemente (o histórico de drop é muito mais antigo que o de venda).
export function computeLikelyUnsoldInventory(limit = 6) {
  const dropped = {};
  summarizeDropsByItem(getAllDrops()).forEach(i => { dropped[i.name] = i.qty; });

  const sold = {};
  AppState.salesLog.forEach(s => {
    const key = stripEnhancementSuffix(s.itemName);
    sold[key] = (sold[key] || 0) + s.qty;
  });

  return Object.entries(dropped)
    .map(([itemName, droppedQty]) => {
      const soldQty = sold[itemName] || 0;
      const dismissedQty = AppState.unsoldInventoryDismissals[itemName]?.qty || 0;
      const unsoldQty = Math.max(0, droppedQty - soldQty - dismissedQty);
      return { itemName, droppedQty, soldQty, unsoldQty, estValue: unsoldQty * getItemPrice(itemName) };
    })
    .filter(i => i.unsoldQty > 0 && i.estValue > 0)
    .sort((a, b) => b.estValue - a.estValue)
    .slice(0, limit);
}

// Dá baixa no "estoque não vendido" de um item, marcando TUDO que hoje aparece como não vendido
// como resolvido (vendido fora do registro, virou coleção, ou foi usado de insumo em craft) — pra
// não ficar sinalizando de novo. Se cair mais desse item depois, só o excedente NOVO reaparece
// (ver computeLikelyUnsoldInventory), então isso não é "silenciar pra sempre", é "já tratei até
// aqui".
export function dismissUnsoldInventory(itemName, reason) {
  const droppedQty = summarizeDropsByItem(getAllDrops()).find(i => i.name === itemName)?.qty || 0;
  const soldQty = AppState.salesLog
    .filter(s => stripEnhancementSuffix(s.itemName) === itemName)
    .reduce((sum, s) => sum + s.qty, 0);
  AppState.unsoldInventoryDismissals[itemName] = { qty: Math.max(0, droppedQty - soldQty), reason, date: todayISODate() };
  saveUnsoldInventoryDismissals().catch(err => console.error('Falha ao salvar baixa de estoque:', err));
  renderPage();
}

// Desfaz a baixa — o item volta a ser cruzado normalmente (some do total de "excedente resolvido")
// e reaparece no radar se ainda houver diferença entre dropado e vendido.
export function restoreUnsoldInventory(itemName) {
  delete AppState.unsoldInventoryDismissals[itemName];
  saveUnsoldInventoryDismissals().catch(err => console.error('Falha ao salvar baixa de estoque:', err));
  renderPage();
}

// Uma venda "igual demais" já lançada no MESMO dia (mesmo item, quantidade e valor) — pega o erro
// clássico de clicar "Registrar" duas vezes ou lançar de novo sem lembrar que já tinha feito.
// excludeId ignora a própria venda quando é uma edição (senão toda edição "encontraria" a si
// mesma como duplicata).
function findDuplicateSale(itemName, qty, unitPrice, date, excludeId) {
  const key = stripEnhancementSuffix(itemName);
  return AppState.salesLog.find(s =>
    s.id !== excludeId && s.date === date && s.qty === qty && s.unitPrice === unitPrice &&
    stripEnhancementSuffix(s.itemName) === key
  );
}

// Preenche o formulário com o último item vendido (nome + preço unitário, quantidade volta pra 1)
// SEM entrar em modo de edição — pra vender o mesmo item várias vezes seguidas (comum vender um
// lote em unidades) sem redigitar nome/preço a cada venda e arriscar errar algo na repetição.
export function repeatLastSale() {
  const last = [...AppState.salesLog].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).pop();
  if (!last) return;
  const itemEl = document.getElementById('saleItem');
  const qtyEl = document.getElementById('saleQty');
  const priceEl = document.getElementById('salePrice');
  if (itemEl) itemEl.value = last.itemName;
  if (qtyEl) qtyEl.value = 1;
  if (priceEl) priceEl.value = formatNumber(last.unitPrice);
  priceEl?.focus();
  priceEl?.select();
}

// Mostra uma confirmação rápida (mesmo padrão do "rMsg" em Planejamento de Rush) depois de
// registrar/editar — fecha o loop: sem isso, nada na tela dizia que a venda entrou OU que o preço
// cadastrado do item foi atualizado sozinho (efeito que já acontece, só ficava invisível).
function showSaleMessage(text) {
  const el = document.getElementById('sMsg');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = text;
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => (el.style.display = 'none'), 5000);
}

// Pede o valor TOTAL recebido, não o valor por unidade — é isso que o jogo mostra quando vende
// um lote ("recebeu X Alz"), então digitar o total e deixar o app dividir evita a conta de
// cabeça (e o arredondamento torto de quem faz ela errado). O valor por unidade guardado no log
// (e usado pra atualizar o preço cadastrado, ver recordSale) é sempre total ÷ quantidade.
//
// Com AppState.editingSaleId setado (ver startEditingSale), CORRIGE a venda existente em vez de
// criar outra — sem isso, o único jeito de consertar um erro de digitação era excluir e digitar
// tudo de novo, um passo a mais onde já rolou erro uma vez.
export function addSale() {
  const name = document.getElementById('saleItem')?.value.trim();
  const rawTotal = document.getElementById('salePrice')?.value.trim();
  // Falha silenciosa era o pior cenário aqui: clicar "Registrar" sem preencher tudo não fazia
  // nada, sem avisar — fácil de achar que a venda entrou e só notar a falta dias depois.
  if (!name || !rawTotal) {
    alert('Preencha o item e o valor recebido antes de registrar — os dois são obrigatórios.');
    return;
  }
  const qty = Math.max(1, parseInt(document.getElementById('saleQty')?.value) || 1);
  const unitPrice = Math.round(parseAlzInput(rawTotal) / qty);
  const date = parseDateInputBR(document.getElementById('saleDate')?.value) || todayISODate();

  const dup = findDuplicateSale(name, qty, unitPrice, date, AppState.editingSaleId);
  if (dup && !confirm(`Já existe uma venda igual a essa (${qty}× ${name} por ${formatAlzGamer(unitPrice * qty)}) registrada em ${formatDateBR(date)}. Confirma que não é duplicada?`)) return;

  // Toda venda reescreve o preço cadastrado do item (ver applyAutoItemPrice), então um erro de
  // ordem de grandeza aqui contamina o app inteiro igual a um preço digitado errado em Cálculo de
  // farme — mesma checagem, mesmo motivo.
  const sanity = checkPricePlausibility(name, unitPrice);
  if (sanity && !confirm(
    `${formatAlzGamer(unitPrice)} por unidade está ${sanity.factor}× ${sanity.tooHigh ? 'ACIMA' : 'ABAIXO'} da referência (${formatAlzGamer(sanity.reference)}, ${sanity.source}).\n\n` +
    `Confira se a quantidade e o valor total estão certos — essa venda também vira o preço cadastrado de "${name}". Confirma?`
  )) return;

  // Só avisa da venda barata se a checagem de ordem de grandeza acima não disparou — 10× abaixo
  // também está 20% abaixo, e dois confirms seguidos sobre o mesmo número viram ruído.
  const drop = sanity ? null : checkSalePriceDrop(name, unitPrice);
  if (drop && !confirm(`Você tá vendendo "${name}" ${drop.dropPct}% abaixo da sua média recente (~${formatAlzGamer(drop.avg)}). Confirma mesmo assim?`)) return;

  if (AppState.editingSaleId) {
    const sale = AppState.salesLog.find(s => s.id === AppState.editingSaleId);
    if (sale) {
      sale.itemName = name;
      sale.qty = qty;
      sale.unitPrice = unitPrice;
      sale.date = date;
      saveSalesLog();
      applyAutoItemPrice(name, unitPrice);
    }
    AppState.editingSaleId = null;
    renderPage();
    showSaleMessage(`Venda corrigida: ${qty}× ${name} — ${formatAlzGamer(unitPrice * qty)}.`);
  } else {
    recordSale({ itemName: name, qty, unitPrice, date });
    renderPage();
    showSaleMessage(`Venda registrada: ${qty}× ${name} — ${formatAlzGamer(unitPrice * qty)}. Preço de "${name}" atualizado pra ${formatAlzGamer(unitPrice)}.`);
  }
}

// Carrega uma venda já registrada de volta no formulário pra corrigir (item, quantidade, valor ou
// data) sem precisar excluir e digitar tudo de novo.
export function startEditingSale(id) {
  AppState.editingSaleId = id;
  renderPage();
  document.getElementById('saleItem')?.focus();
}

export function cancelEditingSale() {
  AppState.editingSaleId = null;
  renderPage();
}

export function deleteSale(id) {
  const sale = AppState.salesLog.find(s => s.id === id);
  if (!sale) return;
  // Exclusão de venda é irreversível e some com o dado que também atualizou o preço cadastrado
  // do item — mesmo padrão de confirmação já usado em excluir sessão/rota, só que faltava aqui.
  if (!confirm(`Remover a venda de ${sale.qty}× "${sale.itemName}" (${formatAlzGamer(sale.unitPrice * sale.qty)})? Essa ação não pode ser desfeita.`)) return;
  AppState.salesLog = AppState.salesLog.filter(s => s.id !== id);
  if (AppState.editingSaleId === id) AppState.editingSaleId = null;
  saveSalesLog();
  renderPage();
}

export function setPriceHistoryItem(item) {
  AppState.priceHistoryItem = item;
  renderPage();
}

// Histórico do preço de VENDA de um item (não o preço cadastrado como meta em Cálculo de farme —
// esse é só uma estimativa; o que importa acompanhar é por quanto você realmente vendeu). Um
// ponto por dia: média ponderada pela quantidade, pra não espalhar vários pontos no mesmo dia
// quando você vende o mesmo item mais de uma vez. Começa naturalmente na primeira venda, já que
// só existe ponto pra dia em que houve venda de verdade.
export function getSalePriceHistory(itemName) {
  const itemKey = stripEnhancementSuffix(itemName);
  const byDate = {};
  AppState.salesLog
    .filter(s => stripEnhancementSuffix(s.itemName) === itemKey)
    .forEach(s => {
      const d = byDate[s.date] || (byDate[s.date] = { totalValue: 0, totalQty: 0 });
      d.totalValue += s.unitPrice * s.qty;
      d.totalQty += s.qty;
    });
  return Object.entries(byDate)
    .map(([date, d]) => ({ date, price: Math.round(d.totalValue / d.totalQty) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Nomes de item que já foram vendidos ao menos uma vez — pra popular o seletor do gráfico de
// preço de venda (getSalePriceHistory), já que agora o gráfico é sobre vendas reais, não sobre
// tudo que já teve preço cadastrado.
export function getSoldItemNames() {
  return [...new Set(AppState.salesLog.map(s => stripEnhancementSuffix(s.itemName)))].sort();
}

// Um preço fora de ordem de grandeza é quase sempre erro de digitação (um zero a mais/a menos),
// e é a única falha isolada capaz de falsificar o app inteiro em silêncio: o preço multiplica tudo
// — meta do dia, Alz/run, qual DG rende mais, ranking de rota, vale-resetar, vale comprar crédito.
// Nada disso questiona o número, todos confiam nele.
//
// Compara com a referência mais confiável disponível, nessa ordem: média das vendas REAIS recentes
// do item (dado de mercado de verdade) e, na falta dela, o último preço já cadastrado. Sem nenhuma
// das duas (item inédito), não há base pra julgar — devolve null em vez de chutar.
const PRICE_SANITY_FACTOR = 10;
export function checkPricePlausibility(itemName, newPrice) {
  if (!itemName || !(newPrice > 0)) return null;

  const key = stripEnhancementSuffix(itemName);
  const recentSales = AppState.salesLog.filter(s => stripEnhancementSuffix(s.itemName) === key).slice(-5);
  let reference = null;
  let source = '';
  if (recentSales.length) {
    reference = recentSales.reduce((sum, s) => sum + s.unitPrice, 0) / recentSales.length;
    source = `média das suas ${recentSales.length} última(s) venda(s)`;
  } else {
    // Ignora um ponto gravado hoje: recordPriceChange sobrescreve o ponto do dia, então numa
    // segunda correção no mesmo dia a "referência" seria o próprio valor errado que acabou de
    // entrar — comparar contra ele mesmo nunca acusaria nada.
    const hist = (AppState.priceHistory[key] || []).filter(p => p.date !== todayISODate());
    if (hist.length) {
      reference = hist[hist.length - 1].price;
      source = 'último preço que você tinha cadastrado';
    }
  }
  if (!(reference > 0)) return null;

  const factor = newPrice > reference ? newPrice / reference : reference / newPrice;
  if (factor < PRICE_SANITY_FACTOR) return null;
  return { reference, source, factor: Math.round(factor), tooHigh: newPrice > reference };
}

// Há quantos dias o preço cadastrado de um item foi mexido pela última vez (null = nunca teve
// histórico, ex: cadastrado antes do priceHistory existir). Economia de servidor privado varia —
// um preço nunca revisto vira estimativa cada vez menos confiável sem avisar em lugar nenhum;
// usado em Cálculo de farme só pra sinalizar isso, não é um erro nem bloqueia nada.
export function daysSincePriceUpdate(itemName) {
  const hist = AppState.priceHistory[itemName];
  if (!hist || !hist.length) return null;
  const lastDate = hist[hist.length - 1].date;
  const diffMs = Date.now() - new Date(lastDate + 'T00:00:00').getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

// Total vendido (real) e o que valeria pelo preço cadastrado (estimado). Não soma o valor do que
// ainda não foi vendido (dropado − vendido) nesse total — nem todo drop é vendido (parte vai pra
// coleção ou vira insumo de craft), então isso nunca representou Alz de verdade parado em algum
// lugar. Esse cruzamento existe à parte, só como radar informativo: ver computeLikelyUnsoldInventory.
//
// `from`/`to` (ISO, opcionais) filtram por data — mesmo filtro De/Até já usado na Visão geral.
// Chamado sem argumentos (ex: o aviso de preço desatualizado em overview-page.js) continua
// olhando o log inteiro, pra não quebrar quem já depende do total geral.
export function computeSalesSummary(from = '', to = '') {
  let realTotal = 0;
  let estimatedTotal = 0;
  let count = 0;
  AppState.salesLog.forEach(s => {
    if (from && s.date < from) return;
    if (to && s.date > to) return;
    realTotal += s.unitPrice * s.qty;
    estimatedTotal += getItemPrice(s.itemName) * s.qty;
    count++;
  });

  return { realTotal, estimatedTotal, diff: realTotal - estimatedTotal, count, avgTicket: count ? Math.round(realTotal / count) : 0 };
}

// Mesmo total de computeSalesSummary, mas quebrado por item — pra achar rápido qual item específico
// tá rendendo menos que o esperado (real bem abaixo do estimado) em vez de só ver a diferença geral
// escondida no meio de itens que estão indo bem. Ordenado pela maior diferença negativa primeiro
// (o que mais precisa de atenção sobe pro topo).
export function computeSalesSummaryByItem(from = '', to = '') {
  const byItem = {};
  AppState.salesLog.forEach(s => {
    if (from && s.date < from) return;
    if (to && s.date > to) return;
    const entry = byItem[s.itemName] || (byItem[s.itemName] = { itemName: s.itemName, qty: 0, realTotal: 0, estimatedTotal: 0 });
    entry.qty += s.qty;
    entry.realTotal += s.unitPrice * s.qty;
    entry.estimatedTotal += getItemPrice(s.itemName) * s.qty;
  });
  return Object.values(byItem)
    .map(entry => ({ ...entry, diff: entry.realTotal - entry.estimatedTotal }))
    .sort((a, b) => a.diff - b.diff);
}
