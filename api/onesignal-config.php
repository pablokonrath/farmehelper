<?php
// App ID do OneSignal é público por natureza (o SDK client-side sempre expõe ele) — esse
// endpoint não precisa de login. index.html é um arquivo estático (não passa por PHP), então
// não dá pra embutir a constante direto nele; o cliente busca aqui uma vez, sob demanda.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

json_response(['appId' => ONESIGNAL_APP_ID]);
