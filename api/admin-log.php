<?php
// Registro do que cada admin criou/alterou. Qualquer admin (inclusive líder de guild) ESCREVE
// — pra registrar a criação de conta que ele faz. Só o admin mestre LÊ o log (oversight).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_admin();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
  $body = read_json_body();
  $action = (string) ($body['action'] ?? '');
  $details = (string) ($body['details'] ?? '');
  if ($action === '') json_response(['error' => 'invalid_input', 'message' => 'Ação obrigatória.'], 400);

  $stmt = $db->prepare('INSERT INTO admin_action_log (admin_user_id, admin_username, action, details) VALUES (:uid, :username, :action, :details)');
  $stmt->execute(['uid' => current_user_id(), 'username' => current_username(), 'action' => $action, 'details' => $details]);
  json_response(['ok' => true], 201);
}

if ($method === 'GET') {
  require_master_admin();
  $rows = $db->query('SELECT id, admin_username, action, details, created_at FROM admin_action_log ORDER BY created_at DESC LIMIT 100')->fetchAll();
  json_response(array_map(fn($r) => [
    'id' => (int) $r['id'],
    'adminUsername' => $r['admin_username'],
    'action' => $r['action'],
    'details' => $r['details'],
    'createdAt' => $r['created_at'],
  ], $rows));
}

json_response(['error' => 'method_not_allowed'], 405);
