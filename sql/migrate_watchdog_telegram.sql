-- Migração pra mandar o alerta do watchdog (helper travado / item sumido) pro Telegram, e seguir
-- avisando enquanto continuar travado. Rode via phpMyAdmin (aba SQL) num banco que já rodou
-- sql/migrate_wishlist_telegram.sql. (O "repetir até voltar a farmar" é só lógica no cliente,
-- não precisa de coluna nova.)

ALTER TABLE alert_settings
  ADD COLUMN telegram_watchdog_relay_enabled TINYINT(1) NOT NULL DEFAULT 0;
