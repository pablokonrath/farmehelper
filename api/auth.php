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

// O admin mestre conta como admin mesmo que is_admin esteja 0 — rede de segurança contra
// ficar trancado fora das áreas gateadas por require_admin() (categorias, agenda de
// eventos, sons, catálogo de DGs) por causa de um valor errado nessa coluna.
function current_user_is_admin(): bool {
  return !empty($_SESSION['is_admin']) || !empty($_SESSION['is_master_admin']);
}

function current_user_is_master_admin(): bool {
  return !empty($_SESSION['is_master_admin']);
}

function current_username(): string {
  return (string) ($_SESSION['username'] ?? '');
}

function require_admin(): void {
  require_login();
  if (!current_user_is_admin()) {
    json_response(['error' => 'not_admin'], 403);
  }
}

function require_master_admin(): void {
  require_admin();
  if (!current_user_is_master_admin()) {
    json_response(['error' => 'not_master_admin'], 403);
  }
}
