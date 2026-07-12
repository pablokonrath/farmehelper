<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT id, name, alz_cost, tickets_per_run, gems_per_run FROM dungeons')->fetchAll();
  $result = array_map(fn($r) => [
    'id' => $r['id'],
    'name' => $r['name'],
    'alzCost' => (int) $r['alz_cost'],
    'ticketsPerRun' => (int) $r['tickets_per_run'],
    'gemsPerRun' => (int) $r['gems_per_run'],
  ], $rows);
  json_response($result);
}

if ($method === 'PUT') {
  // Catálogo global (sem user_id) usado por todo mundo no carrinho de rush — só admin edita,
  // senão qualquer conta padrão poderia mudar custo/tickets/gemas pra todo mundo.
  require_master_admin();
  $body = read_json_body();
  $db->beginTransaction();
  $db->exec('DELETE FROM dungeons');
  $stmt = $db->prepare('INSERT INTO dungeons (id, name, alz_cost, tickets_per_run, gems_per_run)
    VALUES (:id, :name, :alzCost, :ticketsPerRun, :gemsPerRun)');
  foreach ($body as $dg) {
    $stmt->execute([
      'id' => $dg['id'] ?? '',
      'name' => $dg['name'] ?? '',
      'alzCost' => (int) ($dg['alzCost'] ?? 0),
      'ticketsPerRun' => (int) ($dg['ticketsPerRun'] ?? 0),
      'gemsPerRun' => (int) ($dg['gemsPerRun'] ?? 0),
    ]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
