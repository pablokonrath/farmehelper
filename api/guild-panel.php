<?php
// Visão agregada da guild pro líder: quem está online agora e quanto cada membro dropou (dos
// itens do ranking) no período. Só conta/quantidade — o valor em Alz continua privado de cada um.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['error' => 'method_not_allowed'], 405);

$db = get_db();

// Guild alvo: a do próprio usuário por padrão; só o master admin pode espiar outra via ?guild=.
$guild = $_SESSION['guild'] ?? '';
if (current_user_is_master_admin() && isset($_GET['guild'])) {
  $guild = $_GET['guild'];
}

// Período: hoje (0 dias atrás), semana (últimos 7), mês (últimos 30).
$back = ['today' => 0, 'week' => 6, 'month' => 29][$_GET['period'] ?? 'today'] ?? 0;

$stmt = $db->prepare('
  SELECT u.username, u.last_seen_at,
         (u.last_seen_at > DATE_SUB(NOW(), INTERVAL 3 MINUTE)) AS online,
         COALESCE(SUM(dcd.quantity), 0) AS total_drops
  FROM users u
  LEFT JOIN drop_counts_daily dcd
    ON dcd.user_id = u.id AND dcd.drop_date >= DATE_SUB(CURDATE(), INTERVAL :back DAY)
  WHERE u.guild = :guild
  GROUP BY u.id
  ORDER BY online DESC, total_drops DESC, u.username
');
$stmt->execute(['guild' => $guild, 'back' => $back]);

$members = array_map(fn($r) => [
  'username' => $r['username'],
  'online' => (bool) $r['online'],
  'lastSeenAt' => $r['last_seen_at'] ? str_replace(' ', 'T', $r['last_seen_at']) . 'Z' : null,
  'totalDrops' => (int) $r['total_drops'],
], $stmt->fetchAll());

$onlineCount = 0;
$activeCount = 0;
$totalDrops = 0;
foreach ($members as $m) {
  if ($m['online']) $onlineCount++;
  if ($m['totalDrops'] > 0) $activeCount++;
  $totalDrops += $m['totalDrops'];
}

json_response([
  'guild' => $guild,
  'period' => $_GET['period'] ?? 'today',
  'onlineCount' => $onlineCount,
  'activeCount' => $activeCount,
  'memberCount' => count($members),
  'totalDrops' => $totalDrops,
  'members' => $members,
]);
