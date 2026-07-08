<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT word, alert_enabled FROM tracked_keywords WHERE user_id = :uid ORDER BY id');
  $stmt->execute(['uid' => $uid]);
  $result = array_map(fn($r) => ['word' => $r['word'], 'alertEnabled' => (bool) $r['alert_enabled']], $stmt->fetchAll());
  json_response($result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM tracked_keywords WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO tracked_keywords (user_id, word, alert_enabled) VALUES (:uid, :word, :enabled)');
  foreach ($body as $kw) {
    $stmt->execute(['uid' => $uid, 'word' => $kw['word'] ?? '', 'enabled' => !empty($kw['alertEnabled']) ? 1 : 0]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
