-- DropList — esquema do banco (MySQL 5.7+/MariaDB), pra uma instalação NOVA do zero.
-- Se você já tem um banco em produção com dados (schema antigo, de usuário único), NÃO rode
-- este arquivo nele — use sql/migrate_to_multiuser.sql, que preserva os dados existentes.
--
-- item_prices e dungeons são compartilhados entre todo mundo (catálogo comum). As demais
-- tabelas são privadas por usuário (user_id), então cada conta só vê os próprios dados de
-- farme/rush/alertas.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  guild VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lista global de guilds (texto controlado, cadastrado pelo admin) — evita "Guild XYZ" vs
-- "guild xyz" virarem entradas diferentes quando alguém agregar por guild no futuro.
CREATE TABLE IF NOT EXISTS guilds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_prices (
  item_name VARCHAR(255) NOT NULL PRIMARY KEY,
  price BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dungeons (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  alz_cost BIGINT NOT NULL DEFAULT 0,
  tickets_per_run INT NOT NULL DEFAULT 0,
  gems_per_run INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rush_history (
  user_id INT NOT NULL,
  rush_date DATE NOT NULL,
  total BIGINT NOT NULL DEFAULT 0,
  items JSON NOT NULL,
  PRIMARY KEY (user_id, rush_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tracked_keywords (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  word VARCHAR(255) NOT NULL,
  alert_enabled TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Flags avulsas de configuração por usuário (hoje só filterByTrackedKeywords, mas dá pra
-- crescer sem precisar de tabela/coluna nova a cada nova flag booleana/simples).
CREATE TABLE IF NOT EXISTS app_settings (
  user_id INT NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  PRIMARY KEY (user_id, setting_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS manual_drops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  drop_date DATE NOT NULL,
  drop_time TIME NOT NULL,
  category INT NOT NULL DEFAULT 0,
  name VARCHAR(255) NOT NULL,
  batch_id VARCHAR(50) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Uma linha por usuário (upsert via ON DUPLICATE KEY em user_id) — não precisa de seed, a
-- primeira vez que o usuário salva as configs de alerta já cria a linha dele.
CREATE TABLE IF NOT EXISTS alert_settings (
  user_id INT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sound_enabled TINYINT(1) NOT NULL DEFAULT 1,
  repeat_sound_while_open TINYINT(1) NOT NULL DEFAULT 0,
  volume DECIMAL(3,2) NOT NULL DEFAULT 0.70,
  popup_duration_seconds INT NOT NULL DEFAULT 5,
  grouping_window_seconds INT NOT NULL DEFAULT 30,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alert_history (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  ts DATETIME NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  keyword VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  seen TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Contagens agregadas (não os drops individuais) dos itens rastreados de cada usuário —
-- alimenta o ranking entre contas da guild. Substituída por inteiro a cada sincronização
-- (mesmo padrão "apaga e reinsere" dos outros endpoints privados).
CREATE TABLE IF NOT EXISTS drop_counts (
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Igual drop_counts, mas com granularidade por dia — alimenta as abas Semanal/Quinzenal/
-- Mensal do Ranking (soma os últimos N dias), sem afetar a aba Geral (que continua lendo
-- só de drop_counts, inalterada).
CREATE TABLE IF NOT EXISTS drop_counts_daily (
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  drop_date DATE NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_name, drop_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lista global (não por usuário) de itens que entram no ranking, controlada só pelo admin —
-- separada da lista pessoal de "palavras rastreadas" de cada um (essa continua só pros
-- alertas de cada pessoa, privada). featured = fica fixado no topo do Ranking com destaque
-- visual, mesmo sem selecionar no filtro.
CREATE TABLE IF NOT EXISTS ranking_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  word VARCHAR(255) NOT NULL,
  featured TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lista global de nomes de categoria (texto livre, ex: Sets/Armas/Dragonas), gerida só pelo
-- admin — mesmo padrão de ranking_items (substitui a lista inteira a cada PUT).
CREATE TABLE IF NOT EXISTS item_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Atribuição item → categoria por NOME (não id) — evita depender de FK estável quando o
-- admin renomeia/remove uma categoria; item sem entrada aqui cai em "Sem categoria" no
-- Relatório.
CREATE TABLE IF NOT EXISTS item_category_assignments (
  item_name VARCHAR(255) NOT NULL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sinalizações heurísticas de possível dado forjado: 'file_tamper' (o trecho já lido do
-- arquivo de log mudou entre duas leituras — provável edição manual) ou 'drop_spike' (uma
-- sincronização aumentou a contagem de um item muito mais do que o normal pra um poll de 5s).
-- Não bloqueia nada — só dá visibilidade pro admin revisar manualmente.
CREATE TABLE IF NOT EXISTS integrity_flags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  username VARCHAR(255) NOT NULL,
  flag_type VARCHAR(30) NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registro do que cada admin criou/alterou (contas, guilds, itens do ranking, categorias,
-- atribuições) — rastreabilidade entre múltiplos admins/líderes com acesso compartilhado.
CREATE TABLE IF NOT EXISTS admin_action_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id INT NOT NULL,
  admin_username VARCHAR(255) NOT NULL,
  action VARCHAR(60) NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
