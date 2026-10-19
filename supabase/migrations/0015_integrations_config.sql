-- Configuracao por integracao (ex: Notion — pagina onde o Holiday cria paginas).
alter table integrations add column if not exists config jsonb not null default '{}'::jsonb;
