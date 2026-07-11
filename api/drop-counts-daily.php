<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

// Igual drop-counts.php (só PUT, sem GET — o consumo cross-usuário é via leaderboard.php),
// mas com granularidade por dia: body é { "AAAA-MM-DD": { "Item": qtd, ... }, ... }.
if ($method === 'PUT') {
  $body = read_json_body();
  // Teto de histórico: ignora datas com mais de 31 dias (o arquivo do jogo já só guarda ~30) —
  // rede de segurança contra um cliente despejar data velha e inflar a tabela sem limite.
  date_default_timezone_set('America/Sao_Paulo');
  $cutoff = date('Y-m-d', strtotime('-31 days'));
  $db->beginTransaction();
  $db->prepare('DELETE FROM drop_counts_daily WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO drop_counts_daily (user_id, item_name, drop_date, quantity) VALUES (:uid, :name, :date, :qty)');
  foreach ($body as $date => $items) {
    if (!is_array($items)) continue;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date < $cutoff) continue;
    foreach ($items as $name => $qty) {
      $qty = (int) $qty;
      if ($qty > 0) $stmt->execute(['uid' => $uid, 'name' => $name, 'date' => $date, 'qty' => $qty]);
    }
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
