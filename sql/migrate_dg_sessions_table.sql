-- CORREÇÃO DE PERDA DE DADOS (a boa) — rode ESTE arquivo INTEIRO no phpMyAdmin (aba SQL).
--
-- Antes: o histórico de Sessões de DG ficava como UM único JSON em app_settings (TEXT, 64 KB).
-- Acumulando (cada sessão guarda a lista de itens), passava de 64 KB, era truncado no save, e no
-- login seguinte o JSON cortado não abria e zerava tudo. Agora cada sessão vira UMA LINHA numa
-- tabela própria — sem blob que estoura.

-- (1) Tabela própria das sessões de DG (1 linha por sessão).
CREATE TABLE IF NOT EXISTS dg_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  dungeon_id VARCHAR(64) NULL,
  dungeon_name VARCHAR(255) NULL,
  session_date VARCHAR(10) NULL,          -- 'AAAA-MM-DD' (guardado como texto, igual o cliente)
  start_at BIGINT NOT NULL,               -- Date.now() do início — identifica a sessão no cliente
  end_at BIGINT NULL,
  duration_ms BIGINT NULL,
  active_duration_ms BIGINT NULL,
  runs INT NOT NULL DEFAULT 0,
  drop_count INT NOT NULL DEFAULT 0,
  unique_items INT NOT NULL DEFAULT 0,
  total_alz BIGINT NOT NULL DEFAULT 0,
  alz_per_hour DOUBLE NULL,
  best_item_name VARCHAR(255) NULL,
  best_item_price BIGINT NULL,
  items MEDIUMTEXT NULL,                   -- lista de itens da sessão (name->qty), por linha
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY user_start (user_id, start_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- (2) O que continua como JSON em app_settings (salesLog, priceHistory) também podia estourar
--     64 KB — dá o mesmo fôlego de 16 MB pra eles.
ALTER TABLE app_settings MODIFY setting_value MEDIUMTEXT NOT NULL;
