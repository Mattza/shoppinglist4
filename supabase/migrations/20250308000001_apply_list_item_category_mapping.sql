-- Single round-trip apply of item_id -> category_id mapping (for AI reorder).
-- Runs as invoker so RLS applies; only updates rows the user can access.
create or replace function public.apply_list_item_category_mapping(
  p_list_id uuid,
  p_mapping jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  cnt integer;
begin
  with updated as (
    update list_items li
    set category_id = (m.elem->>'category_id')::uuid
    from jsonb_array_elements(p_mapping) as m(elem)
    where li.id = (m.elem->>'item_id')::uuid
      and li.list_id = p_list_id
      and li.category_id is distinct from (m.elem->>'category_id')::uuid
    returning 1
  )
  select count(*)::integer into cnt from updated;
  return cnt;
end;
$$;

grant execute on function public.apply_list_item_category_mapping(uuid, jsonb) to authenticated;
grant execute on function public.apply_list_item_category_mapping(uuid, jsonb) to anon;
