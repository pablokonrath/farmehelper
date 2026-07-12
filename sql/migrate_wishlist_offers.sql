-- Propostas de compra: quando alguém dropa um item da sua lista de desejos (correio), você
-- manda uma proposta com valor pra quem dropou. Ele vê em "Propostas recebidas", responde
-- ACEITA ou RECUSA, e o comprador recebe esse retorno (e um aviso no Telegram, se vinculado)
-- com a orientação de fechar a troca no jogo ou pelo Seguro Neo com a assistência do GM.
-- Rode no phpMyAdmin (aba SQL).

CREATE TABLE wishlist_offers (
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

-- Se você JÁ tinha rodado a versão anterior desta tabela (sem resposta), NÃO rode o CREATE acima;
-- rode só estas 3 linhas pra adicionar as colunas novas:
-- ALTER TABLE wishlist_offers ADD COLUMN status VARCHAR(12) NOT NULL DEFAULT 'pending';
-- ALTER TABLE wishlist_offers ADD COLUMN responded_at TIMESTAMP NULL;
-- ALTER TABLE wishlist_offers ADD COLUMN buyer_seen TINYINT(1) NOT NULL DEFAULT 0;
