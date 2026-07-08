<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $row = $db->query('SELECT * FROM alert_settings WHERE id = 1')->fetch();
  json_response([
    'enabled' => (bool) $row['enabled'],
    'soundEnabled' => (bool) $row['sound_enabled'],
    'repeatSoundWhileOpen' => (bool) $row['repeat_sound_while_open'],
    'volume' => (float) $row['volume'],
    'popupDurationSeconds' => (int) $row['popup_duration_seconds'],
    'groupingWindowSeconds' => (int) $row['grouping_window_seconds'],
  ]);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $stmt = $db->prepare('UPDATE alert_settings SET
    enabled = :enabled,
    sound_enabled = :soundEnabled,
    repeat_sound_while_open = :repeatSoundWhileOpen,
    volume = :volume,
    popup_duration_seconds = :popupDurationSeconds,
    grouping_window_seconds = :groupingWindowSeconds
    WHERE id = 1');
  $stmt->execute([
    'enabled' => !empty($body['enabled']) ? 1 : 0,
    'soundEnabled' => !empty($body['soundEnabled']) ? 1 : 0,
    'repeatSoundWhileOpen' => !empty($body['repeatSoundWhileOpen']) ? 1 : 0,
    'volume' => (float) ($body['volume'] ?? 0.7),
    'popupDurationSeconds' => (int) ($body['popupDurationSeconds'] ?? 5),
    'groupingWindowSeconds' => (int) ($body['groupingWindowSeconds'] ?? 30),
  ]);
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
