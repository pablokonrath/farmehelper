-- Throttle anti-força-bruta no login: registra tentativas que falharam por IP e bloqueia por um
-- tempo depois de muitas seguidas (ver api/login.php). Rode no phpMyAdmin (aba SQL). Não guarda
-- senha, só IP + horário; o próprio login limpa linhas antigas. Seguro rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY ip_time (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
