<?php
// Upload/remoção do arquivo de som por tipo de alerta — admin only nas duas pontas. O nome do
// arquivo salvo nunca vem do usuário: é sempre "{alertType}.{ext}", com alertType numa
// whitelist e ext decidida pelo servidor a partir do conteúdo real do arquivo (finfo), não da
// extensão/MIME que o navegador manda — evita upload de shell disfarçado de áudio.
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_master_admin();

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'];
$ALERT_TYPES = ['tg', 'worldboss', 'watchdog'];
$MAX_BYTES = 2 * 1024 * 1024;
// Mapa MIME real (via finfo) -> extensão que vamos salvar. Qualquer coisa fora daqui é rejeitada.
$ALLOWED_MIME_TO_EXT = [
  'audio/mpeg' => 'mp3',
  'audio/mp3' => 'mp3',
  'audio/wav' => 'wav',
  'audio/x-wav' => 'wav',
  'audio/wave' => 'wav',
  'audio/ogg' => 'ogg',
];
$SOUNDS_DIR = __DIR__ . '/../uploads/sounds';

function delete_existing_sound_file(string $soundsDir, string $alertType, ?string $filename): void {
  if ($filename && is_file("$soundsDir/$filename")) unlink("$soundsDir/$filename");
}

if ($method === 'POST') {
  $alertType = $_POST['alertType'] ?? '';
  if (!in_array($alertType, $ALERT_TYPES, true)) json_response(['error' => 'invalid_input', 'message' => 'Tipo de alerta inválido.'], 400);

  if (empty($_FILES['sound']) || $_FILES['sound']['error'] !== UPLOAD_ERR_OK) {
    json_response(['error' => 'invalid_input', 'message' => 'Nenhum arquivo enviado.'], 400);
  }
  $tmpPath = $_FILES['sound']['tmp_name'];
  if ($_FILES['sound']['size'] > $MAX_BYTES) {
    json_response(['error' => 'invalid_input', 'message' => 'Arquivo maior que 2MB.'], 400);
  }

  $finfo = finfo_open(FILEINFO_MIME_TYPE);
  $realMime = finfo_file($finfo, $tmpPath);
  finfo_close($finfo);
  if (!isset($ALLOWED_MIME_TO_EXT[$realMime])) {
    json_response(['error' => 'invalid_input', 'message' => 'Arquivo precisa ser mp3, wav ou ogg.'], 400);
  }
  $ext = $ALLOWED_MIME_TO_EXT[$realMime];

  if (!is_dir($SOUNDS_DIR)) mkdir($SOUNDS_DIR, 0755, true);

  $current = $db->prepare('SELECT filename FROM alert_sounds WHERE alert_type = :type');
  $current->execute(['type' => $alertType]);
  $oldFilename = $current->fetchColumn();
  delete_existing_sound_file($SOUNDS_DIR, $alertType, $oldFilename ?: null);

  $newFilename = "$alertType.$ext";
  if (!move_uploaded_file($tmpPath, "$SOUNDS_DIR/$newFilename")) {
    json_response(['error' => 'server_error', 'message' => 'Falha ao salvar o arquivo no servidor.'], 500);
  }

  $db->prepare('UPDATE alert_sounds SET filename = :filename WHERE alert_type = :type')->execute(['filename' => $newFilename, 'type' => $alertType]);
  json_response(['ok' => true, 'filename' => $newFilename]);
}

if ($method === 'DELETE') {
  $body = read_json_body();
  $alertType = $body['alertType'] ?? '';
  if (!in_array($alertType, $ALERT_TYPES, true)) json_response(['error' => 'invalid_input', 'message' => 'Tipo de alerta inválido.'], 400);

  $current = $db->prepare('SELECT filename FROM alert_sounds WHERE alert_type = :type');
  $current->execute(['type' => $alertType]);
  $oldFilename = $current->fetchColumn();
  delete_existing_sound_file($SOUNDS_DIR, $alertType, $oldFilename ?: null);

  $db->prepare('UPDATE alert_sounds SET filename = NULL WHERE alert_type = :type')->execute(['type' => $alertType]);
  json_response(['ok' => true]);
}

json_response(['error' => 'method_not_allowed'], 405);
