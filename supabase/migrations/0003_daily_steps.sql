create table if not exists daily_steps (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  steps integer not null,
  source text not null default 'tasker',
  updated_at timestamptz not null default now()
);

alter table daily_steps enable row level security;
create policy "open access" on daily_steps for all using (true) with check (true);
