alter table user_profile add column if not exists goal text check (goal in ('perder', 'manter', 'ganhar'));
