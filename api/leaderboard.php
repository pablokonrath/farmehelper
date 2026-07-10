<?php
// Qualquer usuário logado pode ver o ranking (não é admin-only) — é a visão da guild como
// um todo, só o detalhe de farme/rush de cada um que continua privado.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['error' => 'method_not_allowed'], 405);

$rows = get_db()->query('
  SELECT dc.item_name, u.username, dc.quantity
  FROM drop_counts dc
  JOIN users u ON u.id = dc.user_id
  WHERE dc.quantity > 0
  ORDER BY dc.item_name, dc.quantity DESC
')->fetchAll();

$result = [];
foreach ($rows as $row) {
  $result[$row['item_name']] ??= [];
  $result[$row['item_name']][] = ['username' => $row['username'], 'quantity' => (int) $row['quantity']];
}
// (object) garante {} no JSON quando vazio — ver comentário em item-category-assignments.php.
json_response((object) $result);
