-- Garantir que a extensao Vault esta ativa (normalmente ja vem ativada por defeito)
create extension if not exists supabase_vault;

-- Nova coluna: referencia para o segredo no Vault, em vez do texto direto.
-- api_key_encrypted fica como legado (nao usado em novas integracoes).
alter table integrations add column if not exists api_key_vault_id uuid;

-- Funcoes wrapper (SECURITY DEFINER), so chamaveis pelo backend (service_role).
-- Nunca pelo cliente diretamente — e por isso que revogamos o acesso a
-- anon/authenticated no fim.
create or replace function create_integration_secret(secret text, secret_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  new_id := vault.create_secret(secret, coalesce(secret_name, gen_random_uuid()::text));
  return new_id;
end;
$$;

create or replace function read_integration_secret(vault_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  select decrypted_secret into result from vault.decrypted_secrets where id = vault_id;
  return result;
end;
$$;

create or replace function update_integration_secret(vault_id uuid, new_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform vault.update_secret(vault_id, new_secret);
end;
$$;

revoke execute on function create_integration_secret(text, text) from public, anon, authenticated;
revoke execute on function read_integration_secret(uuid) from public, anon, authenticated;
revoke execute on function update_integration_secret(uuid, text) from public, anon, authenticated;
grant execute on function create_integration_secret(text, text) to service_role;
grant execute on function read_integration_secret(uuid) to service_role;
grant execute on function update_integration_secret(uuid, text) to service_role;
