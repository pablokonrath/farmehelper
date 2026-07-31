-- Adiciona o rótulo de rota nas sessões de DG, pra agrupar farme "de rota" vs avulso no
-- histórico de Sessões de farme. Rode via phpMyAdmin (aba SQL) num banco já em produção —
-- instalação nova do zero não precisa, já vem no sql/schema.sql.

ALTER TABLE dg_sessions
  ADD COLUMN route_id VARCHAR(50) NULL,
  ADD COLUMN route_name VARCHAR(100) NULL;
