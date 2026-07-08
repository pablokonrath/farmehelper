<?php
// Template versionado no git. Copie este arquivo pra api/config.php (que fica de fora do
// repositório, veja .gitignore) e preencha com os dados reais do banco criado no hPanel da
// Hostinger. NUNCA preencha api/config.example.php com valores reais nem remova
// api/config.php do .gitignore.
//
// Login não usa mais senha única aqui — cada pessoa tem sua própria conta na tabela `users`
// (veja sql/schema.sql e DEPLOY.md pra criar contas com generate-password-hash.php).

define('DB_HOST', 'localhost');
define('DB_NAME', 'troque_pelo_nome_do_banco');
define('DB_USER', 'troque_pelo_usuario');
define('DB_PASS', 'troque_pela_senha');
