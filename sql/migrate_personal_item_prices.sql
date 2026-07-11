-- Migração pra preço de item virar individual por jogador (nome continua compartilhado),
-- num banco que já rodou sql/migrate_event_alerts.sql. Rode via phpMyAdmin, aba SQL.
--
-- Cada conta existente herda uma cópia do preço atual de cada item (ponto de partida,
-- editável depois) — ninguém perde o que já tava calculado. A tabela antiga fica guardada
-- como item_prices_shared_backup; depois de confirmar que os valores migraram bem, dá pra
-- rodar "DROP TABLE item_prices_shared_backup;" pra limpar.

RENAME TABLE item_prices TO item_prices_shared_backup;

CREATE TABLE item_prices (
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  price BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO item_prices (user_id, item_name, price)
SELECT u.id, p.item_name, p.price FROM users u CROSS JOIN item_prices_shared_backup p;
