<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

// Só existe PUT — ninguém precisa ler de volta as próprias contagens (o client já tem a
// fonte de verdade, o log local); o consumo cross-usuário acontece via leaderboard.php.
//
// NÃO detectamos "pico de drops" aqui: comparar o delta da contagem entre dois syncs media o
// intervalo do sync, não o log de verdade — dava falso positivo em rush ou depois de um tempo
// sem sincronizar. A detecção de integridade fiel fica no lado do cliente, que lê o log e olha
// os HORÁRIOS reais dos drops (ver file-source.js); edição do trecho já lido continua pega pelo
// worker (file_tamper).
if ($method === 'PUT') {
  $body = read_json_body();

  $db->beginTransaction();
  $db->prepare('DELETE FROM drop_counts WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO drop_counts (user_id, item_name, quantity) VALUES (:uid, :name, :qty)');
  foreach ($body as $name => $qty) {
    $qty = (int) $qty;
    if ($qty > 0) $stmt->execute(['uid' => $uid, 'name' => $name, 'qty' => $qty]);
  }
  $db->commit();

  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
