-- Tabela de agendamentos de relatórios por e-mail (diário/semanal/mensal)
create table if not exists public.report_schedules (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id),
  report_type text not null default 'contas_a_pagar',
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  day_of_week smallint,   -- 0=domingo..6=sábado, usado só quando frequency='weekly'
  day_of_month smallint,  -- 1-31, usado só quando frequency='monthly'
  recipients text not null, -- e-mails separados por vírgula
  active boolean not null default true,
  last_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz default now()
);

grant all on public.report_schedules to anon, authenticated, service_role;
alter table public.report_schedules enable row level security;

drop policy if exists "Allow all operations" on public.report_schedules;
create policy "Allow all operations" on public.report_schedules for all using (true) with check (true);
