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

$db = get_db();
$ip = $_SERVER['REMOTE_ADDR'] ?? '';

// Throttle anti-força-bruta por IP: 10+ falhas em 15 min bloqueia por um tempo (senha fraca deixa
// de ser adivinhável por tentativa e erro). Resiliente à tabela login_attempts ainda não existir
// (migração pendente) — nesse caso apenas não limita, sem quebrar o login.
try {
  $db->prepare('DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)')->execute();
  $recent = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = :ip AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)');
  $recent->execute(['ip' => $ip]);
  if ((int) $recent->fetchColumn() >= 10) {
    json_response(['error' => 'too_many_attempts', 'message' => 'Muitas tentativas de login. Espere alguns minutos e tente de novo.'], 429);
  }
} catch (PDOException $e) {
  // sem throttle até a migração rodar
}

$stmt = $db->prepare('SELECT id, password_hash, is_admin, is_master_admin, guild FROM users WHERE username = :username');
$stmt->execute(['username' => $username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
  try { $db->prepare('INSERT INTO login_attempts (ip) VALUES (:ip)')->execute(['ip' => $ip]); } catch (PDOException $e) {}
  json_response(['error' => 'invalid_credentials'], 401);
}

session_regenerate_id(true);
$_SESSION['authenticated'] = true;
$_SESSION['user_id'] = (int) $user['id'];
$_SESSION['is_admin'] = !empty($user['is_admin']);
$_SESSION['is_master_admin'] = !empty($user['is_master_admin']);
$_SESSION['username'] = $username;
$_SESSION['guild'] = $user['guild'];
json_response(['ok' => true]);
