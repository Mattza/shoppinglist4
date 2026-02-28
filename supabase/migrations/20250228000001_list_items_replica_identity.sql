-- Fix Realtime DELETE events for list_items and categories
-- Without REPLICA IDENTITY FULL, PostgreSQL only sends the primary key on DELETE,
-- so Supabase Realtime cannot apply the list_id filter and clients don't receive the event.
alter table public.list_items replica identity full;
alter table public.categories replica identity full;
