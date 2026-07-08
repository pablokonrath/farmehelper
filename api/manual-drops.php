<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT drop_date, drop_time, category, name, batch_id FROM manual_drops ORDER BY drop_date, id')->fetchAll();
  $result = array_map(fn($r) => [
    'date' => $r['drop_date'],
    'time' => $r['drop_time'],
    'category' => (int) $r['category'],
    'name' => $r['name'],
    'batchId' => $r['batch_id'],
    'manual' => true,
  ], $rows);
  json_response($result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM manual_drops');
  $stmt = $db->prepare('INSERT INTO manual_drops (drop_date, drop_time, category, name, batch_id)
    VALUES (:date, :time, :category, :name, :batchId)');
  foreach ($body as $drop) {
    $stmt->execute([
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
