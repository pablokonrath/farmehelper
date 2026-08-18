<?php
// Resumo diario publicado por conta (ver sql/migrate_linked_accounts.sql).
//
// PUT  {date, farmed, spent, sold, runs, activeMs, sessionCount, topDg}  -> grava o MEU
// GET  ?days=30                                                         -> le o das contas VINCULADAS
//
// O GET nunca devolve o resumo da propria conta: o cliente calcula o dele localmente, com os
// precos dele, e esse calculo e sempre mais fresco que qualquer coisa publicada. Devolver os dois
// pela mesma porta faria a tela ter duas versoes do mesmo dia e ter que escolher uma.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$uid = current_user_id();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'PUT') {
  $body = read_json_body();
  $date = (string) ($body['date'] ?? '');
  // Data vem do cliente, entao valida o formato antes de deixar virar chave primaria -- uma
  // string torta aqui criaria uma linha fantasma que nenhuma tela conseguiria ler depois.
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    json_response(['error' => 'invalid_date'], 400);
  }

  $stmt = $db->prepare(
    'INSERT INTO daily_summaries
       (user_id, summary_date, farmed, spent, sold, runs, active_ms, session_count, top_dg)
     VALUES (:uid, :date, :farmed, :spent, :sold, :runs, :active_ms, :sessions, :top_dg)
     ON DUPLICATE KEY UPDATE
       farmed = VALUES(farmed), spent = VALUES(spent), sold = VALUES(sold),
       runs = VALUES(runs), active_ms = VALUES(active_ms),
       session_count = VALUES(session_count), top_dg = VALUES(top_dg)'
  );
  $stmt->execute([
    'uid' => $uid,
    'date' => $date,
    'farmed' => (int) ($body['farmed'] ?? 0),
    'spent' => (int) ($body['spent'] ?? 0),
    'sold' => (int) ($body['sold'] ?? 0),
    'runs' => (int) ($body['runs'] ?? 0),
    'active_ms' => (int) ($body['activeMs'] ?? 0),
    'sessions' => (int) ($body['sessionCount'] ?? 0),
    'top_dg' => isset($body['topDg']) && $body['topDg'] !== '' ? mb_substr((string) $body['topDg'], 0, 120) : null,
  ]);
  json_response(['ok' => true]);
}

if ($method === 'GET') {
  $days = (int) ($_GET['days'] ?? 30);
  if ($days < 1) $days = 1;
  if ($days > 365) $days = 365;

  // O JOIN com linked_accounts E a autorizacao: so sai resumo de conta que vinculou com esta.
  // Nao existe caminho aqui que leia um user_id vindo da requisicao, entao nao ha o que forjar.
  $stmt = $db->prepare(
    'SELECT s.user_id, u.username, s.summary_date, s.farmed, s.spent, s.sold,
            s.runs, s.active_ms, s.session_count, s.top_dg, s.updated_at
       FROM daily_summaries s
       JOIN linked_accounts l ON l.linked_user_id = s.user_id
       JOIN users u ON u.id = s.user_id
      WHERE l.owner_user_id = :uid
        AND s.summary_date > (CURDATE() - INTERVAL ' . $days . ' DAY)
      ORDER BY s.summary_date DESC'
  );
  $stmt->execute(['uid' => $uid]);

  $porConta = [];
  foreach ($stmt->fetchAll() as $r) {
    $id = (int) $r['user_id'];
    if (!isset($porConta[$id])) {
      $porConta[$id] = ['userId' => $id, 'username' => $r['username'], 'days' => []];
    }
    $porConta[$id]['days'][] = [
      'date' => $r['summary_date'],
      'farmed' => (int) $r['farmed'],
      'spent' => (int) $r['spent'],
      'sold' => (int) $r['sold'],
      'runs' => (int) $r['runs'],
      'activeMs' => (int) $r['active_ms'],
      'sessionCount' => (int) $r['session_count'],
      'topDg' => $r['top_dg'],
      'updatedAt' => $r['updated_at'],
    ];
  }
  json_response(['accounts' => array_values($porConta)]);
}

json_response(['error' => 'method_not_allowed'], 405);
