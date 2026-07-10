<?php
require_once __DIR__ . '/auth.php';

json_response([
  'authenticated' => !empty($_SESSION['authenticated']),
  'isAdmin' => !empty($_SESSION['is_admin']),
  'username' => $_SESSION['username'] ?? '',
]);
