<?php
// Chamado PELO Telegram a cada mensagem enviada ao bot — sem sessão nenhuma (por isso não usa
// auth.php), autenticado só pelo header secreto configurado no momento de registrar o webhook
// (ver DEPLOY.md). Comandos: /start CODIGO (vincula a conta), /drop (lista o que caiu hoje),
// /drop <busca> (consulta total acumulado de um item), qualquer outra coisa cai na ajuda.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';

$secretHeader = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
if (!TELEGRAM_WEBHOOK_SECRET || !hash_equals(TELEGRAM_WEBHOOK_SECRET, $secretHeader)) {
  http_response_code(403);
  exit;
}

function send_telegram_message($chatId, string $text): void {
  $ch = curl_init('https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['chat_id' => $chatId, 'text' => $text]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
  ]);
  curl_exec($ch);
  curl_close($ch);
}

$update = read_json_body();
$message = $update['message'] ?? null;
$chatId = $message['chat']['id'] ?? null;
$text = trim($message['text'] ?? '');
// Update sem mensagem de texto (ex: edited_message, sticker) — nada pra responder.
if (!$chatId || $text === '') json_response(['ok' => true]);

$db = get_db();

if (preg_match('/^\/start\s+(\S+)/i', $text, $m)) {
  $code = strtoupper($m[1]);
  $stmt = $db->prepare('SELECT user_id FROM telegram_link_codes WHERE code = :code AND used_at IS NULL AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)');
  $stmt->execute(['code' => $code]);
  $row = $stmt->fetch();
  if (!$row) {
    send_telegram_message($chatId, 'Código inválido ou expirado. Gere um novo em Alertas, no DropList.');
    json_response(['ok' => true]);
  }
  $userId = (int) $row['user_id'];
  $db->prepare('UPDATE telegram_link_codes SET used_at = NOW() WHERE code = :code')->execute(['code' => $code]);
  // Upsert: pode ser a primeira vez que esse usuário mexe em alert_settings.
  $db->prepare('INSERT INTO alert_settings (user_id, telegram_chat_id) VALUES (:uid, :chatId)
    ON DUPLICATE KEY UPDATE telegram_chat_id = VALUES(telegram_chat_id)')
    ->execute(['uid' => $userId, 'chatId' => $chatId]);
  send_telegram_message($chatId, '✅ Telegram vinculado! Você recebe avisos de TG/World Boss por aqui (se estiverem ativados em Alertas no DropList). Manda /drop <nome do item> pra consultar quanto você já dropou.');
  json_response(['ok' => true]);
}

if (preg_match('/^\/drop(?:\s+(.+))?$/i', $text, $m)) {
  $query = trim($m[1] ?? '');
  $stmt = $db->prepare('SELECT user_id FROM alert_settings WHERE telegram_chat_id = :chatId');
  $stmt->execute(['chatId' => $chatId]);
  $row = $stmt->fetch();
  if (!$row) {
    send_telegram_message($chatId, 'Sua conta do DropList ainda não está vinculada. Gere um código em Alertas e manda /start CODIGO.');
    json_response(['ok' => true]);
  }
  $uid = (int) $row['user_id'];

  // Lê da tabela dos itens RASTREADOS de cada jogador (tracked_drop_counts_daily), sincronizada
  // pelo cliente a partir da lista pessoal de palavras rastreadas — não da lista de ranking do
  // admin (que era o que o /drop mostrava antes, causando dados que não batiam com o esperado).
  if ($query === '') {
    // /drop sem argumento: lista tudo que caiu HOJE, sem precisar digitar nome nenhum.
    $today = (new DateTime('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d');
    $stmt = $db->prepare('SELECT item_name, quantity FROM tracked_drop_counts_daily WHERE user_id = :uid AND drop_date = :today ORDER BY quantity DESC');
    $stmt->execute(['uid' => $uid, 'today' => $today]);
    $items = $stmt->fetchAll();
    if (!$items) {
      send_telegram_message($chatId, 'Nenhum drop rastreado registrado hoje ainda. (Precisa estar com o DropList aberto pra registrar.)');
    } else {
      $lines = array_map(fn($i) => $i['item_name'] . ': ' . number_format((int) $i['quantity'], 0, ',', '.'), $items);
      send_telegram_message($chatId, "Drops rastreados de hoje:\n" . implode("\n", $lines));
    }
    json_response(['ok' => true]);
  }

  // /drop <nome>: total acumulado (soma de todos os dias) do item rastreado que casar com a busca.
  $stmt = $db->prepare('SELECT item_name, SUM(quantity) AS quantity FROM tracked_drop_counts_daily WHERE user_id = :uid GROUP BY item_name');
  $stmt->execute(['uid' => $uid]);
  $normalizedQuery = normalize_for_search($query);
  $matches = [];
  foreach ($stmt->fetchAll() as $item) {
    if (strpos(normalize_for_search($item['item_name']), $normalizedQuery) !== false) {
      $matches[] = $item;
      if (count($matches) >= 15) break;
    }
  }

  if (!$matches) {
    send_telegram_message($chatId, 'Nenhum item rastreado encontrado com "' . $query . '".');
  } else {
    $lines = array_map(fn($i) => $i['item_name'] . ': ' . number_format((int) $i['quantity'], 0, ',', '.') . ' dropado(s)', $matches);
    send_telegram_message($chatId, implode("\n", $lines));
  }
  json_response(['ok' => true]);
}

send_telegram_message($chatId, "Comandos disponíveis:\n/drop — lista tudo que você dropou hoje\n/drop <nome do item> — consulta o total já dropado desse item\n/start <código> — vincula sua conta do DropList (gere o código em Alertas)");
json_response(['ok' => true]);
