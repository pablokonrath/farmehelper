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

// price > 0 de propósito: item cadastrado como 0 é uma decisão pessoal ("isso é lixo pra mim") e
// não deve puxar a referência da comunidade pra baixo.
$rows = get_db()
  ->query('SELECT item_name, price FROM item_prices WHERE price > 0 ORDER BY item_name, price')
  ->fetchAll();

$porItem = [];
foreach ($rows as $row) {
  $porItem[$row['item_name']][] = (int) $row['price'];
}

$result = [];
foreach ($porItem as $name => $precos) {
  // Já vêm ordenados pelo ORDER BY acima.
  $n = count($precos);
  $meio = intdiv($n, 2);
  $mediana = $n % 2 ? $precos[$meio] : (int) round(($precos[$meio - 1] + $precos[$meio]) / 2);
  $result[$name] = ['price' => $mediana, 'accounts' => $n];
}

// (object) garante {} no JSON quando vazio — ver comentário em item-category-assignments.php.
json_response((object) $result);
