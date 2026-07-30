<?php
// Rotas de DGs reutilizáveis (molde de rush, sem data fixa) — pessoal por conta, mesmo padrão
// de rush-history.php. items guarda [{dungeonId, repetitions}], sem preço snapshotado: aplicar
// a rota reconstrói o carrinho com os preços/custos ATUAIS da DG (ver buildCartItem no cliente).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $stmt = $db->prepare('SELECT route_id, name, items FROM rush_routes WHERE user_id = :uid');
  $stmt->execute(['uid' => $uid]);
  $result = array_map(fn($row) => [
    'id' => $row['route_id'],
    'name' => $row['name'],
    'items' => json_decode($row['items'], true) ?? [],
  ], $stmt->fetchAll());
  json_response($result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM rush_routes WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO rush_routes (user_id, route_id, name, items) VALUES (:uid, :routeId, :name, :items)');
  foreach ($body as $route) {
    if (empty($route['id']) || !is_string($route['name'] ?? null) || trim($route['name']) === '') continue;
    $stmt->execute([
      'uid' => $uid,
      'routeId' => $route['id'],
      'name' => trim($route['name']),
      'items' => json_encode($route['items'] ?? []),
    ]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
