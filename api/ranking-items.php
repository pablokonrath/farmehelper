<?php
// Lista global de itens do ranking — qualquer usuário logado pode LER (precisa saber o que
// sincronizar), mas só admin pode ESCREVER (decide o que entra no ranking da guild).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT word FROM ranking_items ORDER BY id')->fetchAll();
  json_response(array_map(fn($r) => $r['word'], $rows));
}

if ($method === 'PUT') {
  require_admin();
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM ranking_items');
  $stmt = $db->prepare('INSERT INTO ranking_items (word) VALUES (:word)');
  foreach ($body as $word) {
    if (is_string($word) && trim($word) !== '') $stmt->execute(['word' => trim($word)]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
