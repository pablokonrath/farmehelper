<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

// Sessão de 90 dias — uso é individual (só sua conta existe), então não faz sentido pedir
// login de novo toda vez que fecha o navegador. httponly evita acesso via JS (protege contra
// XSS roubando o cookie); samesite=Lax é suficiente já que front e back ficam no mesmo domínio.
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 90;
// session.gc_maxlifetime é o que decide quando o PHP apaga o arquivo de sessão no servidor —
// sem isso, o cookie duraria 90 dias no navegador mas a sessão em si podia expirar bem antes
// (o padrão do PHP costuma ser ~24min de inatividade).
ini_set('session.gc_maxlifetime', (string) SESSION_LIFETIME_SECONDS);
session_set_cookie_params([
  'lifetime' => SESSION_LIFETIME_SECONDS,
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
