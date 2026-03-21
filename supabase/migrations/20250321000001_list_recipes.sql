-- Recept per lista med poäng 0–5 (för veckomeny och viktning)

create table if not exists public.list_recipes (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  name text not null,
  name_normalized text generated always as (lower(trim(name))) stored,
  score smallint not null default 3 check (score >= 0 and score <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (list_id, name_normalized)
);

create index if not exists idx_list_recipes_list_id on public.list_recipes(list_id);

drop trigger if exists list_recipes_updated_at on public.list_recipes;
create trigger list_recipes_updated_at
  before update on public.list_recipes
  for each row execute function public.set_updated_at();

alter table public.list_recipes enable row level security;

create policy "list_recipes_select" on public.list_recipes
  for select using (public.is_list_member(list_id));

create policy "list_recipes_insert" on public.list_recipes
  for insert with check (public.is_list_member(list_id));

create policy "list_recipes_update" on public.list_recipes
  for update using (public.is_list_member(list_id))
  with check (public.is_list_member(list_id));

create policy "list_recipes_delete" on public.list_recipes
  for delete using (public.is_list_member(list_id));

-- Atomisk justering: ny rad utgår från bas 3; befintlig rad adderar delta; noll = sätt till 0
create or replace function public.adjust_list_recipe_score(
  p_list_id uuid,
  p_name text,
  p_delta smallint,
  p_set_zero boolean default false
)
returns table (recipe_name text, recipe_score smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trim text := trim(p_name);
  v_row public.list_recipes%rowtype;
  v_new_score smallint;
begin
  if auth.uid() is null or not public.is_list_member(p_list_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_trim = '' then
    raise exception 'name required';
  end if;

  if not p_set_zero and (p_delta is null or p_delta not in (-2, -1, 1, 2)) then
    raise exception 'invalid delta';
  end if;

  select * into v_row from public.list_recipes
  where list_id = p_list_id and name_normalized = lower(v_trim);

  if p_set_zero then
    insert into public.list_recipes (list_id, name, score, created_by)
    values (p_list_id, v_trim, 0, auth.uid())
    on conflict (list_id, name_normalized) do update
    set score = 0, updated_at = now();
  elsif found then
    v_new_score := greatest(0, least(5, v_row.score + p_delta));
    update public.list_recipes
    set score = v_new_score, updated_at = now()
    where id = v_row.id;
  else
    v_new_score := greatest(0, least(5, 3 + coalesce(p_delta, 0)));
    insert into public.list_recipes (list_id, name, score, created_by)
    values (p_list_id, v_trim, v_new_score, auth.uid());
  end if;

  return query
  select lr.name as recipe_name, lr.score as recipe_score
  from public.list_recipes lr
  where lr.list_id = p_list_id and lr.name_normalized = lower(v_trim);
end;
$$;

grant execute on function public.adjust_list_recipe_score(uuid, text, smallint, boolean) to authenticated;
