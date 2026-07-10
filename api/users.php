<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_admin();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT id, username, is_admin, guild, created_at FROM users ORDER BY id')->fetchAll();
  $result = array_map(fn($r) => [
    'id' => (int) $r['id'],
    'username' => $r['username'],
    'isAdmin' => (bool) $r['is_admin'],
    'guild' => $r['guild'],
    'createdAt' => $r['created_at'],
  ], $rows);
  json_response($result);
}

if ($method === 'POST') {
  $body = read_json_body();
  $username = trim($body['username'] ?? '');
  $password = $body['password'] ?? '';
  $guild = trim($body['guild'] ?? '');
  $isAdmin = !empty($body['isAdmin']);

  if ($username === '' || !is_string($password) || strlen($password) < 4) {
    json_response(['error' => 'invalid_input', 'message' => 'Usuário obrigatório e senha com pelo menos 4 caracteres.'], 400);
  }

  $stmt = $db->prepare('SELECT id FROM users WHERE username = :username');
  $stmt->execute(['username' => $username]);
  if ($stmt->fetch()) {
    json_response(['error' => 'username_taken', 'message' => 'Já existe uma conta com esse usuário.'], 409);
  }

  $stmt = $db->prepare('INSERT INTO users (username, password_hash, guild, is_admin) VALUES (:username, :hash, :guild, :isAdmin)');
  $stmt->execute([
    'username' => $username,
    'hash' => password_hash($password, PASSWORD_BCRYPT),
    'guild' => $guild !== '' ? $guild : null,
    'isAdmin' => $isAdmin ? 1 : 0,
  ]);
  json_response(['ok' => true, 'id' => (int) $db->lastInsertId()], 201);
}

// Promove/edita uma conta já existente — usado tanto pra alternar admin quanto pra corrigir
// a guild de alguém depois de criada.
if ($method === 'PUT') {
  $body = read_json_body();
  $id = (int) ($body['id'] ?? 0);
  if (!$id) json_response(['error' => 'invalid_input', 'message' => 'ID inválido.'], 400);

  $fields = [];
  $params = ['id' => $id];
  if (array_key_exists('isAdmin', $body)) {
    $fields[] = 'is_admin = :isAdmin';
    $params['isAdmin'] = !empty($body['isAdmin']) ? 1 : 0;
  }
  if (array_key_exists('guild', $body)) {
    $fields[] = 'guild = :guild';
    $guild = trim((string) $body['guild']);
    $params['guild'] = $guild !== '' ? $guild : null;
  }
  if (!$fields) json_response(['error' => 'invalid_input', 'message' => 'Nada pra atualizar.'], 400);

  $stmt = $db->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id');
  $stmt->execute($params);
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
