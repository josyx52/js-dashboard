-- Definicoes da app (ex: voz do Holiday escolhida na ElevenLabs).
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
