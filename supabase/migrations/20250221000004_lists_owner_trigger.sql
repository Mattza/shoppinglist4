-- Sätt owner_id från auth.uid() vid insert så RLS alltid har rätt värde
-- (klienten behöver inte skicka owner_id)
create or replace function public.set_list_owner()
returns trigger as $$
begin
  new.owner_id := coalesce(new.owner_id, auth.uid());
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists set_list_owner_trigger on public.lists;
create trigger set_list_owner_trigger
  before insert on public.lists
  for each row execute function public.set_list_owner();
