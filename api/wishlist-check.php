<?php
// Chamado pelo cliente sempre que novas linhas de drop chegam do polling (sem filtro nenhum
// de lista de ranking — qualquer item conta). Casa contra a lista de desejos de TODOS os
// outros usuários e cria um "correio" (wishlist_matches) pra cada match, que o dono recebe no
// próprio heartbeat.php.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

// Avisa o dono da lista de desejos no Telegram (se ele optou por isso) — chega até com o
// navegador dele fechado, porque quem dispara isso é o navegador de quem dropou, não o dele.
function send_wishlist_telegram($chatId, $itemName, $dropperUsername, $dropperGuild) {
  if (!defined('TELEGRAM_BOT_TOKEN') || !TELEGRAM_BOT_TOKEN) return;
  $text = '🎁 Alguém dropou um item da sua lista de desejos!'
    . "\n" . $itemName
    . "\nQuem dropou: " . $dropperUsername . ($dropperGuild ? ' (' . $dropperGuild . ')' : '');
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

$db = get_db();
$uid = current_user_id();
$body = read_json_body();
$droppedNames = array_values(array_filter($body['items'] ?? [], 'is_string'));
if (!$droppedNames) json_response(['ok' => true]);

// LEFT JOIN alert_settings pra já trazer, junto de cada desejo, se o dono quer (e pode) receber
// no Telegram — sem uma query extra por match.
$rows = $db->prepare('SELECT wi.user_id, wi.item_name, u.guild, a.telegram_chat_id, a.telegram_wishlist_relay_enabled
  FROM wishlist_items wi
  JOIN users u ON u.id = wi.user_id
  LEFT JOIN alert_settings a ON a.user_id = wi.user_id
  WHERE wi.user_id != :uid');
$rows->execute(['uid' => $uid]);
$wishlist = $rows->fetchAll();
if (!$wishlist) json_response(['ok' => true]);

$dropperUsername = current_username();
$dropperGuild = $_SESSION['guild'] ?? null;

$insert = $db->prepare('INSERT INTO wishlist_matches (wishlist_user_id, dropper_username, dropper_guild, item_name, ts) VALUES (:uid, :dropperUsername, :dropperGuild, :itemName, NOW())');

foreach ($droppedNames as $droppedName) {
  $normalizedDrop = normalize_for_search($droppedName);
  foreach ($wishlist as $want) {
    if (strpos($normalizedDrop, normalize_for_search($want['item_name'])) !== false) {
      $insert->execute([
        'uid' => $want['user_id'],
        'dropperUsername' => $dropperUsername,
        'dropperGuild' => $dropperGuild,
        'itemName' => $droppedName,
      ]);
      if (!empty($want['telegram_wishlist_relay_enabled']) && !empty($want['telegram_chat_id'])) {
        send_wishlist_telegram($want['telegram_chat_id'], $droppedName, $dropperUsername, $dropperGuild);
      }
    }
  }
}

json_response(['ok' => true]);
