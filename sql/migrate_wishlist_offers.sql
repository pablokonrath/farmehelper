-- Propostas de compra: quando alguém dropa um item da sua lista de desejos (correio), você
-- manda uma proposta com valor pra quem dropou; ele vê em "Propostas recebidas" e te chama no
-- jogo pra fechar. Rode no phpMyAdmin (aba SQL).

CREATE TABLE wishlist_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seller_user_id INT NOT NULL,          -- quem dropou (recebe a proposta)
  buyer_user_id INT NOT NULL,           -- quem quer comprar (enviou a proposta)
  buyer_username VARCHAR(64) NOT NULL,
  buyer_guild VARCHAR(64) NULL,
  item_name VARCHAR(255) NOT NULL,
  offer_price BIGINT NOT NULL,
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  seen TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
