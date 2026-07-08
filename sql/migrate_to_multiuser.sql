-- Migração pra multiusuário — rode isto UMA VEZ no banco de produção que já tem dados
-- (schema antigo, usuário único). NÃO rode em cima de um banco criado com o schema.sql
-- novo (que já vem pronto com tudo isso).
--
-- Antes de rodar: troque '<COLE_O_HASH_ATUAL_AQUI>' abaixo pelo valor exato que está hoje em
-- AUTH_PASSWORD_HASH no seu api/config.php (é um hash bcrypt, começa com $2y$...) — assim
-- você continua entrando com a MESMA senha de sempre, só que agora associada a um usuário.
--
-- Depois de rodar com sucesso: apague a linha AUTH_PASSWORD_HASH do api/config.php (não é
-- mais usada — o login passa a validar contra a tabela users).

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Vira o usuário id=1 (primeiro insert) — todo o backfill abaixo assume DEFAULT 1 por causa
-- disso.
INSERT INTO users (username, password_hash) VALUES ('pablokonrath', '<COLE_O_HASH_ATUAL_AQUI>');

-- rush_history: chave primária deixa de ser só a data, passa a ser (usuário, data), já que
-- duas pessoas podem ter rush salvo no mesmo dia.
ALTER TABLE rush_history ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE rush_history DROP PRIMARY KEY, ADD PRIMARY KEY (user_id, rush_date);
ALTER TABLE rush_history ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- tracked_keywords: só ganha a coluna, a PK (id auto-incremento) não muda.
ALTER TABLE tracked_keywords ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE tracked_keywords ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- app_settings: chave primária deixa de ser só a chave da config, passa a ser (usuário, chave).
ALTER TABLE app_settings ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE app_settings DROP PRIMARY KEY, ADD PRIMARY KEY (user_id, setting_key);
ALTER TABLE app_settings ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- manual_drops: só ganha a coluna, a PK (id auto-incremento) não muda.
ALTER TABLE manual_drops ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE manual_drops ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- alert_history: só ganha a coluna, a PK (id gerado no client) não muda.
ALTER TABLE alert_history ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE alert_history ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- alert_settings: era uma linha única fixa (id=1 com CHECK). Recriar do zero como uma linha
-- por usuário evita depender da sintaxe de "drop check constraint" (que varia entre
-- MySQL/MariaDB) — a tabela é pequena (uma linha só hoje), então é seguro e simples.
CREATE TABLE alert_settings_new (
  user_id INT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sound_enabled TINYINT(1) NOT NULL DEFAULT 1,
  repeat_sound_while_open TINYINT(1) NOT NULL DEFAULT 0,
  volume DECIMAL(3,2) NOT NULL DEFAULT 0.70,
  popup_duration_seconds INT NOT NULL DEFAULT 5,
  grouping_window_seconds INT NOT NULL DEFAULT 30,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO alert_settings_new
  (user_id, enabled, sound_enabled, repeat_sound_while_open, volume, popup_duration_seconds, grouping_window_seconds)
SELECT 1, enabled, sound_enabled, repeat_sound_while_open, volume, popup_duration_seconds, grouping_window_seconds
FROM alert_settings;

DROP TABLE alert_settings;
RENAME TABLE alert_settings_new TO alert_settings;
