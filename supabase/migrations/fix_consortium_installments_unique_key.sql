-- O extrato de consórcio pode ter mais de um evento no mesmo mês/parcela pra uma
-- mesma cota (ex.: "RECBTO. LANCE EMBUTIDO" e "PAGTO BEM LANCE EMBUTIDO" no mesmo
-- vencimento, ambos com Parcela "000") — distinguidos só pela coluna "Transação".
-- A chave de dedupe original (consortium_id, due_date, installment_number) não dava
-- conta disso e quebrava a importação com "duplicate key value violates unique
-- constraint" assim que o extrato tinha um desses eventos especiais.
drop index if exists public.idx_consortium_installments_unique;

create unique index if not exists idx_consortium_installments_unique
  on public.consortium_installments (consortium_id, due_date, installment_number, transaction_kind);
