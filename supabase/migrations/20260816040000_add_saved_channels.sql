/*
# Add saved TikTok channels (multi-channel switching, TikFinity-style)

## Summary
Lets each user save TikTok channels/usernames they connect to often, so they
can switch between them with one tap instead of retyping the username.
Free users can save 1 channel; users with an active license (paid) can save
up to 5. The limit is enforced server-side via a trigger so it can't be
bypassed from the client.

## New Table
`saved_channels`
- `id` (uuid, PK)
- `user_id` (uuid, not null, references profiles, cascade delete)
- `username` (text, not null) — TikTok handle, no leading @, stored lowercase
- `display_name` (text, nullable) — optional friendly label the user sets
- `created_at` (timestamptz, default now())
- `last_connected_at` (timestamptz, nullable) — updated each time the user
  connects to this saved channel, used to sort "most recent first"

Unique per (user_id, username) — saving the same channel twice just updates it.

## Security
- RLS enabled. Users can only select/insert/update/delete their own rows.
- A BEFORE INSERT trigger enforces the plan limit:
  - No active row in `user_licenses` (status = 'active') → max 1 saved channel
  - Active license → max 5 saved channels
  This mirrors the same "active license" check already used elsewhere in the
  app (see `user_licenses` table from the auth/licenses migration).
*/

CREATE TABLE IF NOT EXISTS saved_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now(),
  last_connected_at timestamptz,
  CONSTRAINT saved_channels_user_username_unique UNIQUE (user_id, username)
);

ALTER TABLE saved_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_channels_select_own" ON saved_channels;
CREATE POLICY "saved_channels_select_own" ON saved_channels FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_channels_insert_own" ON saved_channels;
CREATE POLICY "saved_channels_insert_own" ON saved_channels FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_channels_update_own" ON saved_channels;
CREATE POLICY "saved_channels_update_own" ON saved_channels FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_channels_delete_own" ON saved_channels;
CREATE POLICY "saved_channels_delete_own" ON saved_channels FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- Enforce the free (1) vs member (5) channel limit server-side
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_saved_channels_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_license boolean;
  max_allowed integer;
  current_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM user_licenses ul
    WHERE ul.user_id = NEW.user_id
      AND ul.status = 'active'
      AND (ul.expires_at IS NULL OR ul.expires_at > now())
  ) INTO has_license;

  max_allowed := CASE WHEN has_license THEN 5 ELSE 1 END;

  SELECT count(*) INTO current_count
  FROM saved_channels
  WHERE user_id = NEW.user_id;

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'saved_channels_limit_reached: % channel(s) max for your plan', max_allowed
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_saved_channels_limit ON saved_channels;
CREATE TRIGGER trg_enforce_saved_channels_limit
  BEFORE INSERT ON saved_channels
  FOR EACH ROW EXECUTE FUNCTION public.enforce_saved_channels_limit();

CREATE INDEX IF NOT EXISTS saved_channels_user_id_idx ON saved_channels (user_id);
