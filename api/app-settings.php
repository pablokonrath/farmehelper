<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT setting_key, setting_value FROM app_settings')->fetchAll();
  $result = [];
  foreach ($rows as $row) $result[$row['setting_key']] = json_decode($row['setting_value'], true);
  json_response($result);
}

// Faz upsert só das chaves enviadas — não apaga flags não mencionadas no body, ao contrário
// dos outros endpoints (esse é um "balaio" genérico de configs avulsas, não uma lista única).
if ($method === 'PUT') {
  $body = read_json_body();
  $stmt = $db->prepare('INSERT INTO app_settings (setting_key, setting_value) VALUES (:key, :value)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)');
  foreach ($body as $key => $value) {
    $stmt->execute(['key' => $key, 'value' => json_encode($value)]);
  }
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
