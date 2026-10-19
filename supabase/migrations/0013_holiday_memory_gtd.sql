-- Holiday v2: memoria de longo prazo, historico diario (correlacao/baseline)
-- e GTD conceptual (quem faz cada tarefa: eu ou o Holiday).

-- Longo prazo: factos, preferencias, objetivos e padroes aprendidos.
create table if not exists holiday_memories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('fato', 'preferencia', 'objetivo', 'padrao')),
  area text,
  content text not null,
  importance int not null default 3 check (importance between 1 and 5),
  source text not null default 'conversa' check (source in ('conversa', 'correlacao')),
  active boolean not null default true
);
alter table holiday_memories enable row level security;

-- Historico diario (como o snapshot_history + BaselineEngine do Jarvis):
-- uma linha por dia, atualizada de hora a hora pelo cron.
create table if not exists holiday_daily (
  date date primary key,
  kcal_in int,
  kcal_out int,
  meals int,
  deficit_pct int,
  steps int,
  weight_kg numeric,
  today_pending int,   -- tarefas de hoje (inclui rotina) ainda abertas
  overdue int,
  done_count int,      -- tarefas concluidas nesse dia
  signals text[],      -- ids dos sinais das regras nesse dia (persistencia de problemas)
  updated_at timestamptz not null default now()
);
alter table holiday_daily enable row level security;

-- GTD: dono da tarefa, lista e notas de trabalho do Holiday.
alter table tasks_cache add column if not exists gtd_owner text check (gtd_owner in ('eu', 'holiday'));
alter table tasks_cache add column if not exists gtd_list text check (gtd_list in ('proxima', 'agendada', 'aguardando', 'algum_dia'));
alter table tasks_cache add column if not exists gtd_note text;
