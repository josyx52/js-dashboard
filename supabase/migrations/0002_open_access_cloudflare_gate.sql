-- A autenticacao passa a ser feita pelo Cloudflare Access, a nivel de
-- rede, antes de qualquer pedido chegar a esta app. Como e uma app
-- pessoal de um so utilizador, o RLS ligado a uma sessao Supabase
-- deixa de fazer sentido — troca-se por policies abertas (o acesso
-- real continua protegido, so que a fronteira mudou de sitio).

drop policy if exists "own rows" on tasks_cache;
drop policy if exists "own rows" on integrations;
drop policy if exists "own rows" on nutrition_logs;
drop policy if exists "own rows" on body_composition;
drop policy if exists "own rows" on agent_messages;
drop policy if exists "own rows" on agenda_cache;
drop policy if exists "via integration" on integration_tools;
drop policy if exists "via task" on delegations;

create policy "open access" on tasks_cache for all using (true) with check (true);
create policy "open access" on integrations for all using (true) with check (true);
create policy "open access" on integration_tools for all using (true) with check (true);
create policy "open access" on nutrition_logs for all using (true) with check (true);
create policy "open access" on body_composition for all using (true) with check (true);
create policy "open access" on agent_messages for all using (true) with check (true);
create policy "open access" on delegations for all using (true) with check (true);
create policy "open access" on agenda_cache for all using (true) with check (true);
