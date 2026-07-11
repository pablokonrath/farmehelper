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

// Notificação de TG/World Boss fora do app (push + Telegram) — ver seção correspondente no
// DEPLOY.md pra criar a conta OneSignal grátis e o bot no @BotFather. Deixe em branco se não
// for usar esse recurso (o resto do app funciona normalmente sem essas constantes).
define('ONESIGNAL_APP_ID', '');           // público, também usado no frontend
define('ONESIGNAL_REST_API_KEY', '');     // secreto, só backend
define('TELEGRAM_BOT_TOKEN', '');         // secreto
define('TELEGRAM_BOT_USERNAME', '');      // público, pro link t.me/...
define('TELEGRAM_WEBHOOK_SECRET', '');    // secreto, valida que a chamada veio do Telegram

// Token pra acionar o cron-check-events.php via HTTP (cron externo tipo cron-job.org, quando o
// Cron Job da Hostinger não funciona — ver DEPLOY.md). Se deixar em branco, ele reaproveita o
// TELEGRAM_WEBHOOK_SECRET automaticamente, então normalmente não precisa preencher.
define('CRON_HTTP_SECRET', '');           // secreto
