-- Anotação livre por sessão de farme ("lag", "testando build", "evento 2x"). Existe pra explicar
-- uma sessão fora do padrão sem precisar EXCLUIR ela — excluir apagaria farme que aconteceu de
-- verdade, e era o único remédio que o app oferecia antes.
--
-- Rode via phpMyAdmin (aba SQL) num banco já em produção — instalação nova do zero não precisa,
-- já vem no sql/schema.sql.

ALTER TABLE dg_sessions
  ADD COLUMN note VARCHAR(120) NULL;
