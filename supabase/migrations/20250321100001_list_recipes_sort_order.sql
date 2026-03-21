-- Ordning för recept (manuell rankning i UI)

alter table public.list_recipes
  add column if not exists sort_order integer;

update public.list_recipes lr
set sort_order = o.ord
from (
  select id, row_number() over (partition by list_id order by name) - 1 as ord
  from public.list_recipes
) o
where lr.id = o.id and lr.sort_order is null;

alter table public.list_recipes
  alter column sort_order set not null;

alter table public.list_recipes
  alter column sort_order set default 0;

create or replace function public.list_recipes_assign_sort_order()
returns trigger as $$
begin
  new.sort_order := (
    select coalesce(max(sort_order), -1) + 1
    from public.list_recipes
    where list_id = new.list_id
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists list_recipes_assign_sort_order on public.list_recipes;
create trigger list_recipes_assign_sort_order
  before insert on public.list_recipes
  for each row execute function public.list_recipes_assign_sort_order();

create or replace function public.reorder_list_recipes(p_list_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  n int;
begin
  if auth.uid() is null or not public.is_list_member(p_list_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  n := coalesce(array_length(p_ordered_ids, 1), 0);
  if n = 0 then
    return;
  end if;
  for i in 1..n loop
    update public.list_recipes
    set sort_order = i - 1, updated_at = now()
    where id = p_ordered_ids[i] and list_id = p_list_id;
    if not found then
      raise exception 'invalid recipe id';
    end if;
  end loop;
end;
$$;

grant execute on function public.reorder_list_recipes(uuid, uuid[]) to authenticated;
