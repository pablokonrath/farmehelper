<?php
// Sem isso, um erro de PDO/PHP não tratado vira uma página HTML em branco (500 sem corpo)
// quando display_errors está desligado no servidor — o que deixa o fetch() do frontend
// sem nenhuma pista do que quebrou. Devolve a mensagem real como JSON em vez disso.
// Endpoints que chegam até aqui já passaram por require_login() antes de tocar no banco
// (exceto login.php/session-check.php, que não fazem nada capaz de lançar exceção), então
// só o próprio usuário autenticado vê o detalhe do erro.
set_exception_handler(function (Throwable $e) {
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => 'server_error', 'message' => $e->getMessage()]);
  exit;
});

function json_response($data, int $status = 200) {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data);
  exit;
}

function read_json_body(): array {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}
