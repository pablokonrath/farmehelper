<?php
require_once __DIR__ . '/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

if (empty(AUTH_PASSWORD_HASH)) {
  json_response(['error' => 'server_not_configured', 'message' => 'AUTH_PASSWORD_HASH não configurado em config.php'], 500);
}

$body = read_json_body();
$password = $body['password'] ?? '';

if (!is_string($password) || $password === '' || !password_verify($password, AUTH_PASSWORD_HASH)) {
  json_response(['error' => 'invalid_password'], 401);
}

session_regenerate_id(true);
$_SESSION['authenticated'] = true;
json_response(['ok' => true]);
