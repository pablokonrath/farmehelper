<?php
// Mapa global item → categoria — qualquer usuário logado pode LER (o Relatório de todo
// mundo usa isso), mas só admin pode ESCREVER.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT item_name, category_name FROM item_category_assignments')->fetchAll();
  $result = [];
  foreach ($rows as $row) $result[$row['item_name']] = $row['category_name'];
  // (object) garante {} no JSON quando vazio — um array PHP vazio vira [] (lista) em vez de
  // {} (mapa), e um array JS não guarda propriedades de texto no JSON.stringify, perdendo
  // silenciosamente qualquer atribuição feita em cima de um AppState.x inicializado errado.
  json_response((object) $result);
}

if ($method === 'PUT') {
  require_admin();
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM item_category_assignments');
  $stmt = $db->prepare('INSERT INTO item_category_assignments (item_name, category_name) VALUES (:item, :category)');
  foreach ($body as $itemName => $categoryName) {
    if (is_string($categoryName) && trim($categoryName) !== '') {
      $stmt->execute(['item' => $itemName, 'category' => trim($categoryName)]);
    }
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
