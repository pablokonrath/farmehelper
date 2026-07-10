<?php
// Ping periódico do cliente (ver js/features/presence.js) — marca a própria conta como ativa
// e devolve, na mesma resposta, quem mais está "online" agora. Evita requisições extras já
// que o cliente sempre vai querer a lista atualizada logo depois de bater o ping.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$db = get_db();
$uid = current_user_id();
$db->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = :uid')->execute(['uid' => $uid]);

// 3 min de folga em cima do intervalo de 1 min do cliente — tolera o navegador atrasando o
// setInterval de uma aba em segundo plano sem contar alguém como offline cedo demais.
$rows = $db->query('SELECT username, guild FROM users WHERE last_seen_at > DATE_SUB(NOW(), INTERVAL 3 MINUTE) ORDER BY username')->fetchAll();
$onlineUsers = array_map(fn($r) => ['username' => $r['username'], 'guild' => $r['guild']], $rows);

// Correios da lista de desejos ainda não entregues (toast/som ainda não disparou) — aproveita
// esse ping de 1 min já existente em vez de criar mais um poll. "Entregue" é independente de
// "visto": um match pode ficar dias sem o dono abrir a página, mas só deve tocar uma vez.
$matchesStmt = $db->prepare('SELECT id, dropper_username, dropper_guild, item_name, ts FROM wishlist_matches WHERE wishlist_user_id = :uid AND delivered = 0 ORDER BY ts');
$matchesStmt->execute(['uid' => $uid]);
$newMatches = $matchesStmt->fetchAll();
$newWishlistMatches = array_map(fn($r) => [
  'id' => (int) $r['id'],
  'dropperUsername' => $r['dropper_username'],
  'dropperGuild' => $r['dropper_guild'],
  'itemName' => $r['item_name'],
  'ts' => str_replace(' ', 'T', $r['ts']) . 'Z',
], $newMatches);
if ($newMatches) {
  $ids = array_column($newMatches, 'id');
  $placeholders = implode(',', array_fill(0, count($ids), '?'));
  $db->prepare("UPDATE wishlist_matches SET delivered = 1 WHERE id IN ($placeholders)")->execute($ids);
}

json_response(['ok' => true, 'onlineCount' => count($onlineUsers), 'onlineUsers' => $onlineUsers, 'newWishlistMatches' => $newWishlistMatches]);
