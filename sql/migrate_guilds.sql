-- Migração pra adicionar guilds + múltiplos admins/líderes, num banco que já rodou
-- sql/migrate_admin_and_leaderboard.sql. Rode via phpMyAdmin, aba SQL.

CREATE TABLE guilds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users ADD COLUMN guild VARCHAR(100) NULL;
