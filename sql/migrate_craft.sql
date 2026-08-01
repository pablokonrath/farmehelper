-- Adiciona o sistema de craft (receitas + histórico de "pronto pra craftar"). Pessoal por conta.
-- Rode via phpMyAdmin (aba SQL) num banco já em produção — instalação nova do zero não precisa,
-- já vem no sql/schema.sql.

CREATE TABLE IF NOT EXISTS craft_recipes (
  user_id INT NOT NULL,
  recipe_id VARCHAR(50) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  materials JSON NOT NULL,
  reset_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, recipe_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS craft_alert_history (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  ts DATETIME NOT NULL,
  recipe_name VARCHAR(255) NOT NULL,
  materials JSON NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
