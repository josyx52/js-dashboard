-- Aplicado em producao a 18/10/2026, depois do deploy da versao com login.
--
-- Fecha o acesso anonimo. A anon key estava no bundle publico e as policies
-- "open access" (0002) deixavam qualquer pessoa ler e alterar tudo. As
-- policies passam a valer so para service_role (o servidor); anon e
-- authenticated ficam sem acesso. daily_steps e sync_state (0009) nao tem
-- policies nenhumas.
alter policy "open access" on tasks_cache to service_role;
alter policy "open access" on integrations to service_role;
alter policy "open access" on integration_tools to service_role;
alter policy "open access" on nutrition_logs to service_role;
alter policy "open access" on body_composition to service_role;
alter policy "open access" on agent_messages to service_role;
alter policy "open access" on delegations to service_role;
alter policy "open access" on agenda_cache to service_role;
alter policy "open access" on user_profile to service_role;
