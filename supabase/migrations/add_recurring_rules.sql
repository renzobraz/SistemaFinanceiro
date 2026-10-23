-- Recorrência "sem data de fim": diferente do "Repetir? + Quantidade de Parcelas" (que gera N
-- lançamentos de uma vez na criação), esta tabela guarda a regra e o cron diário
-- (/api/cron/generate-recurring) gera só a PRÓXIMA ocorrência quando chega a data, indefinidamente,
-- até o usuário pausar (active=false) ou excluir a regra.
create table if not exists public.recurring_rules (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id),
  wallet_id uuid references public.wallets(id),
  bank_id uuid not null references public.banks(id),
  category_id uuid not null references public.categories(id),
  cost_center_id uuid references public.cost_centers(id),
  participant_id uuid references public.participants(id),
  description text not null,
  value numeric(14,2) not null,
  type text not null check (type in ('CREDIT','DEBIT')),
  frequency text not null check (frequency in ('WEEKLY','MONTHLY','YEARLY')),
  next_date date not null,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz default now(),
  last_generated_at timestamptz
);

grant all on public.recurring_rules to anon, authenticated, service_role;
alter table public.recurring_rules enable row level security;

drop policy if exists "Allow all operations" on public.recurring_rules;
create policy "Allow all operations" on public.recurring_rules for all using (true) with check (true);

-- Marca lançamentos gerados automaticamente por uma regra recorrente (evita duplicidade se o
-- cron rodar mais de uma vez para a mesma regra/dia, e permite rastrear a origem).
alter table transactions add column if not exists recurring_rule_id uuid references public.recurring_rules(id);
create unique index if not exists idx_transactions_recurring_rule_unique
  on transactions (recurring_rule_id, date)
  where recurring_rule_id is not null;
