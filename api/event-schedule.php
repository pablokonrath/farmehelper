<?php
// Agenda compartilhada de TG/World Boss — qualquer usuário logado pode LER (o "está na
// hora?" roda no navegador de cada um, todo mundo precisa da lista), só admin ESCREVE.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$EVENT_TYPES = ['tg', 'worldboss'];

if ($method === 'GET') {
  $rows = $db->query('SELECT id, event_type, TIME_FORMAT(time_of_day, "%H:%i") AS time_of_day FROM event_schedule ORDER BY event_type, time_of_day')->fetchAll();
  $result = ['tg' => [], 'worldboss' => []];
  foreach ($rows as $r) {
    if (isset($result[$r['event_type']])) {
      $result[$r['event_type']][] = ['id' => (int) $r['id'], 'time' => $r['time_of_day']];
    }
  }
  json_response($result);
}

if ($method === 'POST') {
  require_admin();
  $body = read_json_body();
  $eventType = $body['eventType'] ?? '';
  $time = $body['time'] ?? '';
  if (!in_array($eventType, $EVENT_TYPES, true)) json_response(['error' => 'invalid_input', 'message' => 'Tipo de evento inválido.'], 400);
  if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $time)) json_response(['error' => 'invalid_input', 'message' => 'Horário inválido, use HH:MM.'], 400);

  $stmt = $db->prepare('INSERT INTO event_schedule (event_type, time_of_day) VALUES (:type, :time)');
  $stmt->execute(['type' => $eventType, 'time' => $time]);
  json_response(['ok' => true, 'id' => (int) $db->lastInsertId()], 201);
}

if ($method === 'DELETE') {
  require_admin();
  $body = read_json_body();
  $id = (int) ($body['id'] ?? 0);
  if (!$id) json_response(['error' => 'invalid_input', 'message' => 'ID inválido.'], 400);
  $db->prepare('DELETE FROM event_schedule WHERE id = :id')->execute(['id' => $id]);
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
