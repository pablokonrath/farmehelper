-- Migração pra notificação de TG/World Boss fora do navegador (push via OneSignal + Telegram),
-- num banco que já rodou sql/migrate_event_notification_toggle.sql. Rode via phpMyAdmin, aba SQL.

ALTER TABLE alert_settings
  ADD COLUMN push_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN telegram_chat_id VARCHAR(64) NULL;

CREATE TABLE telegram_link_codes (
  code VARCHAR(12) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE event_schedule_deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_schedule_id INT NOT NULL,
  delivery_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY event_date (event_schedule_id, delivery_date),
  FOREIGN KEY (event_schedule_id) REFERENCES event_schedule(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
