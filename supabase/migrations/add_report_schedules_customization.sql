-- Personalização do relatório agendado: assunto/mensagem customizados,
-- filtros (status/banco/carteira/categoria/centro de custo) e colunas exibidas
alter table public.report_schedules add column if not exists subject text;
alter table public.report_schedules add column if not exists message text;
alter table public.report_schedules add column if not exists filters jsonb not null default '{}'::jsonb;
alter table public.report_schedules add column if not exists columns jsonb not null default '["date","description","value"]'::jsonb;
