<?php
// Chamado pelo cliente sempre que novas linhas de drop chegam do polling (sem filtro nenhum
// de lista de ranking — qualquer item conta). Casa contra a lista de desejos de TODOS os
// outros usuários e cria um "correio" (wishlist_matches) pra cada match, que o dono recebe no
// próprio heartbeat.php.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$db = get_db();
$uid = current_user_id();
$body = read_json_body();
$droppedNames = array_values(array_filter($body['items'] ?? [], 'is_string'));
if (!$droppedNames) json_response(['ok' => true]);

$rows = $db->prepare('SELECT wi.user_id, wi.item_name, u.guild FROM wishlist_items wi JOIN users u ON u.id = wi.user_id WHERE wi.user_id != :uid');
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
    }
  }
}

json_response(['ok' => true]);
