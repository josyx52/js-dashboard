-- Automacoes do Holiday: atividades agendadas que ele faz sozinho
-- (lembretes, analises, trabalho em tarefas delegadas). Corridas pelo cron
-- de 15 em 15 minutos; cada execucao fica registada.

create table if not exists holiday_automations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  kind text not null check (kind in ('lembrete', 'analise', 'trabalho')),
  prompt text not null,              -- lembrete: a mensagem; analise/trabalho: o que o Holiday deve fazer
  days int[] not null,               -- 0 = domingo ... 6 = sabado
  time text not null check (time ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'),  -- hora de Lisboa, em passos de 15 min
  active boolean not null default true,
  created_by text not null default 'eu' check (created_by in ('eu', 'holiday')),
  last_run_at timestamptz
);
alter table holiday_automations enable row level security;

create table if not exists holiday_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references holiday_automations(id) on delete cascade,
  ran_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  status text not null check (status in ('ok', 'falhou', 'perdida')),
  result text,
  message_id uuid references holiday_messages(id) on delete set null
);
alter table holiday_automation_runs enable row level security;
create index if not exists holiday_automation_runs_when_idx on holiday_automation_runs (scheduled_for);

-- Mensagens geradas por uma automacao (para o chat mostrar de onde vieram).
alter table holiday_messages add column if not exists automation_id uuid references holiday_automations(id) on delete set null;
