<?php
// Lista global de itens do ranking — qualquer usuário logado pode LER (precisa saber o que
// sincronizar), mas só o admin mestre pode ESCREVER (decide o que entra no ranking da guild).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT word, featured FROM ranking_items ORDER BY id')->fetchAll();
  json_response(array_map(fn($r) => ['word' => $r['word'], 'featured' => (bool) $r['featured']], $rows));
}

if ($method === 'PUT') {
  require_master_admin();
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM ranking_items');
  $stmt = $db->prepare('INSERT INTO ranking_items (word, featured) VALUES (:word, :featured)');
  foreach ($body as $item) {
    $word = trim($item['word'] ?? '');
    if ($word !== '') $stmt->execute(['word' => $word, 'featured' => !empty($item['featured']) ? 1 : 0]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
