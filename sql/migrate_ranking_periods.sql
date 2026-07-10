-- Migração pra ranking por período (Geral/Semanal/Quinzenal/Mensal), num banco que já rodou
-- sql/migrate_guilds.sql. Rode via phpMyAdmin, aba SQL.

CREATE TABLE drop_counts_daily (
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  drop_date DATE NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_name, drop_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
