<?php
// Dispara os avisos de TG/World Boss (push + Telegram) pra quem está com o navegador fechado —
// é a única peça que faz isso, já que o checkEventSchedule (event-schedule.js) só roda com uma
// aba aberta. Pode ser acionado de dois jeitos (ver DEPLOY.md):
//   1. via CLI — Cron Job da Hostinger (`php .../cron-check-events.php`);
//   2. via HTTP com ?token=SEGREDO — pra usar um cron externo (ex: cron-job.org) quando o cron
//      da Hostinger não funciona, ou só pra testar abrindo a URL no navegador.
require_once __DIR__ . '/db.php'; // carrega config.php junto (as constantes)

if (php_sapi_name() !== 'cli') {
  // Não tem sessão de login aqui (quem chama é um cron, não um usuário) — a autorização é o
  // token secreto na URL. Reaproveita o TELEGRAM_WEBHOOK_SECRET se não houver um dedicado, pra
  // não exigir mais uma constante nova no config.php do servidor.
  $expectedToken = (defined('CRON_HTTP_SECRET') && CRON_HTTP_SECRET)
    ? CRON_HTTP_SECRET
    : (defined('TELEGRAM_WEBHOOK_SECRET') ? TELEGRAM_WEBHOOK_SECRET : '');
  if (!$expectedToken || !hash_equals($expectedToken, $_GET['token'] ?? '')) {
    http_response_code(403);
    exit;
  }
  header('Content-Type: text/plain; charset=utf-8');
  // Só depois de validar o token (nunca pra anônimo): mostra erro de runtime direto na tela em
  // vez de um 500 genérico, pra facilitar o diagnóstico via navegador. Pode remover depois.
  ini_set('display_errors', '1');
  error_reporting(E_ALL);
}

// O "Ver resultado" da Hostinger não mostrou nenhum echo mesmo em execuções bem-sucedidas —
// provavelmente só captura stderr/erro fatal, não stdout normal. Grava num arquivo próprio
// (fora do git, ver .gitignore) que dá pra abrir direto pelo Gerenciador de Arquivos, e
// mantém só o essencial (sem chat_id/token) já que tecnicamente é um arquivo estático servido
// como texto puro se alguém adivinhar a URL — ver api/.htaccess bloqueando acesso a *.log.
function cron_log(string $message): void {
  echo $message . "\n";
  file_put_contents(__DIR__ . '/cron-debug.log', '[' . date('Y-m-d H:i:s') . "] $message\n", FILE_APPEND);
}

date_default_timezone_set('America/Sao_Paulo'); // não a timezone do servidor
$now = new DateTime('now');
$currentTime = $now->format('H:i');
$today = $now->format('Y-m-d');

$db = get_db();

$stmt = $db->prepare('SELECT id, event_type FROM event_schedule WHERE TIME_FORMAT(time_of_day, "%H:%i") = :time');
$stmt->execute(['time' => $currentTime]);
$matchingEvents = $stmt->fetchAll();

cron_log("horário calculado (America/Sao_Paulo) = $currentTime, " . count($matchingEvents) . ' evento(s) batendo.');

if (!$matchingEvents) exit(0);

// $chatId sem type hint de propósito: um "int|string" (union type) exige PHP 8.0+ e derrubava
// o script inteiro com parse error em servidor PHP 7.x — o resto do código roda em 7.4.
function send_telegram_message($chatId, string $text): void {
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
    cron_log("FALHA Telegram pro chat $chatId (HTTP $status): " . ($curlError ?: $response));
  } else {
    cron_log("Telegram enviado pro chat $chatId.");
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
  $stmt = $db->prepare("SELECT user_id, telegram_chat_id FROM alert_settings WHERE $prefColumn = 1 AND telegram_chat_id IS NOT NULL");
  $stmt->execute();
  $recipients = $stmt->fetchAll();
  cron_log("evento '$eventType' (id $eventId) -> " . count($recipients) . ' destinatário(s) elegível(is).');

  $label = $eventType === 'tg' ? 'TG' : 'World Boss';
  $title = "$label às $currentTime!";
  $body = 'Hora de entrar.';

  foreach ($recipients as $r) {
    send_telegram_message($r['telegram_chat_id'], "$title $body");
  }
}
