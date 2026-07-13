<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_admin();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $db->query('SELECT id, username, is_admin, is_master_admin, guild, created_at FROM users ORDER BY id')->fetchAll();
  $result = array_map(fn($r) => [
    'id' => (int) $r['id'],
    'username' => $r['username'],
    'isAdmin' => (bool) $r['is_admin'],
    'isMasterAdmin' => (bool) $r['is_master_admin'],
    'guild' => $r['guild'],
    'createdAt' => $r['created_at'],
  ], $rows);
  json_response($result);
}

if ($method === 'POST') {
  $body = read_json_body();
  $username = trim($body['username'] ?? '');
  $password = $body['password'] ?? '';
  $guild = trim($body['guild'] ?? '');
  // Só o admin mestre cria outros admins/líderes. Um líder de guild cria apenas jogador comum
  // (a UI esconde o checkbox pra ele; aqui é a trava de verdade, caso mande isAdmin na marra).
  $isAdmin = !empty($body['isAdmin']) && current_user_is_master_admin();

  if ($username === '' || !is_string($password) || strlen($password) < 8) {
    json_response(['error' => 'invalid_input', 'message' => 'Usuário obrigatório e senha com pelo menos 8 caracteres.'], 400);
  }

  $stmt = $db->prepare('SELECT id FROM users WHERE username = :username');
  $stmt->execute(['username' => $username]);
  if ($stmt->fetch()) {
    json_response(['error' => 'username_taken', 'message' => 'Já existe uma conta com esse usuário.'], 409);
  }

  $stmt = $db->prepare('INSERT INTO users (username, password_hash, guild, is_admin) VALUES (:username, :hash, :guild, :isAdmin)');
  $stmt->execute([
    'username' => $username,
    'hash' => password_hash($password, PASSWORD_BCRYPT),
    'guild' => $guild !== '' ? $guild : null,
    'isAdmin' => $isAdmin ? 1 : 0,
  ]);
  json_response(['ok' => true, 'id' => (int) $db->lastInsertId()], 201);
}

// Promove/edita uma conta já existente — usado tanto pra alternar admin quanto pra corrigir
// a guild de alguém depois de criada. Editar conta é exclusivo do admin mestre: líderes de guild
// só criam jogadores, não mexem em contas existentes (evita várias mãos editando ao mesmo tempo).
if ($method === 'PUT') {
  require_master_admin();
  $body = read_json_body();
  $id = (int) ($body['id'] ?? 0);
  if (!$id) json_response(['error' => 'invalid_input', 'message' => 'ID inválido.'], 400);

  // Ninguém além do próprio admin mestre mexe na conta dele — nem promover/rebaixar, nem
  // trocar guild. Protege a conta do dono do projeto contra os demais admins.
  $targetStmt = $db->prepare('SELECT is_master_admin FROM users WHERE id = :id');
  $targetStmt->execute(['id' => $id]);
  $target = $targetStmt->fetch();
  if (!$target) json_response(['error' => 'not_found'], 404);
  if (!empty($target['is_master_admin']) && !current_user_is_master_admin()) {
    json_response(['error' => 'not_master_admin'], 403);
  }

  $fields = [];
  $params = ['id' => $id];
  if (array_key_exists('isAdmin', $body)) {
    $fields[] = 'is_admin = :isAdmin';
    $params['isAdmin'] = !empty($body['isAdmin']) ? 1 : 0;
  }
  if (array_key_exists('guild', $body)) {
    $fields[] = 'guild = :guild';
    $guild = trim((string) $body['guild']);
    $params['guild'] = $guild !== '' ? $guild : null;
  }

  // Trocar usuário/senha de qualquer conta é exclusivo do admin mestre — checado no servidor,
  // não só escondido na UI, já que a coluna is_master_admin acima não cobre esses dois campos.
  if (array_key_exists('username', $body) || array_key_exists('password', $body)) {
    require_master_admin();

    if (array_key_exists('username', $body)) {
      $newUsername = trim((string) $body['username']);
      if ($newUsername === '') json_response(['error' => 'invalid_input', 'message' => 'Usuário não pode ficar em branco.'], 400);
      $dupStmt = $db->prepare('SELECT id FROM users WHERE username = :username AND id != :id');
      $dupStmt->execute(['username' => $newUsername, 'id' => $id]);
      if ($dupStmt->fetch()) json_response(['error' => 'username_taken', 'message' => 'Já existe uma conta com esse usuário.'], 409);
      $fields[] = 'username = :username';
      $params['username'] = $newUsername;
    }
    if (array_key_exists('password', $body) && $body['password'] !== '') {
      $newPassword = (string) $body['password'];
      if (strlen($newPassword) < 8) json_response(['error' => 'invalid_input', 'message' => 'Senha precisa de pelo menos 8 caracteres.'], 400);
      $fields[] = 'password_hash = :hash';
      $params['hash'] = password_hash($newPassword, PASSWORD_BCRYPT);
    }
  }

  if (!$fields) json_response(['error' => 'invalid_input', 'message' => 'Nada pra atualizar.'], 400);

  $stmt = $db->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id');
  $stmt->execute($params);
  json_response(['ok' => true]);
}

// Só o admin mestre exclui contas — inclusive de outros admins. Todas as tabelas por-usuário
// já têm ON DELETE CASCADE, então os dados da conta (farme, rush, alertas etc.) somem juntos.
if ($method === 'DELETE') {
  require_master_admin();
  $body = read_json_body();
  $id = (int) ($body['id'] ?? 0);
  if (!$id) json_response(['error' => 'invalid_input', 'message' => 'ID inválido.'], 400);
  if ($id === current_user_id()) json_response(['error' => 'cannot_delete_self', 'message' => 'Não dá pra excluir a própria conta.'], 400);

  $db->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $id]);
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
