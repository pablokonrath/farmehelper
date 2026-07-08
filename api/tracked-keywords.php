<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT word, alert_enabled FROM tracked_keywords ORDER BY id')->fetchAll();
  $result = array_map(fn($r) => ['word' => $r['word'], 'alertEnabled' => (bool) $r['alert_enabled']], $rows);
  json_response($result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM tracked_keywords');
  $stmt = $db->prepare('INSERT INTO tracked_keywords (word, alert_enabled) VALUES (:word, :enabled)');
  foreach ($body as $kw) {
    $stmt->execute(['word' => $kw['word'] ?? '', 'enabled' => !empty($kw['alertEnabled']) ? 1 : 0]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
