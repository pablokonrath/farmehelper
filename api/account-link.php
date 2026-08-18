<?php
// Vinculo entre duas contas do mesmo jogador (ver sql/migrate_linked_accounts.sql).
//
// GET                          -> contas vinculadas a minha
// POST {action:"generate"}     -> gera um codigo pra OUTRA conta colar
// POST {action:"redeem",code}  -> resgata um codigo e cria o vinculo (nas duas direcoes)
// POST {action:"unlink",userId}-> desfaz o vinculo (nas duas direcoes)
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

$db = get_db();
$uid = current_user_id();
$method = $_SERVER['REQUEST_METHOD'];

// Codigo velho nao vincula nada: quem gerou e nao usou na hora provavelmente desistiu, e um
// codigo eterno circulando por ai e uma chave perdida pro farme da conta.
const LINK_CODE_TTL_MINUTES = 30;

function listar_vinculadas(PDO $db, int $uid): array {
  $stmt = $db->prepare(
    'SELECT u.id, u.username, l.created_at
       FROM linked_accounts l
       JOIN users u ON u.id = l.linked_user_id
      WHERE l.owner_user_id = :uid
      ORDER BY u.username'
  );
  $stmt->execute(['uid' => $uid]);
  // foreach em vez de array_map com arrow function: nenhum outro arquivo da api usa `fn() =>`,
  // e este código sobe por FTP num servidor onde não dá pra rodar `php -l` antes. Erro de sintaxe
  // aqui é tela branca, então não vale economizar três linhas por um recurso de versão.
  $out = [];
  foreach ($stmt->fetchAll() as $r) {
    $out[] = [
      'userId' => (int) $r['id'],
      'username' => $r['username'],
      'linkedAt' => $r['created_at'],
    ];
  }
  return $out;
}

if ($method === 'GET') {
  json_response(['accounts' => listar_vinculadas($db, $uid)]);
}

if ($method !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

$body = read_json_body();
$action = $body['action'] ?? '';

if ($action === 'generate') {
  // Um codigo pendente por conta: gerar de novo invalida o anterior. Sem isso, cada clique
  // deixaria mais uma chave valida atras de si.
  $db->prepare('DELETE FROM account_link_codes WHERE user_id = :uid AND used_at IS NULL')
    ->execute(['uid' => $uid]);

  $code = strtoupper(bin2hex(random_bytes(4))); // 8 caracteres, ex: "A1B2C3D4"
  $db->prepare('INSERT INTO account_link_codes (code, user_id) VALUES (:code, :uid)')
    ->execute(['code' => $code, 'uid' => $uid]);

  json_response(['ok' => true, 'code' => $code, 'expiresInMinutes' => LINK_CODE_TTL_MINUTES]);
}

if ($action === 'redeem') {
  $code = strtoupper(trim((string) ($body['code'] ?? '')));
  if ($code === '') json_response(['error' => 'missing_code', 'message' => 'Cole o código gerado na outra conta.'], 400);

  // O TTL entra concatenado, não como parâmetro: MySQL não aceita placeholder na posição do
  // INTERVAL sem depender de emulação de prepare. É constante do próprio arquivo, não entrada
  // de usuário, então concatenar aqui não abre nada — mas o (int) fica como cinto de segurança
  // caso alguém troque a constante por algo vindo de fora um dia.
  $ttl = (int) LINK_CODE_TTL_MINUTES;
  $stmt = $db->prepare(
    'SELECT user_id FROM account_link_codes
      WHERE code = :code AND used_at IS NULL
        AND created_at > (NOW() - INTERVAL ' . $ttl . ' MINUTE)'
  );
  $stmt->execute(['code' => $code]);
  $row = $stmt->fetch();
  if (!$row) {
    json_response(['error' => 'invalid_code', 'message' => 'Código inválido, já usado ou vencido. Gere um novo na outra conta.'], 400);
  }

  $outro = (int) $row['user_id'];
  if ($outro === $uid) {
    json_response(['error' => 'same_account', 'message' => 'Esse código é desta mesma conta. Gere o código na conta secundária e cole aqui na principal.'], 400);
  }

  $db->beginTransaction();
  $db->prepare('UPDATE account_link_codes SET used_at = NOW() WHERE code = :code')->execute(['code' => $code]);
  // Mutuo: as duas direcoes, pra comparacao abrir de qualquer um dos dois logins.
  $ins = $db->prepare('INSERT IGNORE INTO linked_accounts (owner_user_id, linked_user_id) VALUES (:a, :b)');
  $ins->execute(['a' => $uid, 'b' => $outro]);
  $ins->execute(['a' => $outro, 'b' => $uid]);
  $db->commit();

  json_response(['ok' => true, 'accounts' => listar_vinculadas($db, $uid)]);
}

if ($action === 'unlink') {
  $outro = (int) ($body['userId'] ?? 0);
  if (!$outro) json_response(['error' => 'missing_user'], 400);
  // Quatro placeholders distintos em vez de repetir :a/:b nos dois lados do OR. Repetir só
  // funciona com PDO::ATTR_EMULATE_PREPARES ligado (que é o default do MySQL, e é o que está
  // valendo hoje) — com emulação desligada vira HY093. Não custa nada não depender disso.
  $db->prepare(
    'DELETE FROM linked_accounts
      WHERE (owner_user_id = :a1 AND linked_user_id = :b1)
         OR (owner_user_id = :b2 AND linked_user_id = :a2)'
  )->execute(['a1' => $uid, 'b1' => $outro, 'b2' => $outro, 'a2' => $uid]);
  json_response(['ok' => true, 'accounts' => listar_vinculadas($db, $uid)]);
}

json_response(['error' => 'unknown_action'], 400);
