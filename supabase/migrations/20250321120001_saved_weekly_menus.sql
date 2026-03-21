-- Sparade veckomenyer (en rad per lista och vecka, måndag = week_start)

create table if not exists public.saved_weekly_menus (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  week_start date not null,
  meals jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint saved_weekly_menus_meals_len check (
    jsonb_typeof(meals) = 'array' and jsonb_array_length(meals) = 7
  ),
  unique (list_id, week_start)
);

create index if not exists idx_saved_weekly_menus_list_week
  on public.saved_weekly_menus (list_id, week_start desc);

drop trigger if exists saved_weekly_menus_updated_at on public.saved_weekly_menus;
create trigger saved_weekly_menus_updated_at
  before update on public.saved_weekly_menus
  for each row execute function public.set_updated_at();

alter table public.saved_weekly_menus enable row level security;

create policy "saved_weekly_menus_select" on public.saved_weekly_menus
  for select using (public.is_list_member(list_id));

create policy "saved_weekly_menus_insert" on public.saved_weekly_menus
  for insert with check (public.is_list_member(list_id));

create policy "saved_weekly_menus_update" on public.saved_weekly_menus
  for update using (public.is_list_member(list_id))
  with check (public.is_list_member(list_id));

create policy "saved_weekly_menus_delete" on public.saved_weekly_menus
  for delete using (public.is_list_member(list_id));
