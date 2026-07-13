-- Migração: espelho ao vivo do farme (página "Ao vivo").
-- Buffer curto (podado pra ~6h) que o PC alimenta com os drops novos e o celular puxa por cursor.
-- Rode uma vez no phpMyAdmin. Idempotente (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS live_drops (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  alz BIGINT NOT NULL DEFAULT 0,
  dropped_at BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY user_id_id (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
