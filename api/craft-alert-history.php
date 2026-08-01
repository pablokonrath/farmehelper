<?php
// Histórico de "receita ficou pronta pra craftar" — mesmo padrão de alert-history.php, cortado
// nos 200 mais recentes pelo cliente antes de mandar. Tabela nova (craft_alert_history) — GET cai
// num array vazio se ela ainda não existir, pelo mesmo motivo de craft-recipes.php.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  try {
    $stmt = $db->prepare('SELECT id, ts, recipe_name, materials FROM craft_alert_history WHERE user_id = :uid ORDER BY ts');
    $stmt->execute(['uid' => $uid]);
    // ts guardado como horário UTC (toISOString() no client) sem marcador de fuso — reanexa o "Z"
    // aqui, senão new Date(...) no client reinterpreta como hora local (mesmo ajuste de alert-history.php).
    $result = array_map(fn($r) => [
      'id' => $r['id'],
      'timestamp' => str_replace(' ', 'T', $r['ts']) . 'Z',
      'recipeName' => $r['recipe_name'],
      'materials' => json_decode($r['materials'], true) ?? [],
    ], $stmt->fetchAll());
    json_response($result);
  } catch (PDOException $e) {
    json_response([]);
  }
}

if ($method === 'PUT') {
  $body = read_json_body();
  $db->beginTransaction();
  $db->prepare('DELETE FROM craft_alert_history WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO craft_alert_history (id, user_id, ts, recipe_name, materials) VALUES (:id, :uid, :ts, :recipeName, :materials)');
  foreach ($body as $entry) {
    if (empty($entry['id'])) continue;
    $stmt->execute([
      'id' => $entry['id'],
      'uid' => $uid,
      'ts' => str_replace('T', ' ', substr($entry['timestamp'] ?? '', 0, 19)),
      'recipeName' => $entry['recipeName'] ?? '',
      'materials' => json_encode($entry['materials'] ?? []),
    ]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
