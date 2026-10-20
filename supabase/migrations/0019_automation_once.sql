-- Automacoes de uma so vez (como o "once" do Lachesis no Jarvis): "daqui a 1 hora
-- verifica...", "na sexta as 9h analisa...". Correm em run_at e desligam-se.
alter table holiday_automations add column if not exists run_at timestamptz;
alter table holiday_automations drop constraint if exists holiday_automations_trigger_check;
alter table holiday_automations add constraint holiday_automations_trigger_check check (trigger in ('horario', 'evento', 'uma_vez'));
