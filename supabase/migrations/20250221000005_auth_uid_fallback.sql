-- Workaround: auth.uid() kan vara null i RLS-kontext trots giltig Bearer JWT (känd bugg).
-- Hjälpfunktion som försöker auth.uid() och sedan JWT-claim 'sub' från request.
create or replace function public.current_user_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    auth.uid(),
    nullif(trim(current_setting('request.jwt.claim.sub', true)), '')::uuid,
    (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
  )
$$;

-- Uppdatera trigger så owner_id sätts från current_user_id()
create or replace function public.set_list_owner()
returns trigger as $$
begin
  new.owner_id := coalesce(new.owner_id, public.current_user_id());
  return new;
end;
$$ language plpgsql security definer;

-- Uppdatera RLS: tillåt insert när användaren är inloggad; triggern sätter owner_id.
drop policy if exists "lists_insert" on public.lists;
create policy "lists_insert" on public.lists
  for insert with check (public.current_user_id() is not null);
