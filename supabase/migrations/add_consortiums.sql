-- Consórcios: registro de cada cota (Administradora+Grupo+Cota) e o detalhe
-- financeiro de cada parcela (fundo comum, taxa de administração, fundo de reserva,
-- seguro, multa, juros etc.) vindo do extrato do consórcio — campos que não existem
-- na tabela genérica de transactions e são fundamentais para a contabilidade do
-- usuário, mas não precisam poluir o lançamento em si.
create table if not exists public.consortiums (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id),
  wallet_id uuid references public.wallets(id),
  name text not null,
  administrator text,
  group_number text,
  quota_number text,
  holder_name text,
  holder_cnpj text,
  active boolean not null default true,
  user_id uuid,
  created_at timestamptz default now()
);

grant all on public.consortiums to anon, authenticated, service_role;
alter table public.consortiums enable row level security;

drop policy if exists "Allow all operations" on public.consortiums;
create policy "Allow all operations" on public.consortiums for all using (true) with check (true);

-- Chave real do extrato: evita cadastrar a mesma cota duas vezes na mesma carteira.
-- O importador usa essa combinação para achar (ou criar) o consórcio certo.
create unique index if not exists idx_consortiums_unique_quota
  on public.consortiums (wallet_id, administrator, group_number, quota_number);

-- Detalhe financeiro de cada parcela importada do extrato, 1:1 com um lançamento
-- (transactions). Apagar o lançamento apaga o detalhe junto (cascade).
create table if not exists public.consortium_installments (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  consortium_id uuid not null references public.consortiums(id),
  installment_number text,
  version text,
  transaction_kind text,
  due_date date,
  payment_date date,
  accounting_date date,
  installment_value numeric(14,2),
  paid_value numeric(14,2),
  common_fund numeric(14,2),
  common_fund_pct numeric(8,6),
  admin_fee numeric(14,2),
  admin_fee_pct numeric(8,6),
  reserve_fund numeric(14,2),
  reserve_fund_pct numeric(8,6),
  insurance numeric(14,2),
  fine numeric(14,2),
  interest numeric(14,2),
  other numeric(14,2),
  difference numeric(14,2),
  notes text,
  settled_at date,
  created_at timestamptz default now()
);

grant all on public.consortium_installments to anon, authenticated, service_role;
alter table public.consortium_installments enable row level security;

drop policy if exists "Allow all operations" on public.consortium_installments;
create policy "Allow all operations" on public.consortium_installments for all using (true) with check (true);

-- Evita reimportar a mesma parcela da mesma cota duas vezes — o importador faz
-- upsert por essa chave (atualiza se já existir, ex.: parcela que estava pendente e
-- agora veio com data de pagamento preenchida).
create unique index if not exists idx_consortium_installments_unique
  on public.consortium_installments (consortium_id, due_date, installment_number);

create index if not exists idx_consortium_installments_consortium
  on public.consortium_installments (consortium_id);
