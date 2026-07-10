-- Migração pra adicionar conta admin + ranking de itens rastreados num banco que já está
-- em produção (rodado depois de sql/migrate_to_multiuser.sql). Rode via phpMyAdmin, aba SQL.

ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0;

-- Troque 'pablokonrath' se você usou outro username na migração multiusuário.
UPDATE users SET is_admin = 1 WHERE username = 'pablokonrath';

CREATE TABLE drop_counts (
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
