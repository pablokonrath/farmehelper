-- Fecha o pivô pra uso individual (só a sua conta) na hostinger: apaga as contas/dados de
-- outros jogadores e derruba as tabelas das features de grupo removidas do código (ranking,
-- lista de desejos, painel de líder, "Ao vivo", presença online, admin de usuários).
--
-- *** IRREVERSÍVEL. FAÇA UM BACKUP COMPLETO ANTES: phpMyAdmin → banco → aba "Exportar". ***
--
-- Antes de rodar:
--   1. Confirme que o deploy do código (git push) já subiu — senão o site antigo ainda espera
--      tabelas que este script vai derrubar.
--   2. Troque 'PREENCHER_SEU_USERNAME_AQUI' abaixo pelo SEU usuário de login exato.
-- Rode via phpMyAdmin, aba SQL, um bloco de cada vez (mais fácil de conferir o resultado).

-- 1) Apaga todas as contas exceto a sua. Graças ao ON DELETE CASCADE já existente nas tabelas
--    por-usuário, isso sozinho já limpa item_prices, rush_history, tracked_keywords,
--    app_settings, dg_sessions, manual_drops, alert_settings, telegram_link_codes,
--    alert_history, drop_counts, drop_counts_daily, tracked_drop_counts_daily, live_drops,
--    integrity_flags, admin_action_log, wishlist_items, wishlist_matches, wishlist_offers —
--    tudo que pertencia às outras contas.
DELETE FROM users WHERE username <> 'PREENCHER_SEU_USERNAME_AQUI';

-- 2) Tabelas sem user_id (não pegam o CASCADE acima) — esvazia antes de dropar.
DELETE FROM guilds;
DELETE FROM ranking_items;

-- 3) Dropa de vez as tabelas das features removidas do código (nada mais escreve nelas).
DROP TABLE IF EXISTS
  live_drops,
  wishlist_items,
  wishlist_matches,
  wishlist_offers,
  ranking_items,
  guilds,
  integrity_flags,
  admin_action_log,
  drop_counts,
  drop_counts_daily;

-- 4) Colunas que o código parou de usar (push/OneSignal e o relay de Telegram da lista de
--    desejos, que saiu junto com a lista de desejos).
ALTER TABLE alert_settings
  DROP COLUMN push_enabled,
  DROP COLUMN telegram_wishlist_relay_enabled;

-- 5) Checagem manual (não automatizada): rode "SHOW TABLES LIKE '%backup%';" — uma migração
--    antiga (migrate_personal_item_prices.sql) pode ter deixado uma tabela
--    "item_prices_shared_backup" pra trás. Se existir e você já confirmou que os preços atuais
--    (por-usuário) estão certos, pode apagar com DROP TABLE item_prices_shared_backup;
