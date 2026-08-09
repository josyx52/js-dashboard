create table if not exists user_profile (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  height_cm numeric,
  age integer,
  sex text check (sex in ('m', 'f')),
  updated_at timestamptz not null default now()
);

alter table user_profile enable row level security;
create policy "open access" on user_profile for all using (true) with check (true);
