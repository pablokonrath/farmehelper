<?php
// Diagnóstico temporário: isolar se o Cron Job da Hostinger está executando alguma coisa,
// sem depender de banco/config — só escreve a hora atual num arquivo. Apagar depois de usar
// (ver DEPLOY.md ou pedir pro Claude remover), não é parte da funcionalidade do app.
file_put_contents(__DIR__ . '/cron-ping-test.txt', 'Rodou às ' . date('Y-m-d H:i:s') . ' (SAPI: ' . php_sapi_name() . ")\n", FILE_APPEND);
