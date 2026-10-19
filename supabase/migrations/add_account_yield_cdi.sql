-- Rendimento diário automático de conta (conta remunerada, ex: Mercado Pago/Nubank) em % do CDI.
-- A conta é marcada com yield_enabled + yield_cdi_percent, e o cron diário
-- (/api/cron/apply-account-yield) calcula o rendimento do dia anterior sobre o saldo
-- do dia anterior a esse, usando a taxa CDI diária publicada pelo Banco Central (SGS série 12).
ALTER TABLE banks ADD COLUMN IF NOT EXISTS yield_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE banks ADD COLUMN IF NOT EXISTS yield_cdi_percent numeric(6,2);
ALTER TABLE banks ADD COLUMN IF NOT EXISTS yield_category_id uuid REFERENCES categories(id);
ALTER TABLE banks ADD COLUMN IF NOT EXISTS yield_cost_center_id uuid REFERENCES cost_centers(id);
ALTER TABLE banks ADD COLUMN IF NOT EXISTS yield_participant_id uuid REFERENCES participants(id);

-- Marca lançamentos gerados automaticamente pelo cron de rendimento (data do dia que rendeu).
-- O índice único impede duplicidade caso o cron rode mais de uma vez para o mesmo dia/conta.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS auto_yield_date date;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_auto_yield_unique
  ON transactions (bank_id, auto_yield_date)
  WHERE auto_yield_date IS NOT NULL;
