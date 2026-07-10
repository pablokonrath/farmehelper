<?php
// Ping periódico do cliente (ver js/features/presence.js) — marca a própria conta como ativa
// e devolve, na mesma resposta, quantas contas estão "online" agora. Evita 2 requisições por
// ciclo já que o cliente sempre vai querer o número atualizado logo depois de bater o ping.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$db = get_db();
$db->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = :uid')->execute(['uid' => current_user_id()]);

// 3 min de folga em cima do intervalo de 1 min do cliente — tolera o navegador atrasando o
// setInterval de uma aba em segundo plano sem contar alguém como offline cedo demais.
$stmt = $db->query('SELECT COUNT(*) AS c FROM users WHERE last_seen_at > DATE_SUB(NOW(), INTERVAL 3 MINUTE)');
json_response(['ok' => true, 'onlineCount' => (int) $stmt->fetch()['c']]);
