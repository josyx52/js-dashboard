-- Tarefas recorrentes (Todoist due.is_recurring / TickTick repeatFlag) contam
-- sempre como "hoje" no dashboard. Preenchido pelo sync.
alter table tasks_cache add column if not exists recurring boolean not null default false;
