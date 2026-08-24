/*
# Enforce free-vs-member feature limits at the database level

## Problem
Music, custom alert-sound uploads, ElevenLabs/Edge TTS voices, and the extra
appearance themes were only ever restricted in the UI. Any user could still
reach every "member-only" feature by calling Supabase directly (e.g. from the
browser console) with their own session, bypassing the app entirely.

## Fix
1. `has_active_license(uuid)` — reusable helper, true if that user has a
   currently-active (non-expired) row in `user_licenses`.
2. `settings` table: a BEFORE INSERT/UPDATE trigger silently clamps
   `theme` to 'midnight'/'mono' and `voice_provider` to 'browser' for any
   user without an active license — so even a direct API write can't stick.
3. `song_requests` table: a BEFORE INSERT trigger rejects new song requests
   (from the "add song" button AND from the !song chat command, since both
   go through the same insert) unless the account owner has an active
   license.
4. `alert-sounds` storage bucket: the upload (INSERT) policy now also
   requires an active license, so uploading a custom alert sound is blocked
   server-side, not just hidden in the UI.
5. One-time backfill: any existing free-tier user currently sitting on a
   locked theme/voice_provider (from before this restriction existed) gets
   reset now, immediately, without needing to touch the row again.

ElevenLabs/Edge TTS calls themselves (the actual audio generation, which
costs real money per request) are additionally gated inside the tts-proxy
Edge Function itself, using this same has_active_license() check — see the
tts-proxy function update shipped alongside this migration.
*/

-- ============================================================
-- 1. Reusable "does this user have an active license?" check
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_active_license(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_licenses
    WHERE user_id = p_user_id
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_license(uuid) TO authenticated, anon;

-- ============================================================
-- 2. settings: clamp theme + voice_provider for non-members
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_settings_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_active_license(NEW.user_id) THEN
    IF NEW.theme IS NULL OR NEW.theme NOT IN ('midnight', 'mono') THEN
      NEW.theme := 'midnight';
    END IF;
    IF NEW.voice_provider IS DISTINCT FROM 'browser' THEN
      NEW.voice_provider := 'browser';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_settings_plan_limits ON settings;
CREATE TRIGGER trg_enforce_settings_plan_limits
  BEFORE INSERT OR UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_settings_plan_limits();

-- Backfill: fix accounts already sitting on a locked value.
UPDATE settings
SET theme = 'midnight'
WHERE theme NOT IN ('midnight', 'mono')
  AND NOT public.has_active_license(user_id);

UPDATE settings
SET voice_provider = 'browser'
WHERE voice_provider <> 'browser'
  AND NOT public.has_active_license(user_id);

-- ============================================================
-- 3. song_requests: block new requests for non-members
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_song_requests_license()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_active_license(NEW.user_id) THEN
    RAISE EXCEPTION 'music_requires_license: la música es solo para miembros'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_song_requests_license ON song_requests;
CREATE TRIGGER trg_enforce_song_requests_license
  BEFORE INSERT ON song_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_song_requests_license();

-- ============================================================
-- 4. alert-sounds storage: require an active license to upload
-- ============================================================
DROP POLICY IF EXISTS "Users can upload their own alert sounds" ON storage.objects;
CREATE POLICY "Users can upload their own alert sounds"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'alert-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.has_active_license(auth.uid())
  );
