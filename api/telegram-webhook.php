<?php
// Chamado PELO Telegram a cada mensagem enviada ao bot — sem sessão nenhuma (por isso não usa
// auth.php), autenticado só pelo header secreto configurado no momento de registrar o webhook
// (ver DEPLOY.md). Comandos: /start CODIGO (vincula a conta), /drop (lista quantidade dropada
// hoje), /drop <busca> (total acumulado de um item), /farm (valor em Alz farmado hoje), /sessao
// (qual DG está sendo farmada agora e o progresso de runs), qualquer outra coisa cai na ajuda.
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
    send_telegram_message($chatId, 'Código inválido ou expirado. Gere um novo em Alertas, no FarmHub.');
    json_response(['ok' => true]);
  }
  $userId = (int) $row['user_id'];
  $db->prepare('UPDATE telegram_link_codes SET used_at = NOW() WHERE code = :code')->execute(['code' => $code]);
  // Upsert: pode ser a primeira vez que esse usuário mexe em alert_settings.
  $db->prepare('INSERT INTO alert_settings (user_id, telegram_chat_id) VALUES (:uid, :chatId)
    ON DUPLICATE KEY UPDATE telegram_chat_id = VALUES(telegram_chat_id)')
    ->execute(['uid' => $userId, 'chatId' => $chatId]);
  send_telegram_message($chatId, '✅ Telegram vinculado! Você recebe avisos de TG/World Boss por aqui (se estiverem ativados em Alertas no FarmHub). Manda /drop <nome do item> pra consultar quanto você já dropou.');
  json_response(['ok' => true]);
}

// Daqui pra baixo todo comando precisa de conta vinculada — resolve $uid uma vez só (em vez de
// repetir a checagem em cada bloco) e usa a mesma referência de "hoje" (fuso do jogo) nos três.
$stmt = $db->prepare('SELECT user_id FROM alert_settings WHERE telegram_chat_id = :chatId');
$stmt->execute(['chatId' => $chatId]);
$row = $stmt->fetch();
if (!$row) {
  send_telegram_message($chatId, 'Sua conta do FarmHub ainda não está vinculada. Gere um código em Alertas e manda /start CODIGO.');
  json_response(['ok' => true]);
}
$uid = (int) $row['user_id'];
$today = (new DateTime('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d');

if (preg_match('/^\/drop(?:\s+(.+))?$/i', $text, $m)) {
  $query = trim($m[1] ?? '');

  // Lê da tabela dos itens RASTREADOS de cada jogador (tracked_drop_counts_daily), sincronizada
  // pelo cliente a partir da lista pessoal de palavras rastreadas — não da lista de ranking do
  // admin (que era o que o /drop mostrava antes, causando dados que não batiam com o esperado).
  if ($query === '') {
    // /drop sem argumento: lista tudo que caiu HOJE, sem precisar digitar nome nenhum.
    $stmt = $db->prepare('SELECT item_name, quantity FROM tracked_drop_counts_daily WHERE user_id = :uid AND drop_date = :today ORDER BY quantity DESC');
    $stmt->execute(['uid' => $uid, 'today' => $today]);
    $items = $stmt->fetchAll();
    if (!$items) {
      send_telegram_message($chatId, 'Nenhum drop rastreado registrado hoje ainda. (Precisa estar com o FarmHub aberto pra registrar.)');
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

// /farm: quanto vale em Alz o que caiu HOJE (só os itens rastreados que têm preço cadastrado) —
// complementa o /drop, que mostra quantidade mas não valor. Mesma fonte (tracked_drop_counts_daily),
// cruzada com item_prices (preço é individual de cada jogador).
if (preg_match('/^\/farm\s*$/i', $text)) {
  $stmt = $db->prepare('SELECT t.item_name, t.quantity, COALESCE(p.price, 0) AS price
    FROM tracked_drop_counts_daily t
    LEFT JOIN item_prices p ON p.user_id = t.user_id AND p.item_name = t.item_name
    WHERE t.user_id = :uid AND t.drop_date = :today');
  $stmt->execute(['uid' => $uid, 'today' => $today]);
  $priced = array_values(array_filter($stmt->fetchAll(), fn($r) => (int) $r['price'] > 0));
  usort($priced, fn($a, $b) => ($b['quantity'] * $b['price']) <=> ($a['quantity'] * $a['price']));

  if (!$priced) {
    send_telegram_message($chatId, 'Nenhum drop com preço cadastrado hoje ainda. Cadastre o preço em Cálculo de farme, no FarmHub.');
  } else {
    // Total soma TODOS os itens com preço (não só os 15 exibidos na lista).
    $total = array_sum(array_map(fn($r) => (int) $r['quantity'] * (int) $r['price'], $priced));
    $lines = array_map(
      fn($r) => $r['item_name'] . ': ' . number_format((int) $r['quantity'] * (int) $r['price'], 0, ',', '.') . ' Alz (' . $r['quantity'] . 'x)',
      array_slice($priced, 0, 15)
    );
    send_telegram_message($chatId, "💰 Farme de hoje:\n" . implode("\n", $lines) . "\n\nTotal: " . number_format($total, 0, ',', '.') . ' Alz');
  }
  json_response(['ok' => true]);
}

// /sessao: qual DG está sendo farmada agora (se houver) e o progresso de runs — mesma leitura de
// app_settings.activeDgSession que api/live-drops.php usa pro banner da página "Ao vivo", e mesma
// conta de runs (sessões encerradas hoje + a ativa) do "Progresso do rush" em Sessões de farme.
if (preg_match('/^\/sessao\s*$/i', $text)) {
  $sessStmt = $db->prepare("SELECT setting_value FROM app_settings WHERE user_id = :uid AND setting_key = 'activeDgSession'");
  $sessStmt->execute(['uid' => $uid]);
  $sessRow = $sessStmt->fetch();
  $session = $sessRow ? json_decode($sessRow['setting_value'], true) : null;

  if (!is_array($session) || empty($session['dungeonName'])) {
    send_telegram_message($chatId, 'Nenhuma sessão de DG ativa agora. Marque uma em Sessões de farme, no FarmHub.');
    json_response(['ok' => true]);
  }

  $dungeonName = $session['dungeonName'];
  $startAt = (int) ($session['startAt'] ?? 0);
  $elapsedMin = $startAt > 0 ? max(0, (int) round((microtime(true) * 1000 - $startAt) / 60000)) : 0;
  $elapsedText = $elapsedMin < 60 ? $elapsedMin . 'min' : (int) floor($elapsedMin / 60) . 'h ' . ($elapsedMin % 60) . 'min';

  $runsStmt = $db->prepare('SELECT COALESCE(SUM(runs), 0) FROM dg_sessions WHERE user_id = :uid AND session_date = :today AND dungeon_name = :name');
  $runsStmt->execute(['uid' => $uid, 'today' => $today, 'name' => $dungeonName]);
  $runsToday = (int) $runsStmt->fetchColumn() + (int) ($session['runs'] ?? 0);

  // Se essa DG está no rush planejado de hoje, mostra a fração (ex: 6/20), igual à página Sessões.
  $planned = null;
  $rushStmt = $db->prepare('SELECT items FROM rush_history WHERE user_id = :uid AND rush_date = :today');
  $rushStmt->execute(['uid' => $uid, 'today' => $today]);
  $rushRow = $rushStmt->fetch();
  if ($rushRow) {
    $rushItems = json_decode($rushRow['items'], true);
    if (is_array($rushItems)) {
      foreach ($rushItems as $it) {
        if (($it['name'] ?? null) === $dungeonName) { $planned = (int) ($it['repetitions'] ?? 0); break; }
      }
    }
  }
  $runsLine = $planned ? "$runsToday / $planned runs" : "$runsToday runs";

  send_telegram_message($chatId, "🎯 Farmando: $dungeonName\n⏱ Há $elapsedText\n🔁 $runsLine");
  json_response(['ok' => true]);
}

send_telegram_message($chatId, "Comandos disponíveis:\n/drop — lista quantidade dropada hoje\n/drop <nome do item> — total já dropado desse item\n/farm — valor em Alz farmado hoje\n/sessao — DG que está sendo farmada agora e o progresso de runs\n/start <código> — vincula sua conta do FarmHub (gere o código em Alertas)");
json_response(['ok' => true]);
