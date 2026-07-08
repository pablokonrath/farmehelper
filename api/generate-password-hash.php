<?php
// Ferramenta de uso único: abra este arquivo no navegador (ex: seusite.com/api/generate-password-hash.php),
// digite a senha que você quer usar pra logar no DropList, copie o hash gerado pro
// AUTH_PASSWORD_HASH em config.php, e DELETE ESTE ARQUIVO em seguida — deixá-lo no ar
// permite que qualquer um gere hashes, o que não é um problema em si, mas não deve ficar
// exposto num site em produção.

$hash = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['password'])) {
  $hash = password_hash($_POST['password'], PASSWORD_BCRYPT);
}
?>
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Gerar hash de senha</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto">
  <h2>Gerar hash da senha do DropList</h2>
  <form method="post">
    <input type="password" name="password" placeholder="Digite a senha desejada" style="width:100%;padding:8px" required>
    <button type="submit" style="margin-top:8px;padding:8px 16px">Gerar hash</button>
  </form>
  <?php if ($hash): ?>
    <p><strong>Cole isto em AUTH_PASSWORD_HASH no config.php:</strong></p>
    <textarea readonly style="width:100%;height:60px"><?= htmlspecialchars($hash) ?></textarea>
    <p style="color:#b00"><strong>Depois de copiar, apague este arquivo (generate-password-hash.php) do servidor.</strong></p>
  <?php endif; ?>
</body>
</html>
