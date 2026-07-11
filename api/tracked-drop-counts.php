<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

// Igual drop-counts-daily.php (só PUT, replace-all por usuário), mas guarda a contagem por-dia
// dos itens RASTREADOS de cada um (lista pessoal), pra alimentar o /drop do bot do Telegram.
// Body: { "AAAA-MM-DD": { "Item": qtd, ... }, ... }.
if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM tracked_drop_counts_daily WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO tracked_drop_counts_daily (user_id, item_name, drop_date, quantity) VALUES (:uid, :name, :date, :qty)');
  foreach ($body as $date => $items) {
    if (!is_array($items)) continue;
    foreach ($items as $name => $qty) {
      $qty = (int) $qty;
      if ($qty > 0) $stmt->execute(['uid' => $uid, 'name' => $name, 'date' => $date, 'qty' => $qty]);
    }
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
