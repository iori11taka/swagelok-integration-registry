-- V2.9.4: códigos personalizados, sin consumir el correlativo anual.
-- Ejecutar una vez en Supabase SQL Editor. No modifica registros existentes.
create or replace function public.create_custom_integration(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  y integer := extract(year from now())::integer;
  n integer;
  c text := btrim(coalesce(p_data->>'code',''));
  rec public.integrations;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(c) < 2 or char_length(c) > 100 then
    raise exception 'El código personalizado debe tener entre 2 y 100 caracteres';
  end if;
  if c ~ '[[:cntrl:]]' then raise exception 'El código contiene caracteres no permitidos'; end if;
  if nullif(btrim(coalesce(p_data->>'description','')),'') is null then
    raise exception 'La descripción es obligatoria';
  end if;
  if nullif(p_data->>'category_code','') is null or nullif(p_data->>'group_code','') is null or nullif(p_data->>'series_code','') is null then
    raise exception 'Category, Group y Series son obligatorios';
  end if;
  perform pg_advisory_xact_lock(y);
  if exists(select 1 from public.integrations where lower(code)=lower(c)) then
    raise exception 'El código % ya existe', c;
  end if;
  -- Números negativos reservados para personalizados. Los automáticos siguen
  -- calculando MAX(sequence_number)+1, por lo que nunca consumen estos números.
  select least(coalesce(min(sequence_number),0),0)-1 into n
  from public.integrations where integration_year=y;
  insert into public.integrations (
    code,integration_year,sequence_number,description,client,responsible,
    category_code,category_name,group_code,group_name,series_code,series_name,notes,created_by
  ) values (
    c,y,n,btrim(p_data->>'description'),nullif(p_data->>'client',''),nullif(p_data->>'responsible',''),
    nullif(p_data->>'category_code',''),nullif(p_data->>'category_name',''),
    nullif(p_data->>'group_code',''),nullif(p_data->>'group_name',''),
    nullif(p_data->>'series_code',''),nullif(p_data->>'series_name',''),
    nullif(p_data->>'notes',''),auth.uid()
  ) returning * into rec;
  insert into public.integration_audit(integration_id,action,snapshot,actor)
  values(rec.id,'CREATE',to_jsonb(rec),auth.uid());
  return to_jsonb(rec);
end;
$$;
revoke all on function public.create_custom_integration(jsonb) from public;
grant execute on function public.create_custom_integration(jsonb) to authenticated;
