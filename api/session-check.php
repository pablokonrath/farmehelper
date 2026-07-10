<?php
require_once __DIR__ . '/auth.php';

json_response([
  'authenticated' => !empty($_SESSION['authenticated']),
  'isAdmin' => current_user_is_admin(),
  'isMasterAdmin' => current_user_is_master_admin(),
  'username' => $_SESSION['username'] ?? '',
  'guild' => $_SESSION['guild'] ?? '',
]);
