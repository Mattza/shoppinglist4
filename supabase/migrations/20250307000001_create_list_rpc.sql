-- Create list via RPC so auth.uid() is available (JWT not exposed in RLS context).
-- Function runs as SECURITY DEFINER and enforces current user as owner.
create or replace function public.create_list(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  new_id uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.lists (name, owner_id)
  values (p_name, uid)
  returning id into new_id;
  return (
    select to_jsonb(r) from (
      select id, slug from public.lists where id = new_id
    ) r
  );
end;
$$;

grant execute on function public.create_list(text) to authenticated;
