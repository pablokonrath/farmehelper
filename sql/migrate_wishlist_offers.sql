-- Propostas de compra: quando alguém dropa um item da sua lista de desejos (correio), você
-- manda uma proposta com valor pra quem dropou. Ele vê em "Propostas recebidas", responde
-- ACEITA ou RECUSA, e o comprador recebe esse retorno (e um aviso no Telegram, se vinculado)
-- com a orientação de fechar a troca no jogo ou pelo Seguro Neo com a assistência do GM.
--
-- Rode ESTE ARQUIVO INTEIRO no phpMyAdmin (aba SQL) — cole tudo e mande executar.
-- É seguro rodar quantas vezes quiser: cria a tabela se não existir e adiciona cada coluna
-- só se estiver faltando, sem dar erro de "já existe".

-- 1) Cria a tabela se ainda não existir (instalação nova já vem completa).
CREATE TABLE IF NOT EXISTS wishlist_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seller_user_id INT NOT NULL,          -- quem dropou (recebe a proposta)
  buyer_user_id INT NOT NULL,           -- quem quer comprar (enviou a proposta)
  buyer_username VARCHAR(64) NOT NULL,
  buyer_guild VARCHAR(64) NULL,
  item_name VARCHAR(255) NOT NULL,
  offer_price BIGINT NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  responded_at TIMESTAMP NULL,                    -- quando o vendedor respondeu
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  seen TINYINT(1) NOT NULL DEFAULT 0,             -- o vendedor já viu a proposta
  buyer_seen TINYINT(1) NOT NULL DEFAULT 0,       -- o comprador já viu a resposta
  FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Se a tabela já existia da versão antiga (sem resposta), adiciona as colunas que faltam.
--    Cada bloco checa antes de alterar, então não dá erro se a coluna já estiver lá.

SET @ddl := IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wishlist_offers' AND COLUMN_NAME = 'status'),
  'ALTER TABLE wishlist_offers ADD COLUMN status VARCHAR(12) NOT NULL DEFAULT ''pending''',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wishlist_offers' AND COLUMN_NAME = 'responded_at'),
  'ALTER TABLE wishlist_offers ADD COLUMN responded_at TIMESTAMP NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wishlist_offers' AND COLUMN_NAME = 'buyer_seen'),
  'ALTER TABLE wishlist_offers ADD COLUMN buyer_seen TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
