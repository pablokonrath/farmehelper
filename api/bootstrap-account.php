<?php
// Ferramenta de uso único pra criar a PRIMEIRA (e única) conta quando a tabela users está
// vazia — não precisa mais gerar hash à mão e colar num INSERT. Só funciona se não existir
// NENHUMA conta ainda (proteção pra não virar uma porta de criação de conta pra sempre); depois
// de usar, DELETE ESTE ARQUIVO do servidor.
require_once __DIR__ . '/db.php';

$db = get_db();
$existingCount = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();

$error = null;
$created = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if ($existingCount > 0) {
    $error = 'Já existe conta cadastrada — esta ferramenta só cria a primeira conta. Apague este arquivo.';
  } else {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    if ($username === '' || $password === '') {
      $error = 'Preencha usuário e senha.';
    } else {
      $stmt = $db->prepare('INSERT INTO users (username, password_hash, is_admin, is_master_admin, guild, created_at)
        VALUES (:username, :hash, 1, 1, \'\', NOW())');
      $stmt->execute(['username' => $username, 'hash' => password_hash($password, PASSWORD_BCRYPT)]);
      $created = true;
      $existingCount = 1;
    }
  }
}
?>
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Criar conta</title></head>
<body style="font-family:sans-serif;max-width:520px;margin:40px auto;line-height:1.5">
  <h2>Criar conta</h2>

  <?php if ($created): ?>
    <p style="color:#080;font-weight:bold">Conta criada! Já pode entrar por <a href="../owner-login.html">owner-login.html</a>.</p>
    <p style="color:#b00"><strong>Apague este arquivo (bootstrap-account.php) do servidor agora.</strong></p>
  <?php elseif ($existingCount > 0): ?>
    <p style="color:#b00">Já existe conta cadastrada — esta ferramenta só serve pra criar a primeira. <strong>Apague este arquivo do servidor.</strong></p>
  <?php else: ?>
    <?php if ($error): ?><p style="color:#b00"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    <form method="post">
      <div style="margin-bottom:10px">
        <label>Usuário<br><input type="text" name="username" style="width:100%;padding:8px" required></label>
      </div>
      <div style="margin-bottom:10px">
        <label>Senha<br><input type="password" name="password" style="width:100%;padding:8px" required></label>
      </div>
      <button type="submit" style="padding:8px 16px">Criar conta</button>
    </form>
  <?php endif; ?>
</body>
</html>
