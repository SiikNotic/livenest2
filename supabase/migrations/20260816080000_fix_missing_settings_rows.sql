/*
# Fix missing settings rows (Music, Sounds, Voices, Appearance stuck loading)

## Problem
An earlier security migration (20260730175559_fix_security_issues.sql) made
`settings`, `filters`, and `templates` per-user tables (added a required
`user_id` column + row-level ownership policies). That was the correct
security fix, but nothing was added to actually CREATE a `settings` row for
a user the first time they show up — the original single-tenant app only
ever had one global settings row, which got assigned to the admin account
during that migration. Every other account (any user created after that
migration — including new members) has zero rows in `settings`.

Since `settings` is fetched with `.maybeSingle()` and the Música, Sonidos,
Voces, and Apariencia screens all do `if (!settings) return <loading />`,
those users see those screens stuck loading forever — no error, just an
endless spinner, since RLS correctly (and silently) filters out rows they
don't own instead of returning an error.

The same missing-user_id issue silently breaks creating new filters and
templates (the insert would violate `NOT NULL`/ownership check).

## Fix
1. `ensure_settings()` — SECURITY DEFINER RPC that returns the caller's
   settings row, creating one with sane defaults on first call if missing.
2. Backfill: create a default settings row right now for every existing
   profile that doesn't have one — repairs already-affected accounts the
   moment this migration runs.
3. `user_id` on `filters` and `templates` now defaults to `auth.uid()`, so
   inserting a new filter/template from the client (which doesn't send
   `user_id`) auto-stamps the correct owner instead of failing.
*/

-- ============================================================
-- 1. Auto-provision a settings row for the current user
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_settings()
RETURNS settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row settings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_row FROM settings WHERE user_id = v_uid LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO settings (user_id) VALUES (v_uid)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_settings() TO authenticated;

-- ============================================================
-- 2. Backfill: repair every account currently missing a settings row
-- ============================================================
INSERT INTO public.settings (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.settings s ON s.user_id = p.id
WHERE s.user_id IS NULL;

-- ============================================================
-- 3. Auto-stamp owner on new filters/templates so client inserts
--    (which don't send user_id) work without code changes
-- ============================================================
ALTER TABLE filters ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE templates ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE settings ALTER COLUMN user_id SET DEFAULT auth.uid();
