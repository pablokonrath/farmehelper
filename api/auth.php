<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

// httponly evita acesso via JS (protege contra XSS roubando o cookie de sessão);
// samesite=Lax é suficiente já que front e back ficam no mesmo domínio.
session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'httponly' => true,
  'samesite' => 'Lax',
  'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
]);
session_start();

function require_login(): void {
  if (empty($_SESSION['authenticated'])) {
    json_response(['error' => 'not_authenticated'], 401);
  }
}

function current_user_id(): int {
  return (int) $_SESSION['user_id'];
}
