-- Holiday: agente com ciclo snapshot -> regras -> problemas -> raciocinio -> acoes
-- (mesma estrutura do Jarvis). So o servidor acede (RLS sem policies).

create table if not exists holiday_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  role text not null check (role in ('user', 'assistant', 'briefing')),
  content text not null,
  problems jsonb,               -- problemas detetados pelas regras nesse momento
  briefing_date date unique     -- so preenchido nos briefings (1 por dia)
);
alter table holiday_messages enable row level security;

create table if not exists holiday_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid references holiday_messages(id) on delete set null,
  type text not null,
  params jsonb not null default '{}',
  risk text not null check (risk in ('low', 'high')),
  status text not null check (status in ('proposed', 'executed', 'rejected', 'failed')),
  reason text,                  -- porque o Holiday propos a acao
  summary text,                 -- descricao legivel ("Concluir: Biblia 10-15 min")
  result text,                  -- resultado ou erro da execucao
  decided_at timestamptz
);
alter table holiday_actions enable row level security;
create index if not exists holiday_actions_status_idx on holiday_actions (status, created_at desc);
