<?php
// Preço de REFERÊNCIA de cada item — a MEDIANA do que os jogadores cadastraram, cruzando todas as
// contas. Só leitura: ninguém escreve aqui. Cada um continua editando o próprio preço em
// item-prices.php, e é isso que alimenta esta agregação na próxima leitura.
//
// Existe porque conta nova começava com zero preço cadastrado: o app contava os drops mas não
// sabia quanto valiam, então a Visão geral abria com "Total de farme: 0" até a pessoa cadastrar
// item por item na mão. Com a referência, ela já entra com um valor utilizável nos itens que a
// comunidade conhece, e só ajusta o que discordar.
//
// MEDIANA, não média: preço de item é onde erro de digitação acontece (um zero a mais multiplica
// por 10). A média incorporaria esse erro no valor que todo mundo vê; a mediana ignora o extremo
// sem precisar de nenhuma curadoria manual. Com uma conta só, a mediana é o próprio valor dela —
// então isto funciona desde o primeiro dia e vai ficando mais robusto conforme a base cresce.
//
// Não expõe nada sensível: é o preço de um item de jogo num servidor compartilhado, agregado e sem
// vínculo com quem cadastrou. known-item-names.php já publica a lista de nomes há mais tempo.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['error' => 'method_not_allowed'], 405);

// Traz TODO item já cadastrado por alguém, inclusive os marcados como 0.
//
// São duas coisas diferentes sendo compartilhadas aqui, e elas têm regras diferentes:
//   - O ITEM (o nome no catálogo): compartilhado sempre. O ponto principal é ninguém precisar
//     digitar de novo um nome que outro jogador já cadastrou.
//   - O PREÇO: mediana só dos valores > 0.
//
// Por isso o 0 não é filtrado no SELECT, e sim ignorado no cálculo da mediana: item que alguém
// marcou como 0 ("isso é lixo") continua aparecendo no catálogo de todo mundo — só não puxa o
// preço de referência pra baixo. Filtrar no SELECT sumia com o item da lista dos outros, que é
// justamente o trabalho manual que isto existe pra evitar.
$db = get_db();

// ---------------------------------------------------------------------------------------------
// Só entra no catálogo compartilhado item que ALGUÉM REALMENTE DROPOU (existe em drop_snapshots,
// o histórico gravado a partir do log do jogo).
//
// O nome de item digitado à mão é a única porta de lixo neste catálogo: basta uma pessoa cadastrar
// "Nucleo de Aprimoramnto" (sem o "e") pra essa entrada aparecer pra todo mundo pra sempre, e só
// quem criou consegue apagar. Já o log é escrito pelo próprio jogo — nome que veio de lá é
// canônico por construção, typo não existe.
//
// O catálogo também passa a ser chaveado pelo nome DO LOG, não pelo que cada um digitou: quem
// cadastrou "nucleo de aprimoramento" em minúscula entra agregado sob o nome certo, em vez de
// virar uma segunda linha na lista de todo mundo.
//
// Isso NÃO restringe o cadastro pessoal: cada um continua podendo precificar o que quiser na
// própria conta (item comprado, insumo de craft, item de crédito de macro que nunca dropa). O
// filtro é só sobre o que é COMPARTILHADO.
$normalizar = function (string $nome): string {
  // Tira o sufixo de aprimoramento (+3) — o snapshot já grava o nome base (ver
  // buildSnapshotRowsFromLog) — e neutraliza maiúscula/acento pra comparar.
  $nome = preg_replace('/\s*\+\s*\d+$/u', '', trim($nome));
  $nome = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nome) ?: $nome;
  return mb_strtolower($nome);
};

$canonico = [];
foreach ($db->query('SELECT DISTINCT item_name FROM drop_snapshots')->fetchAll() as $r) {
  $canonico[$normalizar($r['item_name'])] = $r['item_name'];
}

$rows = $db->query('SELECT item_name, price FROM item_prices ORDER BY item_name, price')->fetchAll();

$porItem = [];
foreach ($rows as $row) {
  $nome = $canonico[$normalizar($row['item_name'])] ?? null;
  // Instalação nova, sem nenhum drop sincronizado ainda: sem base pra validar, aceita tudo em vez
  // de devolver um catálogo vazio pra todo mundo.
  if ($nome === null) {
    if ($canonico) continue;
    $nome = $row['item_name'];
  }
  $porItem[$nome][] = (int) $row['price'];
}

$result = [];
foreach ($porItem as $name => $todos) {
  $precos = array_values(array_filter($todos, fn($p) => $p > 0));
  // Ordena aqui, não confia no ORDER BY: variações do mesmo item ("Anel Fatal", "anel fatal +3")
  // são agregadas sob o mesmo nome canônico acima, então a ordem por item_name da query não
  // garante mais que os preços de um grupo cheguem em ordem — e mediana sobre lista desordenada
  // devolve um valor qualquer do meio do array, não a mediana.
  sort($precos, SORT_NUMERIC);
  $n = count($precos);
  if ($n === 0) {
    // Todo mundo que cadastrou marcou 0 — o item entra no catálogo valendo 0 mesmo.
    $result[$name] = ['price' => 0, 'accounts' => count($todos)];
    continue;
  }
  $meio = intdiv($n, 2);
  $mediana = $n % 2 ? $precos[$meio] : (int) round(($precos[$meio - 1] + $precos[$meio]) / 2);
  $result[$name] = ['price' => $mediana, 'accounts' => $n];
}

// (object) garante {} no JSON quando vazio — ver comentário em item-category-assignments.php.
json_response((object) $result);
