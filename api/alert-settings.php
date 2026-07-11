<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

// alert_settings tem no máximo uma linha por usuário, criada só quando ele salva pela
// primeira vez (upsert no PUT) — sem linha ainda, GET devolve os defaults em vez de falhar.
if ($method === 'GET') {
  $stmt = $db->prepare('SELECT * FROM alert_settings WHERE user_id = :uid');
  $stmt->execute(['uid' => $uid]);
  $row = $stmt->fetch();
  if (!$row) {
    json_response([
      'enabled' => true, 'soundEnabled' => true, 'repeatSoundWhileOpen' => false,
      'volume' => 0.7, 'popupDurationSeconds' => 5, 'groupingWindowSeconds' => 30,
      'noDropThresholdMinutes' => 1, 'itemSilenceThresholdMinutes' => 60,
      'watchdogEnabled' => false,
      'tgNotificationsEnabled' => true, 'worldbossNotificationsEnabled' => true,
      'pushEnabled' => false, 'telegramChatId' => null,
      'telegramDropRelayEnabled' => false,
    ]);
  }
  json_response([
    'enabled' => (bool) $row['enabled'],
    'soundEnabled' => (bool) $row['sound_enabled'],
    'repeatSoundWhileOpen' => (bool) $row['repeat_sound_while_open'],
    'volume' => (float) $row['volume'],
    'popupDurationSeconds' => (int) $row['popup_duration_seconds'],
    'groupingWindowSeconds' => (int) $row['grouping_window_seconds'],
    'noDropThresholdMinutes' => (int) $row['no_drop_threshold_minutes'],
    'itemSilenceThresholdMinutes' => (int) $row['item_silence_threshold_minutes'],
    'watchdogEnabled' => (bool) $row['watchdog_enabled'],
    'tgNotificationsEnabled' => (bool) $row['tg_notifications_enabled'],
    'worldbossNotificationsEnabled' => (bool) $row['worldboss_notifications_enabled'],
    'pushEnabled' => (bool) $row['push_enabled'],
    'telegramChatId' => $row['telegram_chat_id'],
    'telegramDropRelayEnabled' => (bool) $row['telegram_drop_relay_enabled'],
  ]);
}

if ($method === 'PUT') {
  $body = read_json_body();
  // telegram_chat_id de propósito NÃO entra aqui — só telegram-webhook.php grava isso, senão
  // qualquer cliente podia mandar um chat_id arbitrário e "roubar" o vínculo de outra pessoa.
  $stmt = $db->prepare('INSERT INTO alert_settings
    (user_id, enabled, sound_enabled, repeat_sound_while_open, volume, popup_duration_seconds, grouping_window_seconds, no_drop_threshold_minutes, item_silence_threshold_minutes, watchdog_enabled, tg_notifications_enabled, worldboss_notifications_enabled, push_enabled, telegram_drop_relay_enabled)
    VALUES (:uid, :enabled, :soundEnabled, :repeatSoundWhileOpen, :volume, :popupDurationSeconds, :groupingWindowSeconds, :noDropThresholdMinutes, :itemSilenceThresholdMinutes, :watchdogEnabled, :tgNotificationsEnabled, :worldbossNotificationsEnabled, :pushEnabled, :telegramDropRelayEnabled)
    ON DUPLICATE KEY UPDATE
      enabled = VALUES(enabled), sound_enabled = VALUES(sound_enabled),
      repeat_sound_while_open = VALUES(repeat_sound_while_open), volume = VALUES(volume),
      popup_duration_seconds = VALUES(popup_duration_seconds), grouping_window_seconds = VALUES(grouping_window_seconds),
      no_drop_threshold_minutes = VALUES(no_drop_threshold_minutes), item_silence_threshold_minutes = VALUES(item_silence_threshold_minutes),
      watchdog_enabled = VALUES(watchdog_enabled), tg_notifications_enabled = VALUES(tg_notifications_enabled),
      worldboss_notifications_enabled = VALUES(worldboss_notifications_enabled), push_enabled = VALUES(push_enabled),
      telegram_drop_relay_enabled = VALUES(telegram_drop_relay_enabled)');
  $stmt->execute([
    'uid' => $uid,
    'enabled' => !empty($body['enabled']) ? 1 : 0,
    'soundEnabled' => !empty($body['soundEnabled']) ? 1 : 0,
    'repeatSoundWhileOpen' => !empty($body['repeatSoundWhileOpen']) ? 1 : 0,
    'volume' => (float) ($body['volume'] ?? 0.7),
    'popupDurationSeconds' => (int) ($body['popupDurationSeconds'] ?? 5),
    'groupingWindowSeconds' => (int) ($body['groupingWindowSeconds'] ?? 30),
    'noDropThresholdMinutes' => (int) ($body['noDropThresholdMinutes'] ?? 1),
    'itemSilenceThresholdMinutes' => (int) ($body['itemSilenceThresholdMinutes'] ?? 60),
    'watchdogEnabled' => !empty($body['watchdogEnabled']) ? 1 : 0,
    'tgNotificationsEnabled' => !empty($body['tgNotificationsEnabled']) ? 1 : 0,
    'worldbossNotificationsEnabled' => !empty($body['worldbossNotificationsEnabled']) ? 1 : 0,
    'pushEnabled' => !empty($body['pushEnabled']) ? 1 : 0,
    'telegramDropRelayEnabled' => !empty($body['telegramDropRelayEnabled']) ? 1 : 0,
  ]);
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
