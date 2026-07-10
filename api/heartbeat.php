<?php
// Ping periódico do cliente (ver js/features/presence.js) — marca a própria conta como ativa
// e devolve, na mesma resposta, quem mais está "online" agora. Evita requisições extras já
// que o cliente sempre vai querer a lista atualizada logo depois de bater o ping.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$db = get_db();
$db->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = :uid')->execute(['uid' => current_user_id()]);

// 3 min de folga em cima do intervalo de 1 min do cliente — tolera o navegador atrasando o
// setInterval de uma aba em segundo plano sem contar alguém como offline cedo demais.
$rows = $db->query('SELECT username, guild FROM users WHERE last_seen_at > DATE_SUB(NOW(), INTERVAL 3 MINUTE) ORDER BY username')->fetchAll();
$onlineUsers = array_map(fn($r) => ['username' => $r['username'], 'guild' => $r['guild']], $rows);
json_response(['ok' => true, 'onlineCount' => count($onlineUsers), 'onlineUsers' => $onlineUsers]);
