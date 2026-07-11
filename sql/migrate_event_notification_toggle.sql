-- Migração pro interruptor pessoal de notificação de TG/World Boss, num banco que já rodou
-- sql/migrate_personal_item_prices.sql. Rode via phpMyAdmin, aba SQL.
-- Default 1 (ligado) preserva o comportamento atual pra quem já tem conta.

ALTER TABLE alert_settings
  ADD COLUMN tg_notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN worldboss_notifications_enabled TINYINT(1) NOT NULL DEFAULT 1;
