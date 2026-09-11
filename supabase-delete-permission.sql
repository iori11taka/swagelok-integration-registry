-- Habilita eliminación para usuarios autenticados sin afectar Google Sheets.

grant delete on table public.integrations to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integrations'
      and policyname = 'Authenticated users can delete integrations'
  ) then
    create policy "Authenticated users can delete integrations"
      on public.integrations
      for delete
      to authenticated
      using (auth.uid() is not null);
  end if;
end $$;

notify pgrst, 'reload schema';
