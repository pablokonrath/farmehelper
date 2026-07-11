-- Migração pra: (1) /drop no Telegram mostrar os itens RASTREADOS de cada jogador (não só a
-- lista de ranking do admin), e (2) enviar o drop rastreado pro Telegram na hora que cai.
-- Rode via phpMyAdmin (aba SQL) num banco que já rodou sql/migrate_push_telegram.sql.

ALTER TABLE alert_settings
  ADD COLUMN telegram_drop_relay_enabled TINYINT(1) NOT NULL DEFAULT 0;

-- Contagem por-dia dos itens que batem com a lista pessoal de palavras rastreadas de cada um
-- (AppState.trackedKeywords) — separada de drop_counts_daily, que é filtrada pela lista GLOBAL
-- de ranking do admin. É daqui que o comando /drop do bot lê.
CREATE TABLE tracked_drop_counts_daily (
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  drop_date DATE NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_name, drop_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
