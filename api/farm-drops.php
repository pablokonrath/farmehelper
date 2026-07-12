<?php
// Farme completo por dia/item (todos os itens do log). GET (sessão) devolve o agregado do dono
// pra qualquer aparelho reconstruir a Visão geral; PUT grava o snapshot inteiro (replace-all),
// aceitando sessão (navegador) OU o token do agente do PC (sem sessão). Nunca conta em dobro
// porque é sempre o retrato completo, não incrementos.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  require_login();
  $uid = current_user_id();
  $stmt = $db->prepare('SELECT item_name, drop_date, quantity FROM farm_drops_daily WHERE user_id = :uid');
  $stmt->execute(['uid' => $uid]);
  $result = [];
  foreach ($stmt->fetchAll() as $row) {
    $result[$row['drop_date']] ??= [];
    $result[$row['drop_date']][$row['item_name']] = (int) $row['quantity'];
  }
  json_response((object) $result);
}

if ($method === 'PUT') {
  $body = read_json_body();

  // Autenticação: token do agente (PC, sem sessão) ou sessão do navegador.
  $token = is_string($body['token'] ?? null) ? $body['token'] : '';
  if ($token !== '') {
    $stmt = $db->prepare("SELECT user_id FROM app_settings WHERE setting_key = 'agentToken' AND setting_value = :val LIMIT 1");
    $stmt->execute(['val' => json_encode($token)]);
    $row = $stmt->fetch();
    if (!$row) json_response(['error' => 'invalid_token'], 403);
    $uid = (int) $row['user_id'];
  } else {
    require_login();
    $uid = current_user_id();
  }

  $data = is_array($body['data'] ?? null) ? $body['data'] : [];

  // Teto de 31 dias (o log do jogo já só guarda ~30) — rede de segurança contra payload inflado.
  date_default_timezone_set('America/Sao_Paulo');
  $cutoff = date('Y-m-d', strtotime('-31 days'));

  $db->beginTransaction();
  $db->prepare('DELETE FROM farm_drops_daily WHERE user_id = :uid')->execute(['uid' => $uid]);
  $stmt = $db->prepare('INSERT INTO farm_drops_daily (user_id, item_name, drop_date, quantity) VALUES (:uid, :name, :date, :qty)');
  foreach ($data as $date => $items) {
    if (!is_array($items)) continue;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date < $cutoff) continue;
    foreach ($items as $name => $qty) {
      $qty = (int) $qty;
      if ($qty > 0 && $name !== '') $stmt->execute(['uid' => $uid, 'name' => $name, 'date' => $date, 'qty' => $qty]);
    }
  }
  $db->commit();
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
