-- V2.8 - Item Master hierarchy: Category -> Group -> Series
-- Ejecutar UNA VEZ en Supabase SQL Editor.
-- No elimina datos históricos ni las columnas antiguas.

alter table public.integrations
  add column if not exists category_code text,
  add column if not exists category_name text,
  add column if not exists group_code text,
  add column if not exists group_name text,
  add column if not exists series_code text,
  add column if not exists series_name text;

create or replace function public.create_integration(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
  c text;
  rec public.integrations;
begin
  perform pg_advisory_xact_lock(y);

  select coalesce(max(sequence_number), 0) + 1
  into n
  from public.integrations
  where integration_year = y;

  c := 'INT_' || lpad(n::text, 3, '0') || '-' || right(y::text, 2);

  insert into public.integrations(
    code,
    integration_year,
    sequence_number,
    description,
    client,
    responsible,
    category_code,
    category_name,
    group_code,
    group_name,
    series_code,
    series_name,
    notes,
    created_by
  )
  values(
    c,
    y,
    n,
    p_data->>'description',
    p_data->>'client',
    p_data->>'responsible',
    nullif(p_data->>'category_code', ''),
    nullif(p_data->>'category_name', ''),
    nullif(p_data->>'group_code', ''),
    nullif(p_data->>'group_name', ''),
    nullif(p_data->>'series_code', ''),
    nullif(p_data->>'series_name', ''),
    nullif(p_data->>'notes', ''),
    auth.uid()
  )
  returning * into rec;

  insert into public.integration_audit(integration_id, action, snapshot, actor)
  values(rec.id, 'CREATE', to_jsonb(rec), auth.uid());

  return to_jsonb(rec);
end;
$$;

grant execute on function public.create_integration(jsonb) to authenticated;
grant select, insert, update on table public.integrations to authenticated;
