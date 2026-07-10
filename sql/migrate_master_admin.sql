-- Migração pra admin mestre, num banco que já rodou sql/migrate_integrity_and_admin_log.sql.
-- Rode via phpMyAdmin, aba SQL.

ALTER TABLE users ADD COLUMN is_master_admin TINYINT(1) NOT NULL DEFAULT 0;
UPDATE users SET is_master_admin = 1 WHERE username = 'pablokonrath';
