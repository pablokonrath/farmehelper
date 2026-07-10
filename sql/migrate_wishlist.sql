-- Migração pra lista de desejos + correio, num banco que já rodou
-- sql/migrate_watchdog_toggle.sql. Rode via phpMyAdmin, aba SQL.

CREATE TABLE wishlist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE wishlist_matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  wishlist_user_id INT NOT NULL,
  dropper_username VARCHAR(255) NOT NULL,
  dropper_guild VARCHAR(100) NULL,
  item_name VARCHAR(255) NOT NULL,
  ts DATETIME NOT NULL,
  seen TINYINT(1) NOT NULL DEFAULT 0,
  delivered TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (wishlist_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
