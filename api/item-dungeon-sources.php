<?php
// Mapa global item → lista de DGs onde ele pode cair (cadastro manual, curado — diferente de
// Onde Dropa, que é estatístico por sessão de cada jogador). Qualquer usuário logado pode LER
// (usado em Sessões de farme pra destacar os itens esperados da DG), só admin mestre ESCREVE.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT item_name, dungeon_id FROM item_dungeon_sources')->fetchAll();
  $result = [];
  foreach ($rows as $row) $result[$row['item_name']][] = $row['dungeon_id'];
  // (object) garante {} no JSON quando vazio — ver mesmo comentário em item-category-assignments.php.
  json_response((object) $result);
}

if ($method === 'PUT') {
  require_master_admin();
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM item_dungeon_sources');
  $stmt = $db->prepare('INSERT INTO item_dungeon_sources (item_name, dungeon_id) VALUES (:item, :dungeon)');
  foreach ($body as $itemName => $dungeonIds) {
    if (!is_array($dungeonIds)) continue;
    foreach ($dungeonIds as $dungeonId) {
      if (is_string($dungeonId) && $dungeonId !== '') {
        $stmt->execute(['item' => $itemName, 'dungeon' => $dungeonId]);
      }
    }
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
