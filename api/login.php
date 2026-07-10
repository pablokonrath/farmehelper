<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$body = read_json_body();
$username = $body['username'] ?? '';
$password = $body['password'] ?? '';

if (!is_string($username) || $username === '' || !is_string($password) || $password === '') {
  json_response(['error' => 'invalid_credentials'], 401);
}

$stmt = get_db()->prepare('SELECT id, password_hash, is_admin FROM users WHERE username = :username');
$stmt->execute(['username' => $username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
  json_response(['error' => 'invalid_credentials'], 401);
}

session_regenerate_id(true);
$_SESSION['authenticated'] = true;
$_SESSION['user_id'] = (int) $user['id'];
$_SESSION['is_admin'] = !empty($user['is_admin']);
json_response(['ok' => true]);
