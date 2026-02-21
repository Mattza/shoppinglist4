-- Handlarlista: tabeller enligt TECHNICAL_SOLUTION.md
-- Körandes i Supabase SQL Editor eller via supabase db push

-- Listor (ägare från auth.users)
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Medlemskap (ägare + inbjudna)
create table if not exists public.list_members (
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  primary key (list_id, user_id)
);

-- Kategorier per lista
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (list_id, name)
);

-- Varor på listan
create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Arkiv: en rad per borttagen vara (datum viktigt, ingen gruppering)
create table if not exists public.archived_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category_name text,
  archived_at timestamptz not null default now()
);

-- Rekommendationsprofil (per användare, eventuellt per lista)
create table if not exists public.recommendation_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid references public.lists(id) on delete cascade,
  profile_snapshot text,
  updated_at timestamptz not null default now(),
  unique (user_id, list_id)
);

-- Feedback för rekommendationer (historik)
create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  recommendation_text text,
  user_feedback text,
  created_at timestamptz not null default now()
);

-- Index för snabba frågor
create index if not exists idx_list_items_list_id on public.list_items(list_id);
create index if not exists idx_list_items_category_id on public.list_items(category_id);
create index if not exists idx_categories_list_id on public.categories(list_id);
create index if not exists idx_archived_items_list_user on public.archived_items(list_id, user_id);
create index if not exists idx_list_members_user_id on public.list_members(user_id);

-- Uppdatera updated_at på lists
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists lists_updated_at on public.lists;
create trigger lists_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

drop trigger if exists list_items_updated_at on public.list_items;
create trigger list_items_updated_at
  before update on public.list_items
  for each row execute function public.set_updated_at();

-- Realtime: aktivera för list_items och categories (ignorera om redan med)
do $$
begin
  alter publication supabase_realtime add table public.list_items;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.categories;
exception
  when duplicate_object then null;
end $$;
