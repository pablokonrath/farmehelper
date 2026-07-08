-- DropList — esquema do banco (MySQL 5.7+/MariaDB). Espelha 1:1 o que hoje fica em
-- localStorage (ver js/state/persistence.js) — cada save*() do frontend vira um PUT que
-- apaga e reinsere o conteúdo inteiro da tabela correspondente, então não há necessidade
-- de updates granulares aqui.

CREATE TABLE IF NOT EXISTS item_prices (
  item_name VARCHAR(255) NOT NULL PRIMARY KEY,
  price BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rush_history (
  rush_date DATE NOT NULL PRIMARY KEY,
  total BIGINT NOT NULL DEFAULT 0,
  items JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tracked_keywords (
  id INT AUTO_INCREMENT PRIMARY KEY,
  word VARCHAR(255) NOT NULL,
  alert_enabled TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Flags avulsas de configuração (hoje só filterByTrackedKeywords, mas dá pra crescer sem
-- precisar de tabela/coluna nova a cada nova flag booleana/simples).
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dungeons (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  alz_cost BIGINT NOT NULL DEFAULT 0,
  tickets_per_run INT NOT NULL DEFAULT 0,
  gems_per_run INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS manual_drops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  drop_date DATE NOT NULL,
  drop_time TIME NOT NULL,
  category INT NOT NULL DEFAULT 0,
  name VARCHAR(255) NOT NULL,
  batch_id VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alert_settings (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sound_enabled TINYINT(1) NOT NULL DEFAULT 1,
  repeat_sound_while_open TINYINT(1) NOT NULL DEFAULT 0,
  volume DECIMAL(3,2) NOT NULL DEFAULT 0.70,
  popup_duration_seconds INT NOT NULL DEFAULT 5,
  grouping_window_seconds INT NOT NULL DEFAULT 30,
  CONSTRAINT single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alert_history (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  ts DATETIME NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  keyword VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  seen TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO alert_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id;
