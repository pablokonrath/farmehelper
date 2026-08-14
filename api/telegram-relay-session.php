<?php
// Chamado pelo cliente (com o FarmHub aberto) em dois momentos da rotina de farme: quando uma DG
// bate o limite diário de runs, e quando uma sessão é encerrada sozinha por falta de drop.
//
// Separado do relay de watchdog de propósito: aquele é alerta de PROBLEMA (helper travado) e vem
// com ⚠️. Estes são avisos de rotina — quem quer saber que a DG acabou pode não querer ser
// avisado de travamento, e vice-versa. Gate próprio, ícone próprio.
//
// Não funciona com o navegador fechado: quem detecta é a aba lendo o log do jogo.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$db = get_db();
$uid = current_user_id();

// Revalida no servidor mesmo o cliente já tendo checado: o toggle vive no banco, e é ele que
// manda. Cliente desatualizado não deve conseguir mandar mensagem que o jogador desligou.
$stmt = $db->prepare('SELECT telegram_chat_id, telegram_session_relay_enabled FROM alert_settings WHERE user_id = :uid');
$stmt->execute(['uid' => $uid]);
$row = $stmt->fetch();
if (!$row || !$row['telegram_session_relay_enabled'] || !$row['telegram_chat_id']) {
  json_response(['ok' => true, 'sent' => false]);
}

$body = read_json_body();
$message = trim($body['message'] ?? '');
if ($message === '') json_response(['ok' => true, 'sent' => false]);

// Corta mensagem absurda antes de mandar pro Telegram (limite dele é 4096) — resumo de sessão é
// texto gerado, e texto gerado é onde estouro aparece sem ninguém esperar.
$text = mb_substr($message, 0, 3500);

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
