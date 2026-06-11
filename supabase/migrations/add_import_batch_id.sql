-- Adicionar coluna import_batch_id na tabela transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_batch_id TEXT;

-- Índice para busca rápida por batch
CREATE INDEX IF NOT EXISTS idx_transactions_import_batch_id
ON transactions(import_batch_id)
WHERE import_batch_id IS NOT NULL;
