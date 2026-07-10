<?php
// Qualquer usuário logado pode ver o ranking (não é admin-only) — é a visão da guild como
// um todo, só o detalhe de farme/rush de cada um que continua privado.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['error' => 'method_not_allowed'], 405);

$db = get_db();
$periodDays = ['week' => 7, 'biweek' => 15, 'month' => 30][$_GET['period'] ?? ''] ?? null;

if ($periodDays === null) {
  // Geral — comportamento de sempre, lendo o total acumulado (drop_counts).
  $rows = $db->query('
    SELECT dc.item_name, u.username, u.guild, dc.quantity
    FROM drop_counts dc
    JOIN users u ON u.id = dc.user_id
    WHERE dc.quantity > 0
    ORDER BY dc.item_name, dc.quantity DESC
  ')->fetchAll();
} else {
  // Semanal/quinzenal/mensal — soma a granularidade diária dos últimos N dias.
  $stmt = $db->prepare('
    SELECT dc.item_name, u.username, u.guild, SUM(dc.quantity) AS quantity
    FROM drop_counts_daily dc
    JOIN users u ON u.id = dc.user_id
    WHERE dc.drop_date >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
    GROUP BY dc.item_name, dc.user_id
    HAVING quantity > 0
    ORDER BY dc.item_name, quantity DESC
  ');
  $stmt->execute(['days' => $periodDays]);
  $rows = $stmt->fetchAll();
}

$result = [];
foreach ($rows as $row) {
  $result[$row['item_name']] ??= [];
  $result[$row['item_name']][] = ['username' => $row['username'], 'guild' => $row['guild'], 'quantity' => (int) $row['quantity']];
}
// (object) garante {} no JSON quando vazio — ver comentário em item-category-assignments.php.
json_response((object) $result);
