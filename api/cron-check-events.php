<?php
// Rodado via Cron Job da Hostinger a cada 1 minuto, como comando CLI (não é uma URL pública —
// ver DEPLOY.md). É a única peça que faz TG/World Boss chegar com o navegador do jogador
// fechado: o resto do app (checkEventSchedule em event-schedule.js) só roda dentro de uma aba
// aberta, então sozinho não dá conta disso.
if (php_sapi_name() !== 'cli') {
  http_response_code(403);
  exit;
}

require_once __DIR__ . '/db.php';

date_default_timezone_set('America/Sao_Paulo'); // não a timezone do servidor
$now = new DateTime('now');
$currentTime = $now->format('H:i');
$today = $now->format('Y-m-d');

$db = get_db();

$stmt = $db->prepare('SELECT id, event_type FROM event_schedule WHERE TIME_FORMAT(time_of_day, "%H:%i") = :time');
$stmt->execute(['time' => $currentTime]);
$matchingEvents = $stmt->fetchAll();
if (!$matchingEvents) exit(0);

// error_log() manda pro log de erros do PHP (visível no "Ver resultado" do Cron Job na
// Hostinger, ou no log de erros do hPanel) — sem isso, uma falha de credencial/permissão na
// API do Telegram/OneSignal passava em silêncio total, sem deixar rastro nenhum pra debugar.
function send_telegram_message(int|string $chatId, string $text): void {
  if (!TELEGRAM_BOT_TOKEN) return;
  $ch = curl_init('https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['chat_id' => $chatId, 'text' => $text]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
  ]);
  $response = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $curlError = curl_error($ch);
  curl_close($ch);
  if ($curlError || $status < 200 || $status >= 300) {
    error_log("cron-check-events: falha ao mandar Telegram pro chat $chatId (HTTP $status): " . ($curlError ?: $response));
  }
}

function send_onesignal_push(array $externalIds, string $title, string $body): void {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || !$externalIds) return;
  $ch = curl_init('https://onesignal.com/api/v1/notifications');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode([
      'app_id' => ONESIGNAL_APP_ID,
      'include_aliases' => ['external_id' => $externalIds],
      'target_channel' => 'push',
      'headings' => ['en' => $title],
      'contents' => ['en' => $body],
    ]),
    CURLOPT_HTTPHEADER => [
      'Content-Type: application/json',
      'Authorization: Basic ' . ONESIGNAL_REST_API_KEY,
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
  ]);
  $response = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $curlError = curl_error($ch);
  curl_close($ch);
  if ($curlError || $status < 200 || $status >= 300) {
    error_log('cron-check-events: falha ao mandar push OneSignal pra ' . implode(',', $externalIds) . " (HTTP $status): " . ($curlError ?: $response));
  }
}

foreach ($matchingEvents as $event) {
  $eventId = (int) $event['id'];
  $eventType = $event['event_type']; // 'tg' | 'worldboss'

  // Dedup atômico: se a linha já existe pra esse (evento, dia), o INSERT falha com violação de
  // chave única — pula esse evento (já foi despachado, seja nesse tick ou num anterior).
  try {
    $db->prepare('INSERT INTO event_schedule_deliveries (event_schedule_id, delivery_date) VALUES (:id, :date)')
      ->execute(['id' => $eventId, 'date' => $today]);
  } catch (PDOException $e) {
    continue;
  }

  $prefColumn = $eventType === 'tg' ? 'tg_notifications_enabled' : 'worldboss_notifications_enabled';
  $stmt = $db->prepare("SELECT user_id, push_enabled, telegram_chat_id FROM alert_settings WHERE $prefColumn = 1 AND (push_enabled = 1 OR telegram_chat_id IS NOT NULL)");
  $stmt->execute();
  $recipients = $stmt->fetchAll();

  $label = $eventType === 'tg' ? 'TG' : 'World Boss';
  $title = "$label às $currentTime!";
  $body = 'Hora de entrar.';

  $pushExternalIds = [];
  foreach ($recipients as $r) {
    // Mesmo prefixo "droplist_" usado no login() do cliente (push.js) — o OneSignal bloqueia
    // external_id genérico demais (ex: "1") pra evitar colisão entre apps diferentes.
    if ($r['push_enabled']) $pushExternalIds[] = 'droplist_' . $r['user_id'];
    if ($r['telegram_chat_id']) send_telegram_message($r['telegram_chat_id'], "$title $body");
  }
  send_onesignal_push($pushExternalIds, $title, $body);
}
