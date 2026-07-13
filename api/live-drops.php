<?php
// Espelho ao vivo do farme (página "Ao vivo" no cliente).
//
// POST (produtor): o PC que está lendo o log empurra os drops NOVOS que têm valor cadastrado.
//   Corpo: { drops: [ { name, quantity, alz, droppedAt }, ... ] }. Depois de inserir, poda o
//   buffer desse usuário pra ~6h — não é histórico, é só o feed recente.
// GET (consumidor): qualquer aparelho da mesma conta (ex: o celular) puxa o que entrou depois
//   do cursor. ?since=<id> → devolve { drops: [...], cursor }, onde cursor é o maior id visto.
//   since ausente/0 devolve o buffer recente (últimos ~60) pra a tela já abrir com conteúdo.
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
const LIVE_DROPS_GET_LIMIT = 60;

if ($method === 'POST') {
  $body = read_json_body();
  $drops = isset($body['drops']) && is_array($body['drops']) ? $body['drops'] : [];

  $inserted = 0;
  if ($drops) {
    $stmt = $db->prepare(
      'INSERT INTO live_drops (user_id, item_name, quantity, alz, dropped_at) VALUES (:uid, :name, :qty, :alz, :ts)'
    );
    $db->beginTransaction();
    foreach (array_slice($drops, 0, LIVE_DROPS_MAX_PER_REQUEST) as $d) {
      $name = trim((string) ($d['name'] ?? ''));
      if ($name === '') continue;
      $stmt->execute([
        'uid' => $uid,
        'name' => mb_substr($name, 0, 255),
        'qty' => max(1, (int) ($d['quantity'] ?? 1)),
        'alz' => max(0, (int) ($d['alz'] ?? 0)),
        'ts' => (int) ($d['droppedAt'] ?? 0),
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

  $stmt = $db->prepare(
    'SELECT id, item_name, quantity, alz, dropped_at FROM live_drops
     WHERE user_id = :uid AND id > :since ORDER BY id DESC LIMIT ' . LIVE_DROPS_GET_LIMIT
  );
  $stmt->execute(['uid' => $uid, 'since' => $since]);
  $rows = $stmt->fetchAll();

  // Vêm do mais novo pro mais velho (pra o LIMIT pegar os recentes); devolve em ordem crescente.
  $rows = array_reverse($rows);
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
