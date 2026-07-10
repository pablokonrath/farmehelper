-- Migração pro indicador de jogadores online, num banco que já rodou
-- sql/migrate_watchdog_alerts.sql. Rode via phpMyAdmin, aba SQL.

ALTER TABLE users ADD COLUMN last_seen_at DATETIME NULL DEFAULT NULL;
