<?php
// Cadastro público — qualquer um pode criar a própria conta (nada de is_admin/is_master_admin,
// isso continua exclusivo de quem já tem; ver bootstrap-account.php pra essa primeira conta).
// Cada conta nova é isolada da dos outros: preços, sessões, alertas etc. já são todos
// por user_id (ON DELETE CASCADE), não tem nada de "compartilhado" pra vazar entre contas.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$body = read_json_body();
$username = trim((string) ($body['username'] ?? ''));
$password = (string) ($body['password'] ?? '');

if ($username === '' || mb_strlen($username) < 3 || mb_strlen($username) > 100) {
  json_response(['error' => 'invalid_username', 'message' => 'Escolha um usuário com pelo menos 3 caracteres.'], 400);
}
if (mb_strlen($password) < 8) {
  json_response(['error' => 'invalid_password', 'message' => 'A senha precisa ter pelo menos 8 caracteres.'], 400);
}

$db = get_db();
$ip = $_SERVER['REMOTE_ADDR'] ?? '';

// Throttle anti-spam por IP: reaproveita a mesma tabela/padrão do login.php (ip + janela de
// tempo) — 5 cadastros em 1h já é mais que suficiente pra uso legítimo (uma pessoa cria 1 conta).
// Resiliente à tabela login_attempts ainda não existir, igual ao login.php.
try {
  $db->prepare('DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)')->execute();
  $recent = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = :ip AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)');
  $recent->execute(['ip' => $ip]);
  if ((int) $recent->fetchColumn() >= 5) {
    json_response(['error' => 'too_many_attempts', 'message' => 'Muitas tentativas de cadastro por aqui. Espere um pouco e tente de novo.'], 429);
  }
  $db->prepare('INSERT INTO login_attempts (ip) VALUES (:ip)')->execute(['ip' => $ip]);
} catch (PDOException $e) {
  // sem throttle até a migração da tabela rodar
}

$exists = $db->prepare('SELECT id FROM users WHERE username = :username');
$exists->execute(['username' => $username]);
if ($exists->fetch()) {
  json_response(['error' => 'username_taken', 'message' => 'Esse usuário já existe. Escolha outro.'], 409);
}

try {
  $stmt = $db->prepare('INSERT INTO users (username, password_hash, is_admin, is_master_admin, created_at)
    VALUES (:username, :hash, 0, 0, NOW())');
  $stmt->execute(['username' => $username, 'hash' => password_hash($password, PASSWORD_BCRYPT)]);
} catch (PDOException $e) {
  // corrida rara: dois cadastros com o mesmo usuário quase ao mesmo tempo — a UNIQUE do banco
  // pega o que o SELECT acima não pegou.
  json_response(['error' => 'username_taken', 'message' => 'Esse usuário já existe. Escolha outro.'], 409);
}

$userId = (int) $db->lastInsertId();

session_regenerate_id(true);
$_SESSION['authenticated'] = true;
$_SESSION['user_id'] = $userId;
$_SESSION['is_admin'] = false;
$_SESSION['is_master_admin'] = false;
$_SESSION['username'] = $username;
$_SESSION['guild'] = null;
json_response(['ok' => true]);
