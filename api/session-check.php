<?php
require_once __DIR__ . '/auth.php';

json_response([
  'authenticated' => !empty($_SESSION['authenticated']),
  'isAdmin' => current_user_is_admin(),
  'isMasterAdmin' => current_user_is_master_admin(),
  'username' => $_SESSION['username'] ?? '',
  'guild' => $_SESSION['guild'] ?? '',
  // Pro cliente poder chamar OneSignal.login(userId) e associar o navegador à própria conta,
  // sem precisar guardar nenhum ID de dispositivo/subscription no nosso banco.
  'userId' => (int) ($_SESSION['user_id'] ?? 0),
]);
