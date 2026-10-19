-- Automacoes por evento (como o SolutionEngine do Jarvis): disparam quando as
-- regras detetam uma situacao, dentro dos dias marcados e a partir da hora
-- indicada, no maximo uma vez a cada cooldown_hours.
alter table holiday_automations add column if not exists trigger text not null default 'horario' check (trigger in ('horario', 'evento'));
alter table holiday_automations add column if not exists event text;
alter table holiday_automations add column if not exists cooldown_hours int not null default 24 check (cooldown_hours between 1 and 168);
