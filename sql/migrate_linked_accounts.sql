-- Contas vinculadas: comparar o farme diario de duas contas do MESMO jogador (a principal e uma
-- secundaria) sem misturar dado nenhum entre elas.
--
-- Por que nao virou "personagem" dentro de uma conta so: cada conta tem o proprio gasto de rush,
-- o proprio estoque, os proprios precos e a propria lista de DGs. Fundir isso numa tabela so
-- exigiria uma coluna nova em quase tudo e ainda somaria coisas que sao legitimamente separadas.
-- Duas contas de verdade, com uma unica porta entre elas, e mais simples e mais seguro.
--
-- A porta e estreita de proposito: o que atravessa o vinculo e SO o resumo do dia (daily_summaries)
-- -- farmado, gasto, vendido, runs, tempo. Sessao, drop, preco e venda continuam estritamente
-- isolados por user_id, como sempre foram.
--
-- Rode uma vez no phpMyAdmin da Hostinger (aba SQL, colar, executar).

-- Codigo de uso unico pra vincular, mesmo padrao do vinculo com o Telegram: a conta secundaria
-- gera, a principal cola. Possuir o codigo E o consentimento -- sem isso qualquer jogador poderia
-- se vincular a conta de outro e ler o farme dele.
CREATE TABLE IF NOT EXISTS account_link_codes (
  code VARCHAR(12) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- O vinculo e MUTUO: resgatar um codigo grava as duas direcoes, e desvincular apaga as duas.
-- Sao as duas contas da mesma pessoa, e poder abrir a comparacao de qualquer um dos dois logins
-- vale mais que a assimetria. Deixar so uma direcao criaria a situacao esquisita de a secundaria
-- nao conseguir se comparar com a principal, mesmo tendo sido ela a autorizar o vinculo.
CREATE TABLE IF NOT EXISTS linked_accounts (
  owner_user_id INT NOT NULL,
  linked_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_user_id, linked_user_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Resumo publicado por dia. Cada conta grava o proprio; a conta vinculada le.
--
-- E um agregado ja calculado, nao materia-prima: farmado sai a preco da epoca (a mesma regra do
-- resto do app -- dinheiro e preco da epoca, decisao e preco de hoje), e quem calculou foi a
-- propria conta, que e a unica que tem os precos dela. Recalcular do outro lado daria um numero
-- diferente do que aquele jogador ve na tela dele, e duas verdades pro mesmo dia e pior que uma.
--
-- updated_at existe porque um resumo pode estar VELHO: se a secundaria nao abriu o app hoje, o
-- numero dela e de ontem. A tela precisa poder dizer isso em vez de comparar contra um vazio e
-- deixar parecer que ela nao farmou.
CREATE TABLE IF NOT EXISTS daily_summaries (
  user_id INT NOT NULL,
  summary_date DATE NOT NULL,
  farmed BIGINT NOT NULL DEFAULT 0,
  spent BIGINT NOT NULL DEFAULT 0,
  sold BIGINT NOT NULL DEFAULT 0,
  runs INT NOT NULL DEFAULT 0,
  active_ms BIGINT NOT NULL DEFAULT 0,
  session_count INT NOT NULL DEFAULT 0,
  top_dg VARCHAR(120) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, summary_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
