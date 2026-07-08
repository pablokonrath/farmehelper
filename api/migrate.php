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
$db->beginTransaction();

$itemPrices = $body['itemPrices'] ?? [];
$db->exec('DELETE FROM item_prices');
$stmt = $db->prepare('INSERT INTO item_prices (item_name, price) VALUES (:name, :price)');
foreach ($itemPrices as $name => $price) $stmt->execute(['name' => $name, 'price' => (int) $price]);

$rushHistory = $body['rushHistory'] ?? [];
$db->exec('DELETE FROM rush_history');
$stmt = $db->prepare('INSERT INTO rush_history (rush_date, total, items) VALUES (:date, :total, :items)');
foreach ($rushHistory as $date => $entry) {
  $stmt->execute(['date' => $date, 'total' => (int) ($entry['total'] ?? 0), 'items' => json_encode($entry['items'] ?? [])]);
}

$trackedKeywords = $body['trackedKeywords'] ?? [];
$db->exec('DELETE FROM tracked_keywords');
$stmt = $db->prepare('INSERT INTO tracked_keywords (word, alert_enabled) VALUES (:word, :enabled)');
foreach ($trackedKeywords as $kw) $stmt->execute(['word' => $kw['word'] ?? '', 'enabled' => !empty($kw['alertEnabled']) ? 1 : 0]);

$stmt = $db->prepare('INSERT INTO app_settings (setting_key, setting_value) VALUES (:key, :value)
  ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)');
$stmt->execute(['key' => 'filterByTrackedKeywords', 'value' => json_encode(!empty($body['filterByTrackedKeywords']))]);

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

$manualDrops = $body['manualDrops'] ?? [];
$db->exec('DELETE FROM manual_drops');
$stmt = $db->prepare('INSERT INTO manual_drops (drop_date, drop_time, category, name, batch_id)
  VALUES (:date, :time, :category, :name, :batchId)');
foreach ($manualDrops as $drop) {
  $stmt->execute([
    'date' => $drop['date'] ?? '', 'time' => $drop['time'] ?? '00:00:00',
    'category' => (int) ($drop['category'] ?? 0), 'name' => $drop['name'] ?? '',
    'batchId' => $drop['batchId'] ?? '',
  ]);
}

$alertSettings = $body['alertSettings'] ?? null;
if ($alertSettings) {
  $stmt = $db->prepare('UPDATE alert_settings SET
    enabled = :enabled, sound_enabled = :soundEnabled, repeat_sound_while_open = :repeatSoundWhileOpen,
    volume = :volume, popup_duration_seconds = :popupDurationSeconds, grouping_window_seconds = :groupingWindowSeconds
    WHERE id = 1');
  $stmt->execute([
    'enabled' => !empty($alertSettings['enabled']) ? 1 : 0,
    'soundEnabled' => !empty($alertSettings['soundEnabled']) ? 1 : 0,
    'repeatSoundWhileOpen' => !empty($alertSettings['repeatSoundWhileOpen']) ? 1 : 0,
    'volume' => (float) ($alertSettings['volume'] ?? 0.7),
    'popupDurationSeconds' => (int) ($alertSettings['popupDurationSeconds'] ?? 5),
    'groupingWindowSeconds' => (int) ($alertSettings['groupingWindowSeconds'] ?? 30),
  ]);
}

$alertHistory = $body['alertHistory'] ?? [];
$db->exec('DELETE FROM alert_history');
$stmt = $db->prepare('INSERT INTO alert_history (id, ts, item_name, keyword, quantity, seen)
  VALUES (:id, :ts, :itemName, :keyword, :quantity, :seen)');
foreach ($alertHistory as $entry) {
  $stmt->execute([
    'id' => $entry['id'] ?? '', 'ts' => str_replace('T', ' ', substr($entry['timestamp'] ?? '', 0, 19)),
    'itemName' => $entry['itemName'] ?? '', 'keyword' => $entry['keyword'] ?? '',
    'quantity' => (int) ($entry['quantity'] ?? 1), 'seen' => !empty($entry['seen']) ? 1 : 0,
  ]);
}

$db->commit();
json_response(['ok' => true]);
