<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_admin();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT id, username, is_admin, created_at FROM users ORDER BY id')->fetchAll();
  $result = array_map(fn($r) => [
    'id' => (int) $r['id'],
    'username' => $r['username'],
    'isAdmin' => (bool) $r['is_admin'],
    'createdAt' => $r['created_at'],
  ], $rows);
  json_response($result);
}

if ($method === 'POST') {
  $body = read_json_body();
  $username = trim($body['username'] ?? '');
  $password = $body['password'] ?? '';

  if ($username === '' || !is_string($password) || strlen($password) < 4) {
    json_response(['error' => 'invalid_input', 'message' => 'Usuário obrigatório e senha com pelo menos 4 caracteres.'], 400);
  }

  $stmt = $db->prepare('SELECT id FROM users WHERE username = :username');
  $stmt->execute(['username' => $username]);
  if ($stmt->fetch()) {
    json_response(['error' => 'username_taken', 'message' => 'Já existe uma conta com esse usuário.'], 409);
  }

  $stmt = $db->prepare('INSERT INTO users (username, password_hash) VALUES (:username, :hash)');
  $stmt->execute(['username' => $username, 'hash' => password_hash($password, PASSWORD_BCRYPT)]);
  json_response(['ok' => true, 'id' => (int) $db->lastInsertId()], 201);
}

json_response(['error' => 'method_not_allowed'], 405);
