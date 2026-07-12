<?php
// Lista global de categorias de item — qualquer usuário logado pode LER (o Relatório
// precisa saber os nomes), mas só admin pode ESCREVER.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT name FROM item_categories ORDER BY id')->fetchAll();
  json_response(array_map(fn($r) => $r['name'], $rows));
}

if ($method === 'PUT') {
  require_master_admin();
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM item_categories');
  $stmt = $db->prepare('INSERT INTO item_categories (name) VALUES (:name)');
  foreach ($body as $name) {
    if (is_string($name) && trim($name) !== '') $stmt->execute(['name' => trim($name)]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
