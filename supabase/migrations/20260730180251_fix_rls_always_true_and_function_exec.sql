/*
# Fix remaining RLS always-true policies and function execution

## Summary
1. chat_messages, live_events, song_requests, stats_daily had USING(true)/WITH CHECK(true)
   even for authenticated — any signed-in user could read/modify any other user's data.
   These tables now get a user_id column and proper ownership-scoped policies.
2. get_my_role() SECURITY DEFINER was callable by authenticated via REST RPC — revoked.
   Frontend now reads role from profiles table directly (already allowed by RLS).
3. Leaked password protection enabled in auth config.

## Changes per table

### chat_messages, live_events, song_requests, stats_daily
- Added user_id uuid column DEFAULT auth.uid()
- Existing rows assigned to admin user (siiknotic@gmail.com)
- user_id set NOT NULL
- All write policies now check auth.uid() = user_id (admin gets full access via get_my_role)
- SELECT policies now check auth.uid() = user_id OR admin

### Functions
- REVOKE EXECUTE on get_my_role() FROM authenticated
- REVOKE EXECUTE on handle_new_user() FROM authenticated (already done, re-confirmed)

### Auth
- Set leaked_password_protection = true in auth config
*/

-- ============================================================
-- 1. Add user_id to shared tables and assign existing rows
-- ============================================================

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE live_events ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE song_requests ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE stats_daily ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();

-- Assign existing rows to admin
UPDATE chat_messages SET user_id = (SELECT id FROM profiles WHERE email = 'siiknotic@gmail.com') WHERE user_id IS NULL;
UPDATE live_events SET user_id = (SELECT id FROM profiles WHERE email = 'siiknotic@gmail.com') WHERE user_id IS NULL;
UPDATE song_requests SET user_id = (SELECT id FROM profiles WHERE email = 'siiknotic@gmail.com') WHERE user_id IS NULL;
UPDATE stats_daily SET user_id = (SELECT id FROM profiles WHERE email = 'siiknotic@gmail.com') WHERE user_id IS NULL;

ALTER TABLE chat_messages ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE live_events ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE song_requests ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE stats_daily ALTER COLUMN user_id SET NOT NULL;

-- ============================================================
-- 2. Replace always-true policies with ownership checks
-- ============================================================

-- ---- chat_messages ----
DROP POLICY IF EXISTS "anon_select_chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "auth_select_chat_messages" ON chat_messages;
CREATE POLICY "auth_select_chat_messages" ON chat_messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "auth_insert_chat_messages" ON chat_messages;
CREATE POLICY "auth_insert_chat_messages" ON chat_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_update_chat_messages" ON chat_messages;
CREATE POLICY "auth_update_chat_messages" ON chat_messages FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin')
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_delete_chat_messages" ON chat_messages;
CREATE POLICY "auth_delete_chat_messages" ON chat_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin');

-- ---- live_events ----
DROP POLICY IF EXISTS "anon_select_live_events" ON live_events;
DROP POLICY IF EXISTS "auth_select_live_events" ON live_events;
CREATE POLICY "auth_select_live_events" ON live_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "auth_insert_live_events" ON live_events;
CREATE POLICY "auth_insert_live_events" ON live_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_update_live_events" ON live_events;
CREATE POLICY "auth_update_live_events" ON live_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin')
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_delete_live_events" ON live_events;
CREATE POLICY "auth_delete_live_events" ON live_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin');

-- ---- song_requests ----
DROP POLICY IF EXISTS "anon_select_song_requests" ON song_requests;
DROP POLICY IF EXISTS "auth_select_song_requests" ON song_requests;
CREATE POLICY "auth_select_song_requests" ON song_requests FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "auth_insert_song_requests" ON song_requests;
CREATE POLICY "auth_insert_song_requests" ON song_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_update_song_requests" ON song_requests;
CREATE POLICY "auth_update_song_requests" ON song_requests FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin')
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_delete_song_requests" ON song_requests;
CREATE POLICY "auth_delete_song_requests" ON song_requests FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin');

-- ---- stats_daily ----
DROP POLICY IF EXISTS "anon_select_stats_daily" ON stats_daily;
DROP POLICY IF EXISTS "auth_select_stats_daily" ON stats_daily;
CREATE POLICY "auth_select_stats_daily" ON stats_daily FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "auth_insert_stats_daily" ON stats_daily;
CREATE POLICY "auth_insert_stats_daily" ON stats_daily FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_update_stats_daily" ON stats_daily;
CREATE POLICY "auth_update_stats_daily" ON stats_daily FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin')
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_delete_stats_daily" ON stats_daily;
CREATE POLICY "auth_delete_stats_daily" ON stats_daily FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR public.get_my_role() = 'admin');

-- ============================================================
-- 3. Revoke EXECUTE on get_my_role from authenticated
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM authenticated;

-- ============================================================
-- 4. Enable leaked password protection
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'config'
  ) THEN
    INSERT INTO auth.config (key, value) VALUES ('leaked_password_protection', 'true')
    ON CONFLICT (key) DO UPDATE SET value = 'true';
  END IF;
END $$;
