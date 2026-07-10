<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT id, dropper_username, dropper_guild, item_name, ts, seen FROM wishlist_matches WHERE wishlist_user_id = :uid ORDER BY ts DESC LIMIT 200');
  $stmt->execute(['uid' => $uid]);
  json_response(array_map(fn($r) => [
    'id' => (int) $r['id'],
    'dropperUsername' => $r['dropper_username'],
    'dropperGuild' => $r['dropper_guild'],
    'itemName' => $r['item_name'],
    // Espaço em vez de T + Z: mesma correção de fuso já usada em alert-history.php, pra
    // new Date() no cliente interpretar como UTC em vez de horário local.
    'ts' => str_replace(' ', 'T', $r['ts']) . 'Z',
    'seen' => (bool) $r['seen'],
  ], $stmt->fetchAll()));
}

// Marca tudo como visto (o usuário abriu a página Lista de desejos) — sem seletividade por
// linha, mesmo padrão de markAllAlertsSeen() em alerts.js.
if ($method === 'PUT') {
  $body = read_json_body();
  if (!empty($body['seen'])) {
    $db->prepare('UPDATE wishlist_matches SET seen = 1 WHERE wishlist_user_id = :uid')->execute(['uid' => $uid]);
  }
  json_response(['ok' => true]);
}

if ($method === 'DELETE') {
  $db->prepare('DELETE FROM wishlist_matches WHERE wishlist_user_id = :uid')->execute(['uid' => $uid]);
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
