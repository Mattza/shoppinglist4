-- Optional custom color per category (hex, e.g. #0891b2)
alter table public.categories add column if not exists color text;
