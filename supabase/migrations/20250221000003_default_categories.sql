-- Default-kategorier skapas vid skapande av lista (trigger)
-- Ordning: Frukt och grönt, Bröd, Kött, Mejeri, Frysvaror, Hem och hushåll, Övrigt

create or replace function public.create_default_categories_for_list()
returns trigger as $$
declare
  names text[] := array[
    'Frukt och grönt', 'Bröd', 'Kött', 'Mejeri', 'Frysvaror', 'Hem och hushåll', 'Övrigt'
  ];
  i int;
begin
  for i in 1..array_length(names, 1) loop
    insert into public.categories (list_id, name, sort_order)
    values (new.id, names[i], i);
  end loop;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists create_default_categories on public.lists;
create trigger create_default_categories
  after insert on public.lists
  for each row execute function public.create_default_categories_for_list();

-- När en lista skapas ska ägaren också läggas i list_members
create or replace function public.add_owner_as_member()
returns trigger as $$
begin
  insert into public.list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (list_id, user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists add_owner_as_member_trigger on public.lists;
create trigger add_owner_as_member_trigger
  after insert on public.lists
  for each row execute function public.add_owner_as_member();
