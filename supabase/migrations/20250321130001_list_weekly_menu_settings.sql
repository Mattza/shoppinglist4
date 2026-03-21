-- Delade veckomeny-inställningar per lista: samma rad för alla medlemmar.
-- - preferences: fritext (Preferenser och kontext i UI)
-- - known_ratio: balans receptbank ↔ nya idéer, 0–100 (samma som reglaget i UI)

create table if not exists public.list_weekly_menu_settings (
  list_id uuid primary key references public.lists(id) on delete cascade,
  preferences text not null default '',
  known_ratio smallint not null default 70
    check (known_ratio >= 0 and known_ratio <= 100),
  updated_at timestamptz not null default now()
);

comment on table public.list_weekly_menu_settings is
  'Veckomeny: delade inställningar per inköpslista (preferenser + balans).';

comment on column public.list_weekly_menu_settings.preferences is
  'Fritext: allergier, tempo, vegetariskt, ingredienser hemma, m.m.';

comment on column public.list_weekly_menu_settings.known_ratio is
  'Balans 0–100: andel måltider som väljs från receptbanken (högre = mer från banken).';

create index if not exists idx_list_weekly_menu_settings_list_id
  on public.list_weekly_menu_settings(list_id);

drop trigger if exists list_weekly_menu_settings_updated_at on public.list_weekly_menu_settings;
create trigger list_weekly_menu_settings_updated_at
  before update on public.list_weekly_menu_settings
  for each row execute function public.set_updated_at();

alter table public.list_weekly_menu_settings enable row level security;

create policy "list_weekly_menu_settings_select" on public.list_weekly_menu_settings
  for select using (public.is_list_member(list_id));

create policy "list_weekly_menu_settings_insert" on public.list_weekly_menu_settings
  for insert with check (public.is_list_member(list_id));

create policy "list_weekly_menu_settings_update" on public.list_weekly_menu_settings
  for update using (public.is_list_member(list_id))
  with check (public.is_list_member(list_id));

create policy "list_weekly_menu_settings_delete" on public.list_weekly_menu_settings
  for delete using (public.is_list_member(list_id));

-- Ny lista: skapa standardrad (efter att ägaren lagts som medlem)
create or replace function public.create_weekly_menu_settings_for_list()
returns trigger as $$
begin
  insert into public.list_weekly_menu_settings (list_id)
  values (new.id)
  on conflict (list_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists create_weekly_menu_settings on public.lists;
create trigger create_weekly_menu_settings
  after insert on public.lists
  for each row execute function public.create_weekly_menu_settings_for_list();

-- Befintliga listor
insert into public.list_weekly_menu_settings (list_id)
select id from public.lists
on conflict (list_id) do nothing;
