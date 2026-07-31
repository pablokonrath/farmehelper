<?php
// Sessões de farme por DG — uma linha por sessão (antes era um blob JSON em app_settings que
// truncava em 64 KB e sumia). GET devolve as sessões do usuário; PUT substitui todas (replace-all,
// igual aos outros endpoints de lista — o cliente manda o array inteiro do AppState).
//
// route_id/route_name (rótulo de rota, ver sql/migrate_dg_session_routes.sql) são colunas mais
// novas que o resto da tabela — os dois métodos tentam a query completa primeiro e caem pra uma
// versão sem essas colunas se elas ainda não existirem, em vez de esvaziar o histórico (GET) ou
// quebrar o encerramento de sessão (PUT) enquanto a migração não roda.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$uid = current_user_id();

if ($method === 'GET') {
  $hasRouteColumns = true;
  try {
    $stmt = $db->prepare('SELECT dungeon_id, dungeon_name, session_date, start_at, end_at, duration_ms,
      active_duration_ms, runs, drop_count, unique_items, total_alz, alz_per_hour, best_item_name,
      best_item_price, items, route_id, route_name FROM dg_sessions WHERE user_id = :uid ORDER BY start_at');
    $stmt->execute(['uid' => $uid]);
  } catch (PDOException $e) {
    $hasRouteColumns = false;
    try {
      $stmt = $db->prepare('SELECT dungeon_id, dungeon_name, session_date, start_at, end_at, duration_ms,
        active_duration_ms, runs, drop_count, unique_items, total_alz, alz_per_hour, best_item_name,
        best_item_price, items FROM dg_sessions WHERE user_id = :uid ORDER BY start_at');
      $stmt->execute(['uid' => $uid]);
    } catch (PDOException $e2) {
      // Tabela ainda não criada (migração pendente) — devolve vazio pra não quebrar o
      // carregamento; o cliente cai no blob antigo (app_settings.dgSessions) até a migração rodar.
      json_response([]);
    }
  }
  json_response(array_map(fn($r) => [
    'dungeonId' => $r['dungeon_id'],
    'dungeonName' => $r['dungeon_name'],
    'date' => $r['session_date'],
    'startAt' => (int) $r['start_at'],
    'endAt' => $r['end_at'] !== null ? (int) $r['end_at'] : null,
    'durationMs' => $r['duration_ms'] !== null ? (int) $r['duration_ms'] : null,
    'activeDurationMs' => $r['active_duration_ms'] !== null ? (int) $r['active_duration_ms'] : null,
    'runs' => (int) $r['runs'],
    'dropCount' => (int) $r['drop_count'],
    'uniqueItems' => (int) $r['unique_items'],
    'totalAlz' => (int) $r['total_alz'],
    'alzPerHour' => $r['alz_per_hour'] !== null ? (float) $r['alz_per_hour'] : null,
    'bestItem' => $r['best_item_name'] !== null ? ['name' => $r['best_item_name'], 'price' => (int) $r['best_item_price']] : null,
    'items' => $r['items'] ? json_decode($r['items'], true) : [],
    'routeId' => $hasRouteColumns ? $r['route_id'] : null,
    'routeName' => $hasRouteColumns ? $r['route_name'] : null,
  ], $stmt->fetchAll()));
}

if ($method === 'PUT') {
  $body = read_json_body(); // array de sessões (AppState.dgSessions inteiro)
  if (!is_array($body)) json_response(['error' => 'invalid'], 400);

  $withRouteColumns = 'INSERT INTO dg_sessions
    (user_id, dungeon_id, dungeon_name, session_date, start_at, end_at, duration_ms, active_duration_ms,
     runs, drop_count, unique_items, total_alz, alz_per_hour, best_item_name, best_item_price, items,
     route_id, route_name)
    VALUES (:uid, :did, :dname, :sdate, :start, :end, :dur, :active, :runs, :drops, :uniq, :alz, :aph,
     :biname, :biprice, :items, :routeId, :routeName)';
  $withoutRouteColumns = 'INSERT INTO dg_sessions
    (user_id, dungeon_id, dungeon_name, session_date, start_at, end_at, duration_ms, active_duration_ms,
     runs, drop_count, unique_items, total_alz, alz_per_hour, best_item_name, best_item_price, items)
    VALUES (:uid, :did, :dname, :sdate, :start, :end, :dur, :active, :runs, :drops, :uniq, :alz, :aph,
     :biname, :biprice, :items)';

  $insertAll = function (string $sql, bool $withRoute) use ($db, $body, $uid) {
    $db->beginTransaction();
    $db->prepare('DELETE FROM dg_sessions WHERE user_id = :uid')->execute(['uid' => $uid]);
    $stmt = $db->prepare($sql);
    foreach ($body as $s) {
      if (!is_array($s) || !isset($s['startAt'])) continue;
      $best = $s['bestItem'] ?? null;
      $aph = $s['alzPerHour'] ?? null;
      $params = [
        'uid' => $uid,
        'did' => $s['dungeonId'] ?? null,
        'dname' => $s['dungeonName'] ?? null,
        'sdate' => $s['date'] ?? null,
        'start' => (int) $s['startAt'],
        'end' => isset($s['endAt']) ? (int) $s['endAt'] : null,
        'dur' => isset($s['durationMs']) ? (int) $s['durationMs'] : null,
        'active' => isset($s['activeDurationMs']) && $s['activeDurationMs'] !== null ? (int) $s['activeDurationMs'] : null,
        'runs' => (int) ($s['runs'] ?? 0),
        'drops' => (int) ($s['dropCount'] ?? 0),
        'uniq' => (int) ($s['uniqueItems'] ?? 0),
        'alz' => (int) ($s['totalAlz'] ?? 0),
        'aph' => $aph !== null ? (float) $aph : null,
        'biname' => is_array($best) ? ($best['name'] ?? null) : null,
        'biprice' => is_array($best) && isset($best['price']) ? (int) $best['price'] : null,
        'items' => isset($s['items']) ? json_encode($s['items']) : '{}',
      ];
      if ($withRoute) {
        $params['routeId'] = $s['routeId'] ?? null;
        $params['routeName'] = $s['routeName'] ?? null;
      }
      $stmt->execute($params);
    }
    $db->commit();
  };

  try {
    $insertAll($withRouteColumns, true);
  } catch (PDOException $e) {
    if ($db->inTransaction()) $db->rollBack();
    try {
      $insertAll($withoutRouteColumns, false);
    } catch (PDOException $e2) {
      if ($db->inTransaction()) $db->rollBack();
      json_response(['error' => 'db_error'], 500);
    }
  }
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
