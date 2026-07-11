<?php
// Catálogo de nomes de item conhecidos, cruzando todos os usuários — só o nome, nunca o
// preço (que é individual, ver item-prices.php). Usado pra autocompletar o nome certo em
// Cálculo de farme e pro card "Atribuir categorias" em Admin, que precisa enxergar todo item
// que qualquer jogador já cadastrou, não só os do usuário logado.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['error' => 'method_not_allowed'], 405);

$rows = get_db()->query('SELECT DISTINCT item_name FROM item_prices ORDER BY item_name')->fetchAll();
json_response(array_map(fn($r) => $r['item_name'], $rows));
