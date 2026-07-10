-- Migração pro interruptor manual do watchdog, num banco que já rodou
-- sql/migrate_online_presence.sql. Rode via phpMyAdmin, aba SQL.

ALTER TABLE alert_settings ADD COLUMN watchdog_enabled TINYINT(1) NOT NULL DEFAULT 0;
