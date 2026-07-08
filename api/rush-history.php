<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT rush_date, total, items FROM rush_history WHERE user_id = :uid');
  $stmt->execute(['uid' => $uid]);
  $result = [];
  foreach ($stmt->fetchAll() as $row) {
    $result[$row['rush_date']] = ['total' => (int) $row['total'], 'items' => json_decode($row['items'], true) ?? []];
  }
  json_response($result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM rush_history WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO rush_history (user_id, rush_date, total, items) VALUES (:uid, :date, :total, :items)');
  foreach ($body as $date => $entry) {
    $stmt->execute([
      'uid' => $uid,
      'date' => $date,
      'total' => (int) ($entry['total'] ?? 0),
      'items' => json_encode($entry['items'] ?? []),
    ]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
