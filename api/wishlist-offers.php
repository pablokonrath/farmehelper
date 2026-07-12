<?php
// Propostas de compra. GET = propostas que EU recebi (sou o vendedor, quem dropou). POST = envio
// uma proposta pra quem dropou o item da minha lista de desejos. PUT = marca as recebidas como
// vistas. DELETE = limpa as recebidas.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT id, buyer_username, buyer_guild, item_name, offer_price, ts, seen FROM wishlist_offers WHERE seller_user_id = :uid ORDER BY ts DESC LIMIT 200');
  $stmt->execute(['uid' => $uid]);
  json_response(array_map(fn($r) => [
    'id' => (int) $r['id'],
    'buyerUsername' => $r['buyer_username'],
    'buyerGuild' => $r['buyer_guild'],
    'itemName' => $r['item_name'],
    'offerPrice' => (int) $r['offer_price'],
    'ts' => str_replace(' ', 'T', $r['ts']) . 'Z',
    'seen' => (bool) $r['seen'],
  ], $stmt->fetchAll()));
}

if ($method === 'POST') {
  $body = read_json_body();
  $dropperUsername = trim($body['dropperUsername'] ?? '');
  $itemName = trim($body['itemName'] ?? '');
  $offerPrice = (int) ($body['offerPrice'] ?? 0);
  if ($dropperUsername === '' || $itemName === '' || $offerPrice <= 0) {
    json_response(['error' => 'invalid'], 400);
  }

  // Acha o vendedor (quem dropou) pelo nick.
  $stmt = $db->prepare('SELECT id FROM users WHERE username = :u');
  $stmt->execute(['u' => $dropperUsername]);
  $seller = $stmt->fetch();
  if (!$seller) json_response(['error' => 'seller_not_found'], 404);
  $sellerId = (int) $seller['id'];

  $buyerUsername = current_username();
  $buyerGuild = $_SESSION['guild'] ?? null;

  $db->prepare('INSERT INTO wishlist_offers (seller_user_id, buyer_user_id, buyer_username, buyer_guild, item_name, offer_price)
    VALUES (:seller, :buyer, :buyerName, :buyerGuild, :item, :price)')
    ->execute([
      'seller' => $sellerId, 'buyer' => $uid, 'buyerName' => $buyerUsername,
      'buyerGuild' => $buyerGuild, 'item' => $itemName, 'price' => $offerPrice,
    ]);

  // Avisa o vendedor no Telegram, se ele tiver vinculado (proposta é raro e importante).
  $ts = $db->prepare('SELECT telegram_chat_id FROM alert_settings WHERE user_id = :uid');
  $ts->execute(['uid' => $sellerId]);
  $chatId = $ts->fetch()['telegram_chat_id'] ?? null;
  if ($chatId && defined('TELEGRAM_BOT_TOKEN') && TELEGRAM_BOT_TOKEN) {
    $text = '🤝 Proposta de compra: ' . $buyerUsername . ($buyerGuild ? ' (' . $buyerGuild . ')' : '')
      . ' quer o seu "' . $itemName . '" por ' . number_format($offerPrice, 0, ',', '.') . ' Alz. Chame no jogo pra fechar.';
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

  json_response(['ok' => true]);
}

if ($method === 'PUT') {
  $body = read_json_body();
  if (!empty($body['seen'])) {
    $db->prepare('UPDATE wishlist_offers SET seen = 1 WHERE seller_user_id = :uid')->execute(['uid' => $uid]);
  }
  json_response(['ok' => true]);
}

if ($method === 'DELETE') {
  $db->prepare('DELETE FROM wishlist_offers WHERE seller_user_id = :uid')->execute(['uid' => $uid]);
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
