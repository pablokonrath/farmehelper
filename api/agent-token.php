<?php
// Token pessoal pro agente do PC (droplist-agent.ps1) se autenticar sem sessão de navegador.
// Guardado em app_settings (sem tabela/coluna nova). GET devolve o token, criando um se ainda
// não existir. POST regenera (invalida o antigo).
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$uid = current_user_id();
$method = $_SERVER['REQUEST_METHOD'];

function store_agent_token($db, $uid, $token) {
  $db->prepare("INSERT INTO app_settings (user_id, setting_key, setting_value) VALUES (:uid, 'agentToken', :val)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)")
    ->execute(['uid' => $uid, 'val' => json_encode($token)]);
}

if ($method === 'POST') {
  $token = bin2hex(random_bytes(16));
  store_agent_token($db, $uid, $token);
  json_response(['token' => $token]);
}

$stmt = $db->prepare("SELECT setting_value FROM app_settings WHERE user_id = :uid AND setting_key = 'agentToken'");
$stmt->execute(['uid' => $uid]);
$row = $stmt->fetch();
if ($row) {
  json_response(['token' => json_decode($row['setting_value'], true)]);
}

$token = bin2hex(random_bytes(16));
store_agent_token($db, $uid, $token);
json_response(['token' => $token]);
