-- Adiciona o cadastro manual "em quais DGs este item pode cair", usado pra destacar em Sessões
-- de farme os itens esperados daquela DG. Rode via phpMyAdmin (aba SQL) num banco que já está
-- em produção — instalação nova do zero não precisa, já vem no sql/schema.sql.

CREATE TABLE IF NOT EXISTS item_dungeon_sources (
  item_name VARCHAR(255) NOT NULL,
  dungeon_id VARCHAR(50) NOT NULL,
  PRIMARY KEY (item_name, dungeon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
