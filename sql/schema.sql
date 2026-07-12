-- DropList — esquema do banco (MySQL 5.7+/MariaDB), pra uma instalação NOVA do zero.
-- Se você já tem um banco em produção com dados (schema antigo, de usuário único), NÃO rode
-- este arquivo nele — use sql/migrate_to_multiuser.sql, que preserva os dados existentes.
--
-- dungeons é compartilhado entre todo mundo (catálogo comum). As demais tabelas são privadas
-- por usuário (user_id), então cada conta só vê os próprios dados de farme/rush/alertas —
-- inclusive item_prices, onde só o NOME do item é conhecido entre todos (ver known_item_names
-- em api/known-item-names.php), o preço em si é individual de cada um.

-- is_master_admin nunca é setável pela API (só via SQL direto) — é quem pode excluir contas
-- e editar login (usuário/senha) de qualquer conta, inclusive de outros admins.
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  is_master_admin TINYINT(1) NOT NULL DEFAULT 0,
  guild VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lista global de guilds (texto controlado, cadastrado pelo admin) — evita "Guild XYZ" vs
-- "guild xyz" virarem entradas diferentes quando alguém agregar por guild no futuro.
CREATE TABLE IF NOT EXISTS guilds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Preço é individual — cada jogador vende pelo valor que quiser, então mudar o preço de um
-- não pode afetar o "Total de farme" de outra conta. O nome do item, esse sim, é visível pra
-- todo mundo via known-item-names.php (SELECT DISTINCT cruzando todos os usuários), só pra
-- facilitar autocompletar o nome certo sem reescrever do zero.
CREATE TABLE IF NOT EXISTS item_prices (
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  price BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
  no_drop_threshold_minutes INT NOT NULL DEFAULT 1,
  item_silence_threshold_minutes INT NOT NULL DEFAULT 60,
  watchdog_enabled TINYINT(1) NOT NULL DEFAULT 0,
  tg_notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
  worldboss_notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
  -- push_enabled não guarda ID de dispositivo nenhum: o OneSignal associa o navegador ao
  -- próprio user_id via "external ID" (OneSignal.login no cliente); o servidor manda push só
  -- citando esse mesmo ID, sem precisar persistir player_id/subscription aqui.
  push_enabled TINYINT(1) NOT NULL DEFAULT 0,
  telegram_chat_id VARCHAR(64) NULL,
  -- Envia o drop rastreado pro Telegram na hora que cai (com o DropList aberto) — ver
  -- api/telegram-relay-drop.php. Desligado por padrão, é opt-in por jogador.
  telegram_drop_relay_enabled TINYINT(1) NOT NULL DEFAULT 0,
  -- Avisa no Telegram quando alguém dropa um item da lista de desejos deste usuário — funciona
  -- até com o navegador dele fechado (quem reporta é o navegador de quem dropou, ver
  -- api/wishlist-check.php). Opt-in, desligado por padrão.
  telegram_wishlist_relay_enabled TINYINT(1) NOT NULL DEFAULT 0,
  -- Manda o alerta do watchdog (helper travado / item sumido) pro Telegram — ver
  -- api/telegram-relay-watchdog.php. Só com o DropList aberto. Opt-in, desligado por padrão.
  telegram_watchdog_relay_enabled TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Código de uso único mostrado na tela pro jogador vincular a própria conta ao bot do
-- Telegram (manda /start CODE, o webhook casa o código com o user_id e grava
-- alert_settings.telegram_chat_id).
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code VARCHAR(12) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP NULL,
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

-- Contagem por-dia dos itens que batem com a lista PESSOAL de palavras rastreadas de cada um
-- (AppState.trackedKeywords) — separada de drop_counts_daily (que é filtrada pela lista global
-- de ranking do admin). É daqui que o comando /drop do bot do Telegram lê.
CREATE TABLE IF NOT EXISTS tracked_drop_counts_daily (
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  drop_date DATE NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_name, drop_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Farme completo por dia/item (TODOS os itens do log, não só ranking) — deixa o servidor com o
-- farme inteiro pra qualquer aparelho (ex: celular) mostrar a Visão geral igual ao PC.
-- Sincronizado por snapshot (replace-all) pelo navegador e pelo agente do PC (ver farm-drops.php).
CREATE TABLE IF NOT EXISTS farm_drops_daily (
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

-- Lista pessoal de itens que o usuário quer comprar — igual tracked_keywords, mas usada pro
-- matching cross-usuário em wishlist_matches, não pros alertas pessoais de item rastreado.
CREATE TABLE IF NOT EXISTS wishlist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Um "correio": alguém dropou um item que outro usuário tinha na lista de desejos.
-- dropper_username/dropper_guild desnormalizados (sem JOIN pra listar), mesmo padrão de
-- leaderboard.php/integrity_flags. seen = usuário já olhou a página; delivered = o
-- toast/som/notificação já disparou uma vez (heartbeat.php marca isso) — são dois estados
-- independentes porque um match pode ficar "não visto" por dias mas só deve tocar uma vez.
CREATE TABLE IF NOT EXISTS wishlist_matches (
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

-- Horários recorrentes (agenda compartilhada, admin cadastra) de TG/World Boss. Guardado sem
-- timezone — o "está na hora?" é checado no navegador de cada jogador com a hora local dele.
CREATE TABLE IF NOT EXISTS event_schedule (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(20) NOT NULL,
  time_of_day TIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dedup do cron-check-events.php (roda a cada 1 min via Cron Job da Hostinger, fora do ciclo
-- normal de request HTTP) — chave única garante que o mesmo horário nunca é despachado duas
-- vezes no mesmo dia, mesmo se o cron rodar mais de uma vez por engano.
CREATE TABLE IF NOT EXISTS event_schedule_deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_schedule_id INT NOT NULL,
  delivery_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY event_date (event_schedule_id, delivery_date),
  FOREIGN KEY (event_schedule_id) REFERENCES event_schedule(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Som customizado por tipo de alerta (upload do admin) — filename NULL usa o bipe padrão
-- sintetizado. Pré-semeada com as 3 linhas pra não precisar tratar "linha ainda não existe".
CREATE TABLE IF NOT EXISTS alert_sounds (
  alert_type VARCHAR(20) NOT NULL PRIMARY KEY,
  filename VARCHAR(255) NULL,
  volume DECIMAL(3,2) NOT NULL DEFAULT 0.90
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO alert_sounds (alert_type, filename, volume) VALUES
  ('tg', NULL, 0.90), ('worldboss', NULL, 0.90), ('watchdog', NULL, 0.90);
