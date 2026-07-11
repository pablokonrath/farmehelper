<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT item_name, price FROM item_prices WHERE user_id = :uid');
  $stmt->execute(['uid' => $uid]);
  $result = [];
  foreach ($stmt->fetchAll() as $row) $result[$row['item_name']] = (int) $row['price'];
  // (object) garante {} no JSON quando vazio — ver comentário em item-category-assignments.php.
  json_response((object) $result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM item_prices WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO item_prices (user_id, item_name, price) VALUES (:uid, :name, :price)');
  foreach ($body as $name => $price) {
    $stmt->execute(['uid' => $uid, 'name' => $name, 'price' => (int) $price]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
