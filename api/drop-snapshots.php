<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

// Histórico permanente de drops, agregado por dia+item. Diferente dos outros endpoints
// privados, este NÃO é "apaga tudo e reinsere": o cliente só enxerga os ~30 dias que o log do
// jogo ainda guarda, então apagar o resto destruiria justamente o histórico antigo que esta
// tabela existe pra preservar. Por isso o PUT é upsert por (dia, item).
if ($method === 'GET') {
  $stmt = $db->prepare('SELECT drop_date, item_name, quantity FROM drop_snapshots WHERE user_id = :uid ORDER BY drop_date');
  $stmt->execute(['uid' => $uid]);
  $result = array_map(fn($r) => [
    'date' => $r['drop_date'],
    'name' => $r['item_name'],
    'qty' => (int) $r['quantity'],
  ], $stmt->fetchAll());
  json_response($result);
}

if ($method === 'PUT') {
  $body = read_json_body();
  if (!is_array($body)) json_response(['error' => 'invalid_body'], 400);

  $db->beginTransaction();
  // A quantidade do dia é SUBSTITUÍDA (não somada): cada sincronização manda o total completo
  // daquele dia lido do log, então somar duplicaria a cada re-leitura do mesmo arquivo.
  $stmt = $db->prepare('INSERT INTO drop_snapshots (user_id, drop_date, item_name, quantity)
    VALUES (:uid, :date, :name, :qty)
    ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)');
  foreach ($body as $row) {
    $date = $row['date'] ?? '';
    $name = $row['name'] ?? '';
    if ($date === '' || $name === '') continue;
    $stmt->execute([
      'uid' => $uid,
      'date' => $date,
      'name' => $name,
      'qty' => max(0, (int) ($row['qty'] ?? 0)),
    ]);
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
