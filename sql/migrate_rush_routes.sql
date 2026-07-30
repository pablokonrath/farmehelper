-- Adiciona rotas de DGs reutilizáveis (molde de rush, sem data fixa — aplica no carrinho quando
-- quiser). Pessoal por conta, igual rush_history. Rode via phpMyAdmin (aba SQL) num banco já em
-- produção — instalação nova do zero não precisa, já vem no sql/schema.sql.

CREATE TABLE IF NOT EXISTS rush_routes (
  user_id INT NOT NULL,
  route_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  items JSON NOT NULL,
  PRIMARY KEY (user_id, route_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
