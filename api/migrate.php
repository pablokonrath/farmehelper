<?php
// Endpoint de uso único: importa tudo que estava no localStorage do navegador de uma vez
// só, na primeira vez que o app roda com o backend configurado (ver js/state/persistence.js).
// Chamado depois do login, então já está protegido por sessão como qualquer outro endpoint.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$body = read_json_body();
$db = get_db();
$uid = current_user_id();
$db->beginTransaction();

// itemPrices e dungeonList são globais/compartilhados (sem user_id) — sem mudança aqui.
$itemPrices = $body['itemPrices'] ?? [];
$db->exec('DELETE FROM item_prices');
$stmt = $db->prepare('INSERT INTO item_prices (item_name, price) VALUES (:name, :price)');
foreach ($itemPrices as $name => $price) $stmt->execute(['name' => $name, 'price' => (int) $price]);

// dungeonList vem sempre preenchido do client (AppState nunca fica com a lista vazia — ver
// DEFAULT_DUNGEONS em app-state.js), então não precisa de guarda contra lista vazia aqui.
$dungeonList = $body['dungeonList'] ?? [];
$db->exec('DELETE FROM dungeons');
$stmt = $db->prepare('INSERT INTO dungeons (id, name, alz_cost, tickets_per_run, gems_per_run)
  VALUES (:id, :name, :alzCost, :ticketsPerRun, :gemsPerRun)');
foreach ($dungeonList as $dg) {
  $stmt->execute([
    'id' => $dg['id'] ?? '', 'name' => $dg['name'] ?? '',
    'alzCost' => (int) ($dg['alzCost'] ?? 0),
    'ticketsPerRun' => (int) ($dg['ticketsPerRun'] ?? 0),
    'gemsPerRun' => (int) ($dg['gemsPerRun'] ?? 0),
  ]);
}

// Daqui pra baixo é tudo privado do usuário logado (user_id).
$rushHistory = $body['rushHistory'] ?? [];
$db->prepare('DELETE FROM rush_history WHERE user_id = :uid')->execute(['uid' => $uid]);
$stmt = $db->prepare('INSERT INTO rush_history (user_id, rush_date, total, items) VALUES (:uid, :date, :total, :items)');
foreach ($rushHistory as $date => $entry) {
  $stmt->execute(['uid' => $uid, 'date' => $date, 'total' => (int) ($entry['total'] ?? 0), 'items' => json_encode($entry['items'] ?? [])]);
}

$trackedKeywords = $body['trackedKeywords'] ?? [];
$db->prepare('DELETE FROM tracked_keywords WHERE user_id = :uid')->execute(['uid' => $uid]);
$stmt = $db->prepare('INSERT INTO tracked_keywords (user_id, word, alert_enabled) VALUES (:uid, :word, :enabled)');
foreach ($trackedKeywords as $kw) $stmt->execute(['uid' => $uid, 'word' => $kw['word'] ?? '', 'enabled' => !empty($kw['alertEnabled']) ? 1 : 0]);

$stmt = $db->prepare('INSERT INTO app_settings (user_id, setting_key, setting_value) VALUES (:uid, :key, :value)
  ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)');
$stmt->execute(['uid' => $uid, 'key' => 'filterByTrackedKeywords', 'value' => json_encode(!empty($body['filterByTrackedKeywords']))]);

$manualDrops = $body['manualDrops'] ?? [];
$db->prepare('DELETE FROM manual_drops WHERE user_id = :uid')->execute(['uid' => $uid]);
$stmt = $db->prepare('INSERT INTO manual_drops (user_id, drop_date, drop_time, category, name, batch_id)
  VALUES (:uid, :date, :time, :category, :name, :batchId)');
foreach ($manualDrops as $drop) {
  $stmt->execute([
    'uid' => $uid, 'date' => $drop['date'] ?? '', 'time' => $drop['time'] ?? '00:00:00',
    'category' => (int) ($drop['category'] ?? 0), 'name' => $drop['name'] ?? '',
    'batchId' => $drop['batchId'] ?? '',
  ]);
}

$alertSettings = $body['alertSettings'] ?? null;
if ($alertSettings) {
  $stmt = $db->prepare('INSERT INTO alert_settings
    (user_id, enabled, sound_enabled, repeat_sound_while_open, volume, popup_duration_seconds, grouping_window_seconds)
    VALUES (:uid, :enabled, :soundEnabled, :repeatSoundWhileOpen, :volume, :popupDurationSeconds, :groupingWindowSeconds)
    ON DUPLICATE KEY UPDATE
      enabled = VALUES(enabled), sound_enabled = VALUES(sound_enabled),
      repeat_sound_while_open = VALUES(repeat_sound_while_open), volume = VALUES(volume),
      popup_duration_seconds = VALUES(popup_duration_seconds), grouping_window_seconds = VALUES(grouping_window_seconds)');
  $stmt->execute([
    'uid' => $uid,
    'enabled' => !empty($alertSettings['enabled']) ? 1 : 0,
    'soundEnabled' => !empty($alertSettings['soundEnabled']) ? 1 : 0,
    'repeatSoundWhileOpen' => !empty($alertSettings['repeatSoundWhileOpen']) ? 1 : 0,
    'volume' => (float) ($alertSettings['volume'] ?? 0.7),
    'popupDurationSeconds' => (int) ($alertSettings['popupDurationSeconds'] ?? 5),
    'groupingWindowSeconds' => (int) ($alertSettings['groupingWindowSeconds'] ?? 30),
  ]);
}

$alertHistory = $body['alertHistory'] ?? [];
$db->prepare('DELETE FROM alert_history WHERE user_id = :uid')->execute(['uid' => $uid]);
$stmt = $db->prepare('INSERT INTO alert_history (id, user_id, ts, item_name, keyword, quantity, seen)
  VALUES (:id, :uid, :ts, :itemName, :keyword, :quantity, :seen)');
foreach ($alertHistory as $entry) {
  $stmt->execute([
    'id' => $entry['id'] ?? '', 'uid' => $uid, 'ts' => str_replace('T', ' ', substr($entry['timestamp'] ?? '', 0, 19)),
    'itemName' => $entry['itemName'] ?? '', 'keyword' => $entry['keyword'] ?? '',
    'quantity' => (int) ($entry['quantity'] ?? 1), 'seen' => !empty($entry['seen']) ? 1 : 0,
  ]);
}

$db->commit();
json_response(['ok' => true]);
