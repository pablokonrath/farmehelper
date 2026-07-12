<?php
// Lista global de guilds — qualquer usuário logado pode LER (precisa pro seletor ao criar
// conta), mas só admin pode ESCREVER.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT name FROM guilds ORDER BY name')->fetchAll();
  json_response(array_map(fn($r) => $r['name'], $rows));
}

if ($method === 'PUT') {
  require_master_admin();
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM guilds');
  $stmt = $db->prepare('INSERT INTO guilds (name) VALUES (:name)');
  foreach ($body as $name) {
    if (is_string($name) && trim($name) !== '') $stmt->execute(['name' => trim($name)]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
