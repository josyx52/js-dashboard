-- Pode correr ja (nao parte a versao publicada).

-- 0003 nunca chegou a ser aplicada em producao: criar a tabela de passos
-- (sem policy aberta — so o servidor, com service role, le/escreve).
create table if not exists daily_steps (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  steps integer not null,
  source text not null default 'tasker',
  updated_at timestamptz not null default now()
);
alter table daily_steps enable row level security;
drop policy if exists "open access" on daily_steps;

-- Hora real do ultimo sync (o dashboard mostrava a hora atual).
create table if not exists sync_state (
  id int primary key default 1 check (id = 1),
  last_sync_at timestamptz,
  summary jsonb
);
alter table sync_state enable row level security;
insert into sync_state (id, last_sync_at)
select 1, max(updated_at) from tasks_cache
on conflict (id) do nothing;

-- api_key_encrypted guardava o token em claro e era legivel com a anon key.
-- As chaves vivem no Vault (0005); a coluna legada sai.
alter table integrations drop column if exists api_key_encrypted;

-- Nada de integracoes duplicadas com o mesmo nome (ex: "notion" / "Notion").
create unique index if not exists integrations_user_name_uniq
  on integrations (user_id, lower(btrim(name)));
