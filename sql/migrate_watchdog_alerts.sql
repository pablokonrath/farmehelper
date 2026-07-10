-- Migração pro alerta de inatividade (watchdog), num banco que já rodou
-- sql/migrate_master_admin.sql. Rode via phpMyAdmin, aba SQL.

ALTER TABLE alert_settings
  ADD COLUMN no_drop_threshold_minutes INT NOT NULL DEFAULT 1,
  ADD COLUMN item_silence_threshold_minutes INT NOT NULL DEFAULT 60;
