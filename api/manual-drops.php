<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT drop_date, drop_time, category, name, batch_id FROM manual_drops WHERE user_id = :uid ORDER BY drop_date, id');
  $stmt->execute(['uid' => $uid]);
  $result = array_map(fn($r) => [
    'date' => $r['drop_date'],
    'time' => $r['drop_time'],
    'category' => (int) $r['category'],
    'name' => $r['name'],
    'batchId' => $r['batch_id'],
    'manual' => true,
  ], $stmt->fetchAll());
  json_response($result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM manual_drops WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO manual_drops (user_id, drop_date, drop_time, category, name, batch_id)
    VALUES (:uid, :date, :time, :category, :name, :batchId)');
  foreach ($body as $drop) {
    $stmt->execute([
      'uid' => $uid,
      'date' => $drop['date'] ?? '',
      'time' => $drop['time'] ?? '00:00:00',
      'category' => (int) ($drop['category'] ?? 0),
      'name' => $drop['name'] ?? '',
      'batchId' => $drop['batchId'] ?? '',
    ]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
