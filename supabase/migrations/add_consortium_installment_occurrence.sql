-- Mesmo (cota + vencimento + parcela + transação) não garante linha única: o extrato
-- pode ter duas linhas idênticas em todas as colunas descritivas, diferindo só no
-- valor (ex.: dois "RECBTO. ANTECIPADO" na mesma parcela/data, mesma observação,
-- valores 16.26 e 220.42). A posição de ocorrência (1ª, 2ª, ...) dentro do mesmo
-- grupo de colunas idênticas é o que sobra pra distinguir essas linhas de forma
-- estável entre importação e reimportação.
alter table public.consortium_installments add column if not exists occurrence_index integer not null default 1;

drop index if exists public.idx_consortium_installments_unique;

create unique index if not exists idx_consortium_installments_unique
  on public.consortium_installments (consortium_id, due_date, installment_number, transaction_kind, occurrence_index);
