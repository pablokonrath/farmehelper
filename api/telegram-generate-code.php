<?php
// Gera um código de uso único que o jogador manda pro bot (via link t.me/... ou digitando
// "/start CODE" na mão) pra vincular a própria conta — telegram-webhook.php casa o código
// com o user_id e grava alert_settings.telegram_chat_id.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

if (!TELEGRAM_BOT_USERNAME) {
  json_response(['error' => 'not_configured', 'message' => 'Bot do Telegram ainda não foi configurado pelo admin do servidor.'], 400);
}

$db = get_db();
$code = strtoupper(bin2hex(random_bytes(4))); // 8 caracteres, ex: "A1B2C3D4"

$db->prepare('INSERT INTO telegram_link_codes (code, user_id) VALUES (:code, :uid)')
  ->execute(['code' => $code, 'uid' => current_user_id()]);

json_response([
  'ok' => true,
  'code' => $code,
  'botLink' => 'https://t.me/' . TELEGRAM_BOT_USERNAME . '?start=' . $code,
]);
