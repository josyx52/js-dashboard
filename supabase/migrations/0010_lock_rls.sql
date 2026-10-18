-- Aplicar SO DEPOIS do deploy da versao com login (middleware.ts): a versao
-- antiga le o Supabase direto do browser com a anon key e deixa de funcionar.
--
-- Fecha o acesso anonimo. A anon key estava no bundle publico e as policies
-- "open access" (0002) deixavam qualquer pessoa ler e alterar tudo. Com RLS
-- ligado e sem policies, anon/authenticated nao veem nada; o servidor usa a
-- service role (que ignora RLS) e esta protegido pela sessao da app.
drop policy if exists "open access" on tasks_cache;
drop policy if exists "open access" on integrations;
drop policy if exists "open access" on integration_tools;
drop policy if exists "open access" on nutrition_logs;
drop policy if exists "open access" on body_composition;
drop policy if exists "open access" on agent_messages;
drop policy if exists "open access" on delegations;
drop policy if exists "open access" on agenda_cache;
drop policy if exists "open access" on user_profile;
drop policy if exists "open access" on daily_steps;

alter table tasks_cache enable row level security;
alter table integrations enable row level security;
alter table integration_tools enable row level security;
alter table nutrition_logs enable row level security;
alter table body_composition enable row level security;
alter table agent_messages enable row level security;
alter table delegations enable row level security;
alter table agenda_cache enable row level security;
alter table user_profile enable row level security;
