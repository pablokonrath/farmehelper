<?php
// Configuração (arquivo + volume) de som por tipo de alerta — qualquer usuário logado LÊ
// (precisa saber qual som tocar), só admin ESCREVE o volume. Trocar o arquivo em si é só via
// upload-alert-sound.php (multipart, não cabe num PUT de JSON comum).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$ALERT_TYPES = ['tg', 'worldboss', 'watchdog'];

if ($method === 'GET') {
  $rows = $db->query('SELECT alert_type, filename, volume FROM alert_sounds')->fetchAll();
  $result = [];
  foreach ($rows as $r) {
    $result[$r['alert_type']] = ['filename' => $r['filename'], 'volume' => (float) $r['volume']];
  }
  json_response($result);
}

if ($method === 'PUT') {
  require_admin();
  $body = read_json_body();
  $alertType = $body['alertType'] ?? '';
  if (!in_array($alertType, $ALERT_TYPES, true)) json_response(['error' => 'invalid_input', 'message' => 'Tipo de alerta inválido.'], 400);
  $volume = max(0, min(1, (float) ($body['volume'] ?? 0.9)));
  $db->prepare('UPDATE alert_sounds SET volume = :volume WHERE alert_type = :type')->execute(['volume' => $volume, 'type' => $alertType]);
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
