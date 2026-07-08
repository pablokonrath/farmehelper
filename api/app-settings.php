<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT setting_key, setting_value FROM app_settings WHERE user_id = :uid');
  $stmt->execute(['uid' => $uid]);
  $result = [];
  foreach ($stmt->fetchAll() as $row) $result[$row['setting_key']] = json_decode($row['setting_value'], true);
  json_response($result);
}

// Faz upsert só das chaves enviadas — não apaga flags não mencionadas no body, ao contrário
// dos outros endpoints (esse é um "balaio" genérico de configs avulsas, não uma lista única).
if ($method === 'PUT') {
  $body = read_json_body();
  $stmt = $db->prepare('INSERT INTO app_settings (user_id, setting_key, setting_value) VALUES (:uid, :key, :value)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)');
  foreach ($body as $key => $value) {
    $stmt->execute(['uid' => $uid, 'key' => $key, 'value' => json_encode($value)]);
  }
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
