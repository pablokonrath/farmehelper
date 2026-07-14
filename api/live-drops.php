<?php
// Espelho ao vivo do farme (página "Ao vivo" no cliente).
//
// POST (produtor): o PC que está lendo o log empurra os drops NOVOS que têm valor cadastrado.
//   Corpo: { drops: [ { name, quantity, alz, droppedAt, dungeonName }, ...] }. dungeonName é a DG
//   marcada em Sessões de farme no momento do drop (null se não tinha nenhuma). Depois de inserir,
//   poda o buffer desse usuário pra ~6h — não é histórico, é só o feed recente.
// GET (consumidor): qualquer aparelho da mesma conta (ex: o celular) puxa o que entrou depois
//   do cursor, em ordem crescente (os mais antigos-depois-do-cursor primeiro, LIVE_DROPS_GET_LIMIT
//   por vez) — garante que o cliente sempre alcança tudo, mesmo se ficar bastante tempo sem
//   visitar a página com muita coisa caindo. ?since=<id> → devolve { drops: [...], cursor }, onde
//   cursor é o maior id devolvido. since ausente/0 começa do início do buffer (~6h); se houver mais
//   de LIVE_DROPS_GET_LIMIT linhas acumuladas, o cliente alcança o presente em alguns polls de 10s.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$uid = current_user_id();
$method = $_SERVER['REQUEST_METHOD'];

// Quanto tempo o feed ao vivo guarda (buffer, não arquivo). Podado a cada envio.
const LIVE_DROPS_RETENTION_HOURS = 6;
// Teto de linhas por requisição, nos dois sentidos — evita payload/insert gigante por acidente.
const LIVE_DROPS_MAX_PER_REQUEST = 100;
// Igual ao MAX_LIVE_BUFFER do cliente (live-drops.js) — assim uma sessão de farme inteira cabe
// numa única busca, sem precisar de vários polls de 10s pra alcançar (ver ORDER BY ASC abaixo).
const LIVE_DROPS_GET_LIMIT = 200;

if ($method === 'POST') {
  $body = read_json_body();
  $drops = isset($body['drops']) && is_array($body['drops']) ? $body['drops'] : [];

  $inserted = 0;
  if ($drops) {
    $stmt = $db->prepare(
      'INSERT INTO live_drops (user_id, item_name, quantity, alz, dropped_at, dungeon_name) VALUES (:uid, :name, :qty, :alz, :ts, :dg)'
    );
    $db->beginTransaction();
    foreach (array_slice($drops, 0, LIVE_DROPS_MAX_PER_REQUEST) as $d) {
      $name = trim((string) ($d['name'] ?? ''));
      if ($name === '') continue;
      $dungeonName = trim((string) ($d['dungeonName'] ?? ''));
      $stmt->execute([
        'uid' => $uid,
        'name' => mb_substr($name, 0, 255),
        'qty' => max(1, (int) ($d['quantity'] ?? 1)),
        'alz' => max(0, (int) ($d['alz'] ?? 0)),
        'ts' => (int) ($d['droppedAt'] ?? 0),
        'dg' => $dungeonName !== '' ? mb_substr($dungeonName, 0, 255) : null,
      ]);
      $inserted++;
    }
    $db->commit();

    // Poda o buffer: só o feed recente importa (o histórico de verdade vive no log do PC).
    $db->prepare(
      'DELETE FROM live_drops WHERE user_id = :uid AND created_at < (NOW() - INTERVAL ' . LIVE_DROPS_RETENTION_HOURS . ' HOUR)'
    )->execute(['uid' => $uid]);
  }

  json_response(['ok' => true, 'inserted' => $inserted]);
}

if ($method === 'GET') {
  $since = (int) ($_GET['since'] ?? 0);

  // ASC (não DESC): pega os mais ANTIGOS depois do cursor primeiro. Com DESC, se mais de
  // LIVE_DROPS_GET_LIMIT linhas priceadas caírem entre duas visitas à página, o meio do caminho
  // sumia pra sempre (o cursor pulava direto pro topo, sem nunca buscar o que ficou pra trás).
  // Com ASC, o cliente sempre alcança tudo — só demora mais um poll a cada LIMIT linhas de atraso.
  $stmt = $db->prepare(
    'SELECT id, item_name, quantity, alz, dropped_at, dungeon_name FROM live_drops
     WHERE user_id = :uid AND id > :since ORDER BY id ASC LIMIT ' . LIVE_DROPS_GET_LIMIT
  );
  $stmt->execute(['uid' => $uid, 'since' => $since]);
  $rows = $stmt->fetchAll();
  $cursor = $since;
  $drops = [];
  foreach ($rows as $r) {
    $id = (int) $r['id'];
    if ($id > $cursor) $cursor = $id;
    $drops[] = [
      'id' => $id,
      'name' => $r['item_name'],
      'quantity' => (int) $r['quantity'],
      'alz' => (int) $r['alz'],
      'droppedAt' => (int) $r['dropped_at'],
      'dungeonName' => $r['dungeon_name'],
    ];
  }

  // Qual DG está sendo farmada agora, se houver — já mantida em app_settings pelo próprio PC
  // (ver dg-session.js/saveActiveDgSession), só reaproveita aqui no mesmo poll de 10s pra não
  // precisar de uma requisição extra do celular.
  $activeDg = null;
  $sessStmt = $db->prepare("SELECT setting_value FROM app_settings WHERE user_id = :uid AND setting_key = 'activeDgSession'");
  $sessStmt->execute(['uid' => $uid]);
  $sessRow = $sessStmt->fetch();
  if ($sessRow) {
    $session = json_decode($sessRow['setting_value'], true);
    if (is_array($session) && !empty($session['dungeonName'])) {
      $activeDg = ['dungeonName' => $session['dungeonName'], 'startAt' => (int) ($session['startAt'] ?? 0)];
    }
  }

  json_response(['drops' => $drops, 'cursor' => $cursor, 'activeDg' => $activeDg]);
}

json_response(['error' => 'method_not_allowed'], 405);
