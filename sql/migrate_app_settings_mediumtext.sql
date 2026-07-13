-- CORREÇÃO DE PERDA DE DADOS: setting_value era TEXT (máx. 64 KB). Configs que crescem — o
-- histórico de Sessões de DG (dgSessions, com a lista de itens de cada sessão), salesLog e
-- priceHistory — podiam passar de 64 KB e ser TRUNCADAS no save; aí no próximo login o JSON
-- cortado não abria e virava vazio (perda total do histórico). MEDIUMTEXT vai até 16 MB.
-- Rode no phpMyAdmin (aba SQL). Não altera nenhum dado existente, só amplia a coluna.

ALTER TABLE app_settings MODIFY setting_value MEDIUMTEXT NOT NULL;
