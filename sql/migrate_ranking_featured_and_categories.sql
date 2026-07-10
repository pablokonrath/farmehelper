-- Migração pra adicionar destaque no ranking + categorias de item, num banco que já rodou
-- sql/migrate_admin_and_leaderboard.sql. Rode via phpMyAdmin, aba SQL.

ALTER TABLE ranking_items ADD COLUMN featured TINYINT(1) NOT NULL DEFAULT 0;

-- Lista global de nomes de categoria (texto livre, ex: Sets/Armas/Dragonas), gerida só pelo
-- admin — mesmo padrão de ranking_items (substitui a lista inteira a cada PUT).
CREATE TABLE item_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Atribuição item → categoria por NOME (não id) — evita depender de FK estável quando o
-- admin renomeia/remove uma categoria; item sem entrada aqui cai em "Sem categoria" no
-- Relatório.
CREATE TABLE item_category_assignments (
  item_name VARCHAR(255) NOT NULL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
