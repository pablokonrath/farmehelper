-- Migração: separa o "Ao vivo" por DG (atual / últimas / sem DG marcada).
-- Rode uma vez no phpMyAdmin. Idempotente (checa se a coluna já existe antes de criar).
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_drops' AND COLUMN_NAME = 'dungeon_name'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE live_drops ADD COLUMN dungeon_name VARCHAR(255) NULL AFTER dropped_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
