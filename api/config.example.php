<?php
// Template versionado no git. Copie este arquivo pra api/config.php (que fica de fora do
// repositório, veja .gitignore) e preencha com os dados reais do banco criado no hPanel da
// Hostinger e o hash da senha gerado por generate-password-hash.php.
// NUNCA preencha api/config.example.php com valores reais nem remova ele do .gitignore o
// arquivo api/config.php.

define('DB_HOST', 'localhost');
define('DB_NAME', 'troque_pelo_nome_do_banco');
define('DB_USER', 'troque_pelo_usuario');
define('DB_PASS', 'troque_pela_senha');

// Gerado por generate-password-hash.php — não é a senha em texto puro, é o hash bcrypt dela.
define('AUTH_PASSWORD_HASH', '');
