-- =============================================================================
-- Histórico permanente de drops (snapshot diário)
-- =============================================================================
-- POR QUE ISSO EXISTE
--
-- O log do jogo guarda ~30 dias. Até aqui, AppState.drops era 100% efêmero:
-- relido do arquivo a cada abertura, sem nenhuma tabela por trás. Resultado:
-- todo drop mais velho que a janela do log sumia pra sempre, e a Visão geral
-- mostrava um "Total de farme" silenciosamente incompleto pra qualquer período
-- mais antigo (medido: 17% do valor real num filtro de 180 dias).
--
-- Esta tabela guarda o AGREGADO por dia+item (não o drop individual): poucas
-- centenas de linhas por dia em vez de dezenas de milhares. Guarda só a
-- QUANTIDADE — o valor em Alz continua sendo calculado na hora com o preço
-- atual de item_prices, igual ao resto do app faz hoje (assim o histórico não
-- congela com preços velhos).
--
-- Auto-cura: como o log sempre carrega os últimos ~30 dias, cada sincronização
-- reafirma esse período inteiro via upsert. Um dia só depende exclusivamente
-- desta tabela depois de já ter sido gravado dezenas de vezes.
--
-- COMO RODAR: cole no phpMyAdmin (SQL) do banco do FarmHub. É aditivo — não
-- altera nem apaga nenhuma tabela existente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS drop_snapshots (
  user_id INT NOT NULL,
  drop_date DATE NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, drop_date, item_name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
