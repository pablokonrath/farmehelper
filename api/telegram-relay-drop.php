<?php
// Chamado pelo próprio cliente (com o FarmHub aberto) toda vez que um drop rastreado dispara
// um alerta — repassa pro Telegram do jogador na hora. Não funciona com o navegador fechado:
// quem detecta o drop é a aba lendo o log do jogo, não o servidor (ver DEPLOY.md).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$db = get_db();
$uid = current_user_id();

$stmt = $db->prepare('SELECT telegram_chat_id, telegram_drop_relay_enabled FROM alert_settings WHERE user_id = :uid');
$stmt->execute(['uid' => $uid]);
$row = $stmt->fetch();
// Sem vínculo ou com o relay desligado — não faz nada (não é erro; o cliente também checa antes).
if (!$row || !$row['telegram_drop_relay_enabled'] || !$row['telegram_chat_id']) {
  json_response(['ok' => true, 'sent' => false]);
}

$body = read_json_body();
$itemName = trim($body['itemName'] ?? '');
$keyword = trim($body['keyword'] ?? '');
$quantity = (int) ($body['quantity'] ?? 1);
if ($itemName === '') json_response(['ok' => true, 'sent' => false]);

$text = '💎 Drop rastreado: ' . $itemName
  . ($quantity > 1 ? ' (' . $quantity . 'x)' : '')
  . ($keyword !== '' ? "\nPalavra: " . $keyword : '');

if (defined('TELEGRAM_BOT_TOKEN') && TELEGRAM_BOT_TOKEN) {
  $ch = curl_init('https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['chat_id' => $row['telegram_chat_id'], 'text' => $text]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
  ]);
  curl_exec($ch);
  curl_close($ch);
}

json_response(['ok' => true, 'sent' => true]);
