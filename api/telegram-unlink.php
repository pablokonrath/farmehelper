<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'method_not_allowed'], 405);

get_db()->prepare('UPDATE alert_settings SET telegram_chat_id = NULL WHERE user_id = :uid')
  ->execute(['uid' => current_user_id()]);

json_response(['ok' => true]);
