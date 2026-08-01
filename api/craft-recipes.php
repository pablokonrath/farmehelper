<?php
// Receitas de craft (item final + materiais/quantidades) — pessoal por conta, mesmo padrão de
// rush-routes.php. reset_at é o checkpoint usado por computeCraftProgress (client) pra contar só
// os materiais caídos DEPOIS dele, sem apagar nenhuma sessão.
//
// Tabela nova (craft_recipes) — o GET cai num array vazio se ela ainda não existir (migração
// pendente), em vez de derrubar o Promise.all inteiro do carregamento do app (ver
// loadPersistedState em persistence.js, que carrega isso junto com tudo mais).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  try {
    $stmt = $db->prepare('SELECT recipe_id, item_name, materials, reset_at FROM craft_recipes WHERE user_id = :uid');
    $stmt->execute(['uid' => $uid]);
    $result = array_map(fn($row) => [
      'id' => $row['recipe_id'],
      'itemName' => $row['item_name'],
      'materials' => json_decode($row['materials'], true) ?? [],
      'resetAt' => (int) $row['reset_at'],
    ], $stmt->fetchAll());
    json_response($result);
  } catch (PDOException $e) {
    json_response([]);
  }
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM craft_recipes WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO craft_recipes (user_id, recipe_id, item_name, materials, reset_at) VALUES (:uid, :recipeId, :itemName, :materials, :resetAt)');
  foreach ($body as $recipe) {
    if (empty($recipe['id']) || !is_string($recipe['itemName'] ?? null) || trim($recipe['itemName']) === '') continue;
    $stmt->execute([
      'uid' => $uid,
      'recipeId' => $recipe['id'],
      'itemName' => trim($recipe['itemName']),
      'materials' => json_encode($recipe['materials'] ?? []),
      'resetAt' => (int) ($recipe['resetAt'] ?? 0),
    ]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
