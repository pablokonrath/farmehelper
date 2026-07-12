-- Farme completo por dia/item (TODOS os itens do log, não só ranking) — deixa o servidor com o
-- farme inteiro pra qualquer aparelho (ex: celular) mostrar a Visão geral igual ao PC. É
-- sincronizado por SNAPSHOT (replace-all) pelo navegador e pelo agente do PC, então nunca conta
-- em dobro. Rode no phpMyAdmin (aba SQL).

CREATE TABLE farm_drops_daily (
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  drop_date DATE NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_name, drop_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
