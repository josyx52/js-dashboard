-- Historico de atividades (conclusoes), guardado pela app: o Todoist so da
-- o registo de atividade dos ultimos dias no plano gratuito, e a lista de
-- concluidas nao inclui as repeticoes da rotina. O sync junta tudo aqui.
create table if not exists activity_log (
  id text primary key,              -- id do evento na origem (ou task_id:data)
  source text not null check (source in ('todoist', 'ticktick')),
  task_id text not null,
  content text not null,
  project_id text,
  project_name text,
  recurring boolean not null default false,
  completed_at timestamptz not null
);
create index if not exists activity_log_completed_idx on activity_log (completed_at desc);
create index if not exists activity_log_task_idx on activity_log (task_id, completed_at desc);
alter table activity_log enable row level security;

-- Eventos do Google Calendar (passados e proximos) para os graficos da agenda.
create table if not exists calendar_events (
  id text primary key,
  summary text not null,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean not null default false,
  date date not null,               -- dia local do inicio
  updated_at timestamptz not null default now()
);
create index if not exists calendar_events_date_idx on calendar_events (date);
alter table calendar_events enable row level security;
