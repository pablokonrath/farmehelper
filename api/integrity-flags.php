<?php
// Sinalizações heurísticas de possível dado forjado — qualquer usuário logado pode reportar
// uma sobre si mesmo (o worker de polling detectando edição do próprio arquivo), mas só o admin
// mestre pode listar (é informação de moderação, não é pra aparecer pro usuário comum).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
  $body = read_json_body();
  $type = (string) ($body['type'] ?? '');
  $details = (string) ($body['details'] ?? '');
  if ($type === '') json_response(['error' => 'invalid_input', 'message' => 'Tipo obrigatório.'], 400);

  insert_integrity_flag($db, current_user_id(), current_username(), $type, $details);
  json_response(['ok' => true], 201);
}

if ($method === 'GET') {
  require_master_admin();
  $rows = $db->query('SELECT id, username, flag_type, details, created_at FROM integrity_flags ORDER BY created_at DESC LIMIT 100')->fetchAll();
  json_response(array_map(fn($r) => [
    'id' => (int) $r['id'],
    'username' => $r['username'],
    'type' => $r['flag_type'],
    'details' => $r['details'],
    'createdAt' => $r['created_at'],
  ], $rows));
}

json_response(['error' => 'method_not_allowed'], 405);
