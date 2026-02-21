-- RLS: endast medlemmar i en lista får läsa/skriva listans data

alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.categories enable row level security;
alter table public.list_items enable row level security;
alter table public.archived_items enable row level security;
alter table public.recommendation_profiles enable row level security;
alter table public.recommendation_feedback enable row level security;

-- Hjälpfunktion: är användaren medlem i listan?
create or replace function public.is_list_member(list_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.list_members
    where list_members.list_id = is_list_member.list_id
    and list_members.user_id = auth.uid()
  );
$$ language sql security definer stable;

-- lists: läsa om man är medlem; skapa som inloggad; uppdatera/radera om owner
create policy "lists_select" on public.lists
  for select using (public.is_list_member(id));

create policy "lists_insert" on public.lists
  for insert with check (auth.uid() = owner_id);

create policy "lists_update" on public.lists
  for update using (auth.uid() = owner_id);

create policy "lists_delete" on public.lists
  for delete using (auth.uid() = owner_id);

-- list_members: läsa om man är medlem i listan; insert/delete för medlemmar (owner bjuder in)
create policy "list_members_select" on public.list_members
  for select using (public.is_list_member(list_id));

create policy "list_members_insert" on public.list_members
  for insert with check (public.is_list_member(list_id));

create policy "list_members_delete" on public.list_members
  for delete using (
    public.is_list_member(list_id) and (auth.uid() = user_id or exists (select 1 from public.lists l where l.id = list_id and l.owner_id = auth.uid()))
  );

-- categories: medlemmar får allt
create policy "categories_all" on public.categories
  for all using (public.is_list_member(list_id))
  with check (public.is_list_member(list_id));

-- list_items: medlemmar får allt
create policy "list_items_all" on public.list_items
  for all using (public.is_list_member(list_id))
  with check (public.is_list_member(list_id));

-- archived_items: medlemmar får allt
create policy "archived_items_all" on public.archived_items
  for all using (public.is_list_member(list_id))
  with check (public.is_list_member(list_id));

-- recommendation_profiles: egen profil för användaren
create policy "recommendation_profiles_select" on public.recommendation_profiles
  for select using (auth.uid() = user_id);

create policy "recommendation_profiles_insert" on public.recommendation_profiles
  for insert with check (auth.uid() = user_id);

create policy "recommendation_profiles_update" on public.recommendation_profiles
  for update using (auth.uid() = user_id);

create policy "recommendation_profiles_delete" on public.recommendation_profiles
  for delete using (auth.uid() = user_id);

-- recommendation_feedback: medlem i listan
create policy "recommendation_feedback_all" on public.recommendation_feedback
  for all using (
    auth.uid() = user_id and public.is_list_member(list_id)
  )
  with check (auth.uid() = user_id and public.is_list_member(list_id));
