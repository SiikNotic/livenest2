/*
# Fix license expiration + atomic key redemption

## Problem
`user_licenses.status` was only ever checked (and "expired") on the client —
the database row itself never got updated to `status = 'expired'` when
`expires_at` passed. Two consequences:
1. The admin "Licencias" tab showed expired licenses as "Activa" forever.
2. The partial unique index `user_licenses_one_active` (one active row per
   user) kept blocking users from redeeming a new key after their old one
   expired, since the stale row was still `status = 'active'` in the DB —
   so a user's account never actually reverted to a plain "user" state and
   they couldn't renew.

## Fix
1. `expire_stale_licenses()` — flips any `active` row past its `expires_at`
   to `status = 'expired'`. Scheduled with pg_cron to run every 15 minutes
   (if pg_cron isn't available on this project's plan, this part is
   skipped safely — the RPC below self-heals on every redemption anyway).
2. `redeem_license_key(p_key text)` — SECURITY DEFINER RPC that atomically:
   - self-heals (expires) the caller's own stale active license, if any
   - rejects if the caller still has a genuinely active license
   - validates the key is real and available
   - inserts the new `user_licenses` row and marks the key `redeemed`
   This replaces the old client-side "insert then update key" flow, which
   could get out of sync with the license limit trigger and left it
   possible for the app to disagree with the database about license state.
*/

-- ============================================================
-- 1. Expire stale licenses (idempotent, safe to run repeatedly)
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_licenses()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE user_licenses
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();
$$;

-- Schedule it every 15 minutes, if pg_cron is available on this project.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-stale-licenses';
    PERFORM cron.schedule('expire-stale-licenses', '*/15 * * * *', 'SELECT public.expire_stale_licenses();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not enabled on this project — the redeem RPC below still
  -- self-heals on every redemption, so this is a nice-to-have, not required.
  NULL;
END $$;

-- ============================================================
-- 2. Atomic, self-healing key redemption
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_license_key(p_key text)
RETURNS TABLE (license_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_row license_keys%ROWTYPE;
  v_uid uuid := auth.uid();
  v_expires_at timestamptz;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Self-heal: expire the caller's own stale active license first.
  UPDATE user_licenses
  SET status = 'expired', updated_at = now()
  WHERE user_id = v_uid
    AND status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- Reject if a genuinely active (non-expired) license still exists.
  IF EXISTS (
    SELECT 1 FROM user_licenses
    WHERE user_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'already_has_active_license';
  END IF;

  -- Lock and validate the key.
  SELECT * INTO v_key_row
  FROM license_keys
  WHERE key = p_key AND status = 'available'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_or_used_key';
  END IF;

  v_expires_at := CASE
    WHEN v_key_row.duration_days IS NULL THEN NULL
    ELSE now() + (v_key_row.duration_days || ' days')::interval
  END;

  INSERT INTO user_licenses (user_id, license_key_id, source, expires_at, status, auto_renew)
  VALUES (v_uid, v_key_row.id, 'key', v_expires_at, 'active', false)
  RETURNING id INTO v_new_id;

  UPDATE license_keys
  SET status = 'redeemed', redeemed_by = v_uid, redeemed_at = now()
  WHERE id = v_key_row.id;

  RETURN QUERY SELECT v_new_id, v_expires_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_license_key(text) TO authenticated;
