-- V2.7 - Nuevo catálogo manual de Clasificación / Subclasificación
-- Ejecutar UNA VEZ en Supabase SQL Editor antes de usar la V2.7.
-- No borra ni modifica family/subfamily/subsubfamily: se conservan como histórico.

alter table public.integrations
  add column if not exists classification_code text,
  add column if not exists classification_name text,
  add column if not exists subclassification_code text,
  add column if not exists subclassification_name text;

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
    classification_code,
    classification_name,
    subclassification_code,
    subclassification_name,
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
    nullif(p_data->>'classification_code', ''),
    nullif(p_data->>'classification_name', ''),
    nullif(p_data->>'subclassification_code', ''),
    nullif(p_data->>'subclassification_name', ''),
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

-- Permisos para que los usuarios autenticados puedan completar la nueva
-- clasificación en registros históricos mediante el modal Editar.
grant select, insert, update on table public.integrations to authenticated;
