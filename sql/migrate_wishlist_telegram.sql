-- Migração pra avisar no Telegram quando alguém dropa um item da SUA lista de desejos — com o
-- seu navegador fechado inclusive, já que quem detecta e reporta o drop é o navegador de quem
-- dropou (ver api/wishlist-check.php). Rode via phpMyAdmin (aba SQL) num banco que já rodou
-- sql/migrate_tracked_drop_telegram.sql.

ALTER TABLE alert_settings
  ADD COLUMN telegram_wishlist_relay_enabled TINYINT(1) NOT NULL DEFAULT 0;
