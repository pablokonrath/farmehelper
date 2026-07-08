<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT item_name, price FROM item_prices')->fetchAll();
  $result = [];
  foreach ($rows as $row) $result[$row['item_name']] = (int) $row['price'];
  json_response($result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM item_prices');
  $stmt = $db->prepare('INSERT INTO item_prices (item_name, price) VALUES (:name, :price)');
  foreach ($body as $name => $price) {
    $stmt->execute(['name' => $name, 'price' => (int) $price]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
