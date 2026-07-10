<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

// Sincronização acima desse número de unidades num único PUT vira flag pra revisão do admin
// (ver integrity_flags) — não bloqueia nada, é só heurística: um poll normal de 5s só deveria
// somar poucas unidades por vez. Falso positivo esperado pra quem ficou dias sem sincronizar
// e volta com um acúmulo grande legítimo — por isso é revisão manual, não bloqueio automático.
const SPIKE_THRESHOLD = 30;

// Só existe PUT — ninguém precisa ler de volta as próprias contagens (o client já tem a
// fonte de verdade, o log local); o consumo cross-usuário acontece via leaderboard.php.
if ($method === 'PUT') {
  $body = read_json_body();

  $existingStmt = $db->prepare('SELECT item_name, quantity FROM drop_counts WHERE user_id = :uid');
  $existingStmt->execute(['uid' => $uid]);
  $oldCounts = [];
  foreach ($existingStmt->fetchAll() as $row) $oldCounts[$row['item_name']] = (int) $row['quantity'];

  $db->beginTransaction();
  $db->prepare('DELETE FROM drop_counts WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO drop_counts (user_id, item_name, quantity) VALUES (:uid, :name, :qty)');
  foreach ($body as $name => $qty) {
    $qty = (int) $qty;
    if ($qty > 0) $stmt->execute(['uid' => $uid, 'name' => $name, 'qty' => $qty]);
  }
  $db->commit();

  foreach ($body as $name => $qty) {
    $qty = (int) $qty;
    if (!isset($oldCounts[$name])) continue; // primeira sincronização desse item — carga inicial legítima
    $delta = $qty - $oldCounts[$name];
    if ($delta > SPIKE_THRESHOLD) {
      insert_integrity_flag($db, $uid, current_username(), 'drop_spike', "Item \"$name\" subiu de {$oldCounts[$name]} pra $qty numa sincronização (+$delta).");
    }
  }

  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
