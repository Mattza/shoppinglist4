-- Lookup auth user id by email (for invite-by-email). GoTrue admin list users does not support filter.
-- Only service_role can call this (used by Edge Functions).
create or replace function public.get_user_id_by_email(user_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where email = lower(trim(user_email)) limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public;
grant execute on function public.get_user_id_by_email(text) to service_role;
