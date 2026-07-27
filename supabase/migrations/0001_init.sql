-- JS Dashboard — migration inicial
create extension if not exists "pgcrypto";

-- Cache local de tarefas (Todoist/TickTick), com pilar e delegabilidade
create table if not exists tasks_cache (
  id text primary key,                 -- id da tarefa na origem (todoist/ticktick)
  user_id uuid not null references auth.users(id),
  source text not null check (source in ('todoist','ticktick')),
  content text not null,
  due date,
  status text not null default 'open' check (status in ('open','done')),
  pillar text check (pillar in ('deus','saude','familia','estudo','negocio','trabalho')),
  delegable boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  connected boolean not null default false,
  api_key_encrypted text,              -- gravar via Supabase Vault; nunca em claro
  description text,
  capabilities jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists integration_tools (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  name text not null,
  description text,
  input_schema jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  label text not null,
  kcal numeric not null,
  type text not null check (type in ('in','out')),
  source text not null check (source in ('foto','manual','treino'))
);

create table if not exists body_composition (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  date date not null,
  weight_kg numeric,
  body_fat_pct numeric,
  lean_mass_kg numeric,
  unique (user_id, date)
);

create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  mode text not null check (mode in ('chat','calculadora','gtd')),
  created_at timestamptz not null default now()
);

create table if not exists delegations (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references tasks_cache(id),
  integration_id uuid not null references integrations(id),
  status text not null default 'em_analise' check (status in ('em_analise','agendado','concluido')),
  created_at timestamptz not null default now()
);

create table if not exists agenda_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  date date not null,
  source_integration_id uuid references integrations(id),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, date, source_integration_id)
);

-- ── RLS ──
alter table tasks_cache enable row level security;
alter table integrations enable row level security;
alter table integration_tools enable row level security;
alter table nutrition_logs enable row level security;
alter table body_composition enable row level security;
alter table agent_messages enable row level security;
alter table delegations enable row level security;
alter table agenda_cache enable row level security;

create policy "own rows" on tasks_cache for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on integrations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on nutrition_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on body_composition for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on agent_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on agenda_cache for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "via integration" on integration_tools for all using (
  exists (select 1 from integrations i where i.id = integration_id and i.user_id = auth.uid())
) with check (
  exists (select 1 from integrations i where i.id = integration_id and i.user_id = auth.uid())
);

create policy "via task" on delegations for all using (
  exists (select 1 from tasks_cache t where t.id = task_id and t.user_id = auth.uid())
) with check (
  exists (select 1 from tasks_cache t where t.id = task_id and t.user_id = auth.uid())
);

-- Indices uteis
create index if not exists idx_tasks_cache_user_pillar on tasks_cache(user_id, pillar);
create index if not exists idx_tasks_cache_user_due on tasks_cache(user_id, due);
create index if not exists idx_nutrition_logs_user_date on nutrition_logs(user_id, created_at);
