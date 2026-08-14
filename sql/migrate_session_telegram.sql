-- Avisos de SESSÃO no Telegram: DG que bateu o limite diário de runs, e sessão encerrada sozinha
-- por falta de drop. Opt-in próprio, separado do relay de drop e do de watchdog — são avisos de
-- natureza diferente (rotina de farme, não alerta de problema) e quem quer um pode não querer o
-- outro.
--
-- Seguro rodar mais de uma vez? NÃO: ALTER TABLE ADD COLUMN falha se a coluna já existir. Se der
-- erro dizendo que a coluna existe, é porque já foi aplicada — pode ignorar.
ALTER TABLE alert_settings
  ADD COLUMN telegram_session_relay_enabled TINYINT(1) NOT NULL DEFAULT 0;
