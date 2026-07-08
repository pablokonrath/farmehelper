<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT rush_date, total, items FROM rush_history')->fetchAll();
  $result = [];
  foreach ($rows as $row) {
    $result[$row['rush_date']] = ['total' => (int) $row['total'], 'items' => json_decode($row['items'], true) ?? []];
  }
  json_response($result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM rush_history');
  $stmt = $db->prepare('INSERT INTO rush_history (rush_date, total, items) VALUES (:date, :total, :items)');
  foreach ($body as $date => $entry) {
    $stmt->execute([
      'date' => $date,
      'total' => (int) ($entry['total'] ?? 0),
      'items' => json_encode($entry['items'] ?? []),
    ]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
