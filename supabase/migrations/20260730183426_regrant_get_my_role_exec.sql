-- Re-grant EXECUTE on get_my_role() to authenticated.
-- This function is used in RLS policies across many tables (profiles, settings,
-- filters, templates, chat_messages, live_events, song_requests, stats_daily,
-- user_licenses, api_secrets). Revoking EXECUTE broke all data access for
-- authenticated users, causing the app to load nothing.
-- The function is SECURITY DEFINER so it runs with owner privileges regardless.
-- The frontend no longer calls it via RPC (reads role from profiles table instead).
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
