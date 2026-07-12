<?php
// Recebe os drops do agente do PC (droplist-agent.ps1) — SEM sessão de navegador, autenticado
// pelo token pessoal. Casa contra as palavras rastreadas do dono e dispara os avisos (Telegram
// e/ou push) na hora. É o que faz o monitoramento funcionar com o navegador fechado.
// Não grava contagem: quando o jogador abrir o app, o log é lido inteiro e sincronizado normal.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$body = read_json_body();
$token = is_string($body['token'] ?? null) ? $body['token'] : '';
$items = array_values(array_filter($body['items'] ?? [], 'is_string'));
if ($token === '') json_response(['error' => 'no_token'], 401);

$db = get_db();

// Acha o dono pelo token (guardado como JSON string em app_settings, por isso o json_encode).
$stmt = $db->prepare("SELECT user_id FROM app_settings WHERE setting_key = 'agentToken' AND setting_value = :val LIMIT 1");
$stmt->execute(['val' => json_encode($token)]);
$row = $stmt->fetch();
if (!$row) json_response(['error' => 'invalid_token'], 403);
$uid = (int) $row['user_id'];

if (!$items) json_response(['ok' => true, 'matched' => 0]);

// Palavras rastreadas com alerta ligado.
$kwStmt = $db->prepare('SELECT word FROM tracked_keywords WHERE user_id = :uid AND alert_enabled = 1');
$kwStmt->execute(['uid' => $uid]);
$keywords = array_column($kwStmt->fetchAll(), 'word');
if (!$keywords) json_response(['ok' => true, 'matched' => 0]);

$normKeywords = array_map('normalize_for_search', $keywords);
$matched = []; // nome do item => quantidade
foreach ($items as $item) {
  $norm = normalize_for_search($item);
  foreach ($normKeywords as $kw) {
    if ($kw !== '' && strpos($norm, $kw) !== false) {
      $matched[$item] = ($matched[$item] ?? 0) + 1;
      break;
    }
  }
}
if (!$matched) json_response(['ok' => true, 'matched' => 0]);

$parts = [];
foreach ($matched as $name => $count) $parts[] = $count > 1 ? "$name ×$count" : $name;
$text = '💎 Drop rastreado: ' . implode(', ', $parts);

// Preferências de entrega do dono.
$setStmt = $db->prepare('SELECT telegram_chat_id, telegram_drop_relay_enabled, push_enabled FROM alert_settings WHERE user_id = :uid');
$setStmt->execute(['uid' => $uid]);
$settings = $setStmt->fetch() ?: [];

if (!empty($settings['telegram_drop_relay_enabled']) && !empty($settings['telegram_chat_id']) && defined('TELEGRAM_BOT_TOKEN') && TELEGRAM_BOT_TOKEN) {
  $ch = curl_init('https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['chat_id' => $settings['telegram_chat_id'], 'text' => $text]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
  ]);
  curl_exec($ch);
  curl_close($ch);
}

if (!empty($settings['push_enabled']) && defined('ONESIGNAL_APP_ID') && ONESIGNAL_APP_ID && defined('ONESIGNAL_REST_API_KEY') && ONESIGNAL_REST_API_KEY) {
  $ch = curl_init('https://onesignal.com/api/v1/notifications');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode([
      'app_id' => ONESIGNAL_APP_ID,
      'include_aliases' => ['external_id' => ['droplist_' . $uid]],
      'target_channel' => 'push',
      'headings' => ['en' => 'Drop rastreado'],
      'contents' => ['en' => implode(', ', $parts)],
    ]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Basic ' . ONESIGNAL_REST_API_KEY],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
  ]);
  curl_exec($ch);
  curl_close($ch);
}

json_response(['ok' => true, 'matched' => count($matched)]);
