-- URL-friendly slug from list name (unique per list)
alter table public.lists add column if not exists slug text;

-- Backfill existing rows: slug = slugify(name) + '-' + first 8 chars of id
update public.lists
set slug = coalesce(
  nullif(trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''),
  'lista'
) || '-' || substr(replace(id::text, '-', ''), 1, 8)
where slug is null;

alter table public.lists alter column slug set not null;
create unique index if not exists idx_lists_slug on public.lists(slug);

-- Set slug on insert and update (so URL reflects current name)
create or replace function public.set_list_slug()
returns trigger as $$
declare
  base text;
begin
  base := coalesce(
    nullif(trim(both '-' from regexp_replace(lower(trim(NEW.name)), '[^a-z0-9]+', '-', 'g')), ''),
    'lista'
  );
  NEW.slug := base || '-' || substr(replace(NEW.id::text, '-', ''), 1, 8);
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists set_list_slug_trigger on public.lists;
create trigger set_list_slug_trigger
  before insert or update of name on public.lists
  for each row execute function public.set_list_slug();
