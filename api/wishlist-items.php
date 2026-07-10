<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT item_name FROM wishlist_items WHERE user_id = :uid ORDER BY id');
  $stmt->execute(['uid' => $uid]);
  json_response(array_map(fn($r) => $r['item_name'], $stmt->fetchAll()));
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM wishlist_items WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO wishlist_items (user_id, item_name) VALUES (:uid, :name)');
  foreach ($body as $name) {
    if (is_string($name) && trim($name) !== '') $stmt->execute(['uid' => $uid, 'name' => trim($name)]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
