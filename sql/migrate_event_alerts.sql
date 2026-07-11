-- Migração pra horários de eventos (TG/World Boss) + sons customizados por alerta, num banco
-- que já rodou sql/migrate_wishlist.sql. Rode via phpMyAdmin, aba SQL.

CREATE TABLE event_schedule (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(20) NOT NULL,
  time_of_day TIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE alert_sounds (
  alert_type VARCHAR(20) NOT NULL PRIMARY KEY,
  filename VARCHAR(255) NULL,
  volume DECIMAL(3,2) NOT NULL DEFAULT 0.90
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO alert_sounds (alert_type, filename, volume) VALUES
  ('tg', NULL, 0.90), ('worldboss', NULL, 0.90), ('watchdog', NULL, 0.90);
