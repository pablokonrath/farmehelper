<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT id, ts, item_name, keyword, quantity, seen FROM alert_history WHERE user_id = :uid ORDER BY ts');
  $stmt->execute(['uid' => $uid]);
  // ts é guardado como o horário UTC (vem de toISOString() no client) sem marcador de fuso —
  // precisa reanexar o "Z" aqui, senão new Date(...) no client reinterpreta como hora local
  // e desloca o horário exibido pelo fuso do navegador.
  $result = array_map(fn($r) => [
    'id' => $r['id'],
    'timestamp' => str_replace(' ', 'T', $r['ts']) . 'Z',
    'itemName' => $r['item_name'],
    'keyword' => $r['keyword'],
    'quantity' => (int) $r['quantity'],
    'seen' => (bool) $r['seen'],
  ], $stmt->fetchAll());
  json_response($result);
}

// O client já manda a lista cortada nos 200 mais recentes (mesma regra de hoje em
// persistence.js) — aqui só substitui tudo pelo que veio.
if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM alert_history WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO alert_history (id, user_id, ts, item_name, keyword, quantity, seen)
    VALUES (:id, :uid, :ts, :itemName, :keyword, :quantity, :seen)');
  foreach ($body as $entry) {
    $stmt->execute([
      'id' => $entry['id'] ?? '',
      'uid' => $uid,
      'ts' => str_replace('T', ' ', substr($entry['timestamp'] ?? '', 0, 19)),
      'itemName' => $entry['itemName'] ?? '',
      'keyword' => $entry['keyword'] ?? '',
      'quantity' => (int) ($entry['quantity'] ?? 1),
      'seen' => !empty($entry['seen']) ? 1 : 0,
    ]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
