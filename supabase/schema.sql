-- Ejecutar en Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  integration_year integer not null,
  sequence_number integer not null,
  description text not null,
  client text not null,
  responsible text not null,
  family text,
  subfamily text,
  subsubfamily text, -- legado histórico; ya no se usa para registros nuevos
  classification_code text,
  classification_name text,
  subclassification_code text,
  subclassification_name text,
  notes text,
  classification_confidence integer,
  classification_source text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  backup_status text not null default 'pending' check (backup_status in ('pending','ok','error')),
  backup_at timestamptz,
  backup_error text,
  unique(integration_year, sequence_number)
);

create table if not exists public.integration_audit (
  audit_id bigserial primary key,
  integration_id uuid not null,
  action text not null,
  snapshot jsonb not null,
  actor uuid,
  created_at timestamptz not null default now()
);

-- La tabla de auditoría es append-only para usuarios normales.
alter table public.integrations enable row level security;
alter table public.integration_audit enable row level security;

create policy "authenticated can read integrations" on public.integrations for select to authenticated using (true);
create policy "authenticated can insert integrations" on public.integrations for insert to authenticated with check (true);
create policy "authenticated can update integrations" on public.integrations for update to authenticated using (true) with check (true);
create policy "authenticated can read audit" on public.integration_audit for select to authenticated using (true);

create or replace function public.preview_next_integration_code()
returns text
language plpgsql
security definer
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  select coalesce(max(sequence_number),0) + 1 into n from public.integrations where integration_year = y;
  return 'INT_' || lpad(n::text,3,'0') || '-' || right(y::text,2);
end;
$$;

create or replace function public.create_integration(p_data jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  y int := extract(year from now())::int;
  n int;
  c text;
  rec public.integrations;
begin
  perform pg_advisory_xact_lock(y);
  select coalesce(max(sequence_number),0) + 1 into n from public.integrations where integration_year = y;
  c := 'INT_' || lpad(n::text,3,'0') || '-' || right(y::text,2);

  insert into public.integrations(
    code,integration_year,sequence_number,description,client,responsible,
    classification_code,classification_name,subclassification_code,subclassification_name,
    notes,created_by
  )
  values(
    c,y,n,p_data->>'description',p_data->>'client',p_data->>'responsible',
    nullif(p_data->>'classification_code',''),
    nullif(p_data->>'classification_name',''),
    nullif(p_data->>'subclassification_code',''),
    nullif(p_data->>'subclassification_name',''),
    nullif(p_data->>'notes',''),auth.uid()
  )
  returning * into rec;

  insert into public.integration_audit(integration_id,action,snapshot,actor)
  values(rec.id,'CREATE',to_jsonb(rec),auth.uid());

  -- Llamar Edge Function de respaldo mediante Database Webhook configurado en Supabase.
  return to_jsonb(rec);
end;
$$;

grant execute on function public.preview_next_integration_code() to authenticated, anon;
grant execute on function public.create_integration(jsonb) to authenticated, anon;


-- Compatibilidad si la tabla ya fue creada antes de esta versión
alter table public.integrations add column if not exists classification_confidence integer;
alter table public.integrations add column if not exists classification_source text;


-- V2.7: clasificación corporativa manual.
-- Se conservan family/subfamily/subsubfamily como datos históricos, pero la aplicación ya no los usa.
alter table public.integrations add column if not exists classification_code text;
alter table public.integrations add column if not exists classification_name text;
alter table public.integrations add column if not exists subclassification_code text;
alter table public.integrations add column if not exists subclassification_name text;
