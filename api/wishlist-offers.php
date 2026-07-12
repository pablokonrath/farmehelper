<?php
// Propostas de compra.
//   GET               = propostas que EU recebi (sou o vendedor, quem dropou).
//   GET ?box=sent     = propostas que EU enviei (sou o comprador), com o status da resposta.
//   POST              = envio uma proposta pra quem dropou o item da minha lista de desejos.
//   PUT {respond,status} = o vendedor ACEITA/RECUSA uma proposta recebida (avisa o comprador).
//   PUT {seen}        = marca as recebidas como vistas (vendedor).
//   PUT {buyerSeen}   = marca as respostas das enviadas como vistas (comprador).
//   DELETE            = limpa as recebidas.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

// Manda uma mensagem pelo bot do Telegram (silencioso se o token/chat não estiverem configurados).
function wo_send_telegram($chatId, $text) {
  if (!$chatId || !defined('TELEGRAM_BOT_TOKEN') || !TELEGRAM_BOT_TOKEN) return;
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
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  // Propostas que EU enviei (sou o comprador) — pra acompanhar se foram aceitas/recusadas.
  if (($_GET['box'] ?? '') === 'sent') {
    $stmt = $db->prepare('SELECT o.id, u.username AS seller_username, o.item_name, o.offer_price, o.status, o.responded_at, o.ts, o.buyer_seen
      FROM wishlist_offers o JOIN users u ON u.id = o.seller_user_id
      WHERE o.buyer_user_id = :uid ORDER BY o.ts DESC LIMIT 200');
    $stmt->execute(['uid' => $uid]);
    json_response(array_map(fn($r) => [
      'id' => (int) $r['id'],
      'sellerUsername' => $r['seller_username'],
      'itemName' => $r['item_name'],
      'offerPrice' => (int) $r['offer_price'],
      'status' => $r['status'],
      'respondedAt' => $r['responded_at'] ? str_replace(' ', 'T', $r['responded_at']) . 'Z' : null,
      'ts' => str_replace(' ', 'T', $r['ts']) . 'Z',
      'buyerSeen' => (bool) $r['buyer_seen'],
    ], $stmt->fetchAll()));
  }

  // Propostas que EU recebi (sou o vendedor, quem dropou).
  $stmt = $db->prepare('SELECT id, buyer_username, buyer_guild, item_name, offer_price, status, responded_at, ts, seen FROM wishlist_offers WHERE seller_user_id = :uid ORDER BY ts DESC LIMIT 200');
  $stmt->execute(['uid' => $uid]);
  json_response(array_map(fn($r) => [
    'id' => (int) $r['id'],
    'buyerUsername' => $r['buyer_username'],
    'buyerGuild' => $r['buyer_guild'],
    'itemName' => $r['item_name'],
    'offerPrice' => (int) $r['offer_price'],
    'status' => $r['status'],
    'respondedAt' => $r['responded_at'] ? str_replace(' ', 'T', $r['responded_at']) . 'Z' : null,
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
  if ($chatId) {
    $text = '🤝 Proposta de compra: ' . $buyerUsername . ($buyerGuild ? ' (' . $buyerGuild . ')' : '')
      . ' quer o seu "' . $itemName . '" por ' . number_format($offerPrice, 0, ',', '.') . ' Alz. Aceite ou recuse em Propostas recebidas.';
    wo_send_telegram($chatId, $text);
  }

  json_response(['ok' => true]);
}

if ($method === 'PUT') {
  $body = read_json_body();

  // Vendedor responde uma proposta recebida (aceita/recusa) e o comprador é avisado.
  $respondId = (int) ($body['respond'] ?? 0);
  $status = $body['status'] ?? '';
  if ($respondId > 0 && ($status === 'accepted' || $status === 'rejected')) {
    // Confirma que a proposta é minha (sou o vendedor) antes de mexer.
    $stmt = $db->prepare('SELECT buyer_user_id, item_name, offer_price FROM wishlist_offers WHERE id = :id AND seller_user_id = :uid');
    $stmt->execute(['id' => $respondId, 'uid' => $uid]);
    $offer = $stmt->fetch();
    if (!$offer) json_response(['error' => 'not_found'], 404);

    $db->prepare('UPDATE wishlist_offers SET status = :st, responded_at = CURRENT_TIMESTAMP, buyer_seen = 0 WHERE id = :id')
      ->execute(['st' => $status, 'id' => $respondId]);

    // Avisa o comprador no Telegram, se ele tiver vinculado.
    $bt = $db->prepare('SELECT telegram_chat_id FROM alert_settings WHERE user_id = :uid');
    $bt->execute(['uid' => (int) $offer['buyer_user_id']]);
    $buyerChat = $bt->fetch()['telegram_chat_id'] ?? null;
    if ($buyerChat) {
      $sellerName = current_username();
      $price = number_format((int) $offer['offer_price'], 0, ',', '.');
      if ($status === 'accepted') {
        $text = '✅ Proposta ACEITA! ' . $sellerName . ' topou vender o "' . $offer['item_name'] . '" por ' . $price
          . ' Alz. Combine a troca no jogo (sussurro/troca direta) ou use o Seguro Neo com a assistência do GM pra evitar golpe.';
      } else {
        $text = '❌ Proposta recusada. ' . $sellerName . ' não aceitou sua oferta de ' . $price . ' Alz pelo "' . $offer['item_name'] . '". Dá pra tentar renegociar no jogo.';
      }
      wo_send_telegram($buyerChat, $text);
    }
    json_response(['ok' => true]);
  }

  // Comprador marcou as respostas das propostas que enviou como vistas.
  if (!empty($body['buyerSeen'])) {
    $db->prepare('UPDATE wishlist_offers SET buyer_seen = 1 WHERE buyer_user_id = :uid')->execute(['uid' => $uid]);
    json_response(['ok' => true]);
  }

  // Vendedor marcou as recebidas como vistas.
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
